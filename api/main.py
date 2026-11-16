import json
import mimetypes
import re
import secrets
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from pydantic import BaseModel

from api.competition_engine import (
    close_position,
    create_room,
    ensure_seeded,
    get_historical_replay_session,
    get_profile,
    get_room_detail,
    get_user_by_token,
    get_weekly_leaderboard,
    join_room,
    login_user,
    oauth_login_or_register,
    place_order,
    propose_team_trade,
    register_user,
    toggle_follow,
    update_position_sl_tp,
    utc_iso,
    vote_team_proposal,
)
from data.orderflow_provider import OrderflowProvider
from db.database import BASE_DIR, query_all, query_one

app = FastAPI(
    title="TOPTIERclub — Trading Competition Platform API",
    version="4.0.0",
    description="Competitive Demo Trading, Weekly $10K Ranked Seasons (Bronze-Champion), 1v1 to 5v5 Team Arenas with Shared Charts, Trade Voting, Chat & WebRTC Voice.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WEB_DIST_DIR = BASE_DIR / "web" / "dist"
_CACHED_INLINED_HTML: Optional[str] = None
_ORDERFLOW = OrderflowProvider()


def get_inlined_spa_html() -> str:
    global _CACHED_INLINED_HTML
    if _CACHED_INLINED_HTML:
        return _CACHED_INLINED_HTML
    index_file = WEB_DIST_DIR / "index.html"
    if not index_file.exists():
        return (
            "<!doctype html><html style='background:#0B0D12;color:#F3F4F6;'>"
            "<body style='font-family:Inter,sans-serif;padding:2rem;'>"
            "<h1>TOPTIERclub</h1><p>Frontend bundle not built yet. Run <code>npm --prefix web run build</code>.</p>"
            "</body></html>"
        )
    html = index_file.read_text(encoding="utf-8")

    def _replace_css(match: re.Match) -> str:
        href = match.group(1).lstrip("/")
        css_path = WEB_DIST_DIR / href
        if css_path.exists() and css_path.is_file():
            return f"<style>{css_path.read_text(encoding='utf-8')}</style>"
        return match.group(0)

    html = re.sub(r'<link[^>]+rel=["\']stylesheet["\'][^>]+href=["\']([^"\']+)["\'][^>]*/?>', _replace_css, html)

    def _replace_js(match: re.Match) -> str:
        src = match.group(1).lstrip("/")
        js_path = WEB_DIST_DIR / src
        if js_path.exists() and js_path.is_file():
            safe_js = js_path.read_text(encoding="utf-8").replace("</script>", "<\\/script>")
            return f'<script type="module">{safe_js}</script>'
        return match.group(0)

    html = re.sub(r'<script[^>]+src=["\'](/assets/[^"\']+\.js)["\'][^>]*>\s*</script>', _replace_js, html)
    _CACHED_INLINED_HTML = html
    return html


# --- Pydantic Schemas ---
class RegisterReq(BaseModel):
    username: str
    email: str
    password: str


class LoginReq(BaseModel):
    identifier: str
    password: str


class OrderReq(BaseModel):
    account_id: str
    symbol: str
    side: str
    order_type: str = "market"
    entry_price: float
    notional_usd: float
    leverage: int = 25
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None


class ClosePosReq(BaseModel):
    exit_price: float


class UpdateSlTpReq(BaseModel):
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None


class RoomCreateReq(BaseModel):
    name: str = "TOPTIER Arena"
    mode: str = "1v1"
    visibility: str = "public"
    duration_mins: int = 60
    starting_balance: float = 10000.0
    market_scope: str = "All Markets"
    max_leverage: int = 50
    vote_rule: str = "majority"


class RoomJoinReq(BaseModel):
    code: str
    team: Optional[str] = None


class DrawingReq(BaseModel):
    symbol: str
    tool: str
    data: Dict[str, Any]


class ProposeTradeReq(BaseModel):
    symbol: str
    side: str
    order_type: str = "market"
    entry_price: float
    notional_usd: float
    leverage: int = 25
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None


class VoteReq(BaseModel):
    proposal_id: str
    vote: str


class MessageReq(BaseModel):
    content: str
    msg_type: str = "chat"


class RtcSignalReq(BaseModel):
    to_user_id: str
    signal_type: str
    payload: Dict[str, Any]


def _require_user(conn, authorization: Optional[str]) -> Dict[str, Any]:
    user = get_user_by_token(conn, authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


# --- Health & Market Data ---
@app.get("/api/health")
def get_health() -> Dict[str, Any]:
    conn = ensure_seeded()
    users_cnt = query_one(conn, "SELECT COUNT(*) as c FROM users")["c"]
    rooms_cnt = query_one(conn, "SELECT COUNT(*) as c FROM rooms")["c"]
    return {
        "status": "healthy",
        "brand": "TOPTIERclub",
        "version": "4.0.0",
        "traders_count": users_cnt,
        "rooms_count": rooms_cnt,
    }


@app.get("/api/markets/overview")
def get_markets_overview() -> Dict[str, Any]:
    return {"markets": _ORDERFLOW.get_markets_overview()}


@app.get("/api/klines")
def get_klines(interval: str = "M15", limit: int = 120, symbol: str = "XAUUSD") -> Dict[str, Any]:
    candles = _ORDERFLOW.get_live_klines(interval=interval, limit=limit, symbol=symbol)
    return {"symbol": symbol.upper(), "interval": interval.upper(), "candles": candles}


@app.get("/api/replay/session")
def api_replay_session(symbol: str = "XAUUSD", seed: Optional[str] = None) -> Dict[str, Any]:
    return get_historical_replay_session(symbol=symbol, seed_date=seed)


@app.get("/api/orderflow/live")
def get_orderflow_live(symbol: str = "XAUUSD") -> Dict[str, Any]:
    return _ORDERFLOW.get_live_orderflow()


# --- Auth & Social Profile ---
@app.post("/api/auth/oauth/demo")
def api_oauth_demo(body: Dict[str, Any]) -> Dict[str, Any]:
    conn = ensure_seeded()
    provider = str(body.get("provider", "google")).lower()
    return oauth_login_or_register(
        conn,
        provider,
        str(body.get("email", f"{provider}_user@toptier.club")),
        str(body.get("display_name", f"{provider}_trader")),
    )


@app.post("/api/auth/register")
def api_register(req: RegisterReq) -> Dict[str, Any]:
    conn = ensure_seeded()
    try:
        return register_user(conn, req.username, req.email, req.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/auth/login")
def api_login(req: LoginReq) -> Dict[str, Any]:
    conn = ensure_seeded()
    try:
        return login_user(conn, req.identifier, req.password)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@app.get("/api/auth/me")
def api_me(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    conn = ensure_seeded()
    user = _require_user(conn, authorization)
    accounts = query_all(conn, "SELECT * FROM accounts WHERE user_id = ?", (user["id"],))
    positions = query_all(conn, "SELECT * FROM positions WHERE user_id = ? ORDER BY opened_at DESC LIMIT 50", (user["id"],))
    return {"user": user, "accounts": accounts, "positions": positions}


@app.get("/api/profile/{username}")
def api_profile(username: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    conn = ensure_seeded()
    viewer = get_user_by_token(conn, authorization)
    prof = get_profile(conn, username, viewer["id"] if viewer else None)
    if not prof:
        raise HTTPException(status_code=404, detail="Trader not found")
    return prof


@app.post("/api/follow/{username}")
def api_follow(username: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    conn = ensure_seeded()
    user = _require_user(conn, authorization)
    try:
        return toggle_follow(conn, user["id"], username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Accounts & Trading ---
@app.post("/api/orders")
def api_place_order(req: OrderReq, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    conn = ensure_seeded()
    user = _require_user(conn, authorization)
    try:
        pos = place_order(
            conn, user["id"], req.account_id, req.symbol, req.side, req.order_type,
            req.entry_price, req.notional_usd, req.leverage, req.stop_loss, req.take_profit,
        )
        accounts = query_all(conn, "SELECT * FROM accounts WHERE user_id = ?", (user["id"],))
        return {"position": pos, "accounts": accounts}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/positions/{position_id}/close")
def api_close_pos(position_id: str, req: ClosePosReq, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    conn = ensure_seeded()
    user = _require_user(conn, authorization)
    try:
        pos = close_position(conn, user["id"], position_id, req.exit_price)
        accounts = query_all(conn, "SELECT * FROM accounts WHERE user_id = ?", (user["id"],))
        updated_user = get_user_by_token(conn, authorization)
        return {"position": pos, "accounts": accounts, "user": updated_user}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.patch("/api/positions/{position_id}")
def api_update_pos(position_id: str, req: UpdateSlTpReq, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    conn = ensure_seeded()
    _require_user(conn, authorization)
    return {"position": update_position_sl_tp(conn, position_id, req.stop_loss, req.take_profit)}


@app.post("/api/accounts/{account_id}/reset")
def api_reset_account(account_id: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    conn = ensure_seeded()
    user = _require_user(conn, authorization)
    acc = query_one(conn, "SELECT * FROM accounts WHERE id = ? AND user_id = ?", (account_id, user["id"]))
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    if acc["mode"] != "demo":
        raise HTTPException(status_code=400, detail="Only Demo accounts can be reset mid-week")
    conn.execute("UPDATE positions SET status = 'CLOSED', closed_at = ? WHERE account_id = ? AND status != 'CLOSED'", (utc_iso(), account_id))
    conn.execute(
        "UPDATE accounts SET balance = 10000.0, equity = 10000.0, peak_equity = 10000.0, max_drawdown_pct = 0.0, trades_count = 0, wins = 0, losses = 0, status = 'active', updated_at = ? WHERE id = ?",
        (utc_iso(), account_id),
    )
    conn.commit()
    return {"account": query_one(conn, "SELECT * FROM accounts WHERE id = ?", (account_id,))}


# --- Weekly Ranked & Tournaments ---
@app.get("/api/leaderboard/weekly")
def api_weekly_leaderboard(tier: str = "ALL") -> Dict[str, Any]:
    conn = ensure_seeded()
    return {"leaderboard": get_weekly_leaderboard(conn, tier)}


@app.get("/api/tournaments")
def api_tournaments() -> Dict[str, Any]:
    conn = ensure_seeded()
    tourneys = query_all(conn, "SELECT * FROM tournaments ORDER BY status DESC, starts_at ASC")
    for t in tourneys:
        entries = query_all(
            conn,
            """SELECT te.username, a.equity, a.starting_balance, a.trades_count, a.max_drawdown_pct,
                      ROUND(((a.equity - a.starting_balance) / a.starting_balance) * 100.0, 2) as roi_pct
               FROM tournament_entries te
               JOIN accounts a ON te.account_id = a.id
               WHERE te.tournament_id = ?
               ORDER BY roi_pct DESC""",
            (t["id"],),
        )
        t["participants"] = len(entries)
        t["standings"] = entries
    return {"tournaments": tourneys}


@app.post("/api/tournaments/{tid}/join")
def api_join_tournament(tid: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    conn = ensure_seeded()
    user = _require_user(conn, authorization)
    t = query_one(conn, "SELECT * FROM tournaments WHERE id = ?", (tid,))
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    acc = query_one(conn, "SELECT * FROM accounts WHERE user_id = ? AND mode = 'weekly_ranked'", (user["id"],))
    conn.execute(
        "INSERT OR IGNORE INTO tournament_entries VALUES (?, ?, ?, ?, ?)",
        (tid, user["id"], user["username"], acc["id"], utc_iso()),
    )
    conn.commit()
    return {"joined": True, "tournament_id": tid}


# --- Team Rooms (1v1 to 5v5) ---
@app.get("/api/rooms")
def api_list_rooms() -> Dict[str, Any]:
    conn = ensure_seeded()
    rooms = query_all(conn, "SELECT * FROM rooms WHERE visibility = 'public' ORDER BY created_at DESC LIMIT 30")
    for r in rooms:
        members = query_all(conn, "SELECT user_id, username, team, is_captain FROM room_members WHERE room_id = ?", (r["id"],))
        r["members"] = members
    return {"rooms": rooms}


@app.post("/api/rooms")
def api_create_room(req: RoomCreateReq, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    conn = ensure_seeded()
    user = _require_user(conn, authorization)
    return create_room(conn, user, req.name, req.mode, req.visibility, req.duration_mins, req.starting_balance, req.market_scope, req.max_leverage, req.vote_rule)


@app.post("/api/rooms/join")
def api_join_room(req: RoomJoinReq, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    conn = ensure_seeded()
    user = _require_user(conn, authorization)
    try:
        return join_room(conn, user, req.code, req.team)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/rooms/{code}")
def api_get_room(code: str) -> Dict[str, Any]:
    conn = ensure_seeded()
    detail = get_room_detail(conn, code)
    if not detail:
        raise HTTPException(status_code=404, detail="Room not found")
    return detail


@app.post("/api/rooms/{code}/drawings")
def api_add_drawing(code: str, req: DrawingReq, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    conn = ensure_seeded()
    user = _require_user(conn, authorization)
    room = query_one(conn, "SELECT * FROM rooms WHERE UPPER(code) = ?", (code.upper(),))
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    member = query_one(conn, "SELECT team FROM room_members WHERE room_id = ? AND user_id = ?", (room["id"], user["id"]))
    team = member["team"] if member else "A"
    did = f"drw_{secrets.token_hex(5)}"
    conn.execute(
        "INSERT INTO room_drawings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (did, room["id"], team, user["id"], user["username"], req.symbol.upper(), req.tool, json.dumps(req.data), utc_iso()),
    )
    conn.commit()
    return {"id": did, "drawings": query_all(conn, "SELECT * FROM room_drawings WHERE room_id = ? ORDER BY created_at ASC", (room["id"],))}


@app.delete("/api/rooms/{code}/drawings/{drawing_id}")
def api_del_drawing(code: str, drawing_id: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    conn = ensure_seeded()
    _require_user(conn, authorization)
    conn.execute("DELETE FROM room_drawings WHERE id = ?", (drawing_id,))
    conn.commit()
    return {"deleted": True}


@app.post("/api/rooms/{code}/propose")
def api_propose_trade(code: str, req: ProposeTradeReq, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    conn = ensure_seeded()
    user = _require_user(conn, authorization)
    try:
        return propose_team_trade(conn, user, code, req.symbol, req.side, req.order_type, req.entry_price, req.notional_usd, req.leverage, req.stop_loss, req.take_profit)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/rooms/{code}/vote")
def api_vote_trade(code: str, req: VoteReq, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    conn = ensure_seeded()
    user = _require_user(conn, authorization)
    try:
        return vote_team_proposal(conn, user, req.proposal_id, req.vote)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/rooms/{code}/messages")
def api_post_message(code: str, req: MessageReq, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    conn = ensure_seeded()
    user = _require_user(conn, authorization)
    room = query_one(conn, "SELECT * FROM rooms WHERE UPPER(code) = ?", (code.upper(),))
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    member = query_one(conn, "SELECT team FROM room_members WHERE room_id = ? AND user_id = ?", (room["id"], user["id"]))
    team = member["team"] if member else "A"
    mid = f"msg_{secrets.token_hex(5)}"
    conn.execute("INSERT INTO room_messages VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (mid, room["id"], team, user["id"], user["username"], req.msg_type, req.content, utc_iso()))
    conn.commit()
    return {"id": mid}


@app.post("/api/rooms/{code}/rtc")
def api_post_rtc(code: str, req: RtcSignalReq, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    conn = ensure_seeded()
    user = _require_user(conn, authorization)
    room = query_one(conn, "SELECT * FROM rooms WHERE UPPER(code) = ?", (code.upper(),))
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    member = query_one(conn, "SELECT team FROM room_members WHERE room_id = ? AND user_id = ?", (room["id"], user["id"]))
    team = member["team"] if member else "A"
    sid = f"rtc_{secrets.token_hex(5)}"
    conn.execute(
        "INSERT INTO room_rtc_signals VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (sid, room["id"], team, user["id"], req.to_user_id, req.signal_type, json.dumps(req.payload), utc_iso()),
    )
    conn.commit()
    return {"sent": True, "id": sid}


@app.get("/api/rooms/{code}/rtc")
def api_get_rtc(code: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    conn = ensure_seeded()
    user = _require_user(conn, authorization)
    room = query_one(conn, "SELECT * FROM rooms WHERE UPPER(code) = ?", (code.upper(),))
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    signals = query_all(
        conn,
        "SELECT * FROM room_rtc_signals WHERE room_id = ? AND to_user_id = ? ORDER BY created_at ASC LIMIT 30",
        (room["id"], user["id"]),
    )
    if signals:
        ids = [s["id"] for s in signals]
        placeholders = ",".join("?" for _ in ids)
        conn.execute(f"DELETE FROM room_rtc_signals WHERE id IN ({placeholders})", tuple(ids))
        conn.commit()
    return {"signals": signals}


# --- Static & Vercel Rewrite Entrypoint ---
@app.get("/assets/{asset_path:path}")
def serve_assets(asset_path: str):
    file_path = WEB_DIST_DIR / "assets" / asset_path
    if file_path.exists() and file_path.is_file():
        mime_type, _ = mimetypes.guess_type(str(file_path))
        return FileResponse(str(file_path), media_type=mime_type or "application/octet-stream")
    return JSONResponse({"error": "Asset not found"}, status_code=404)


@app.api_route("/", methods=["GET", "POST", "PATCH", "DELETE"])
async def serve_spa_or_vercel_rewrite(
    request: Request,
    __api: Optional[str] = Query(default=None),
    __asset: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
):
    if __asset:
        return serve_assets(__asset)

    if __api:
        api_path = __api.strip("/")
        body: Dict[str, Any] = {}
        if request.method in ("POST", "PATCH"):
            try:
                body = await request.json()
            except Exception:
                body = {}
        qp = request.query_params
        if api_path == "health":
            return get_health()
        if api_path == "markets/overview":
            return get_markets_overview()
        if api_path == "klines":
            return get_klines(qp.get("interval", "M15"), int(qp.get("limit", "120")), qp.get("symbol", "XAUUSD"))
        if api_path == "replay/session":
            return get_historical_replay_session(qp.get("symbol", "XAUUSD"), qp.get("seed"))
        if api_path == "orderflow/live":
            return get_orderflow_live(qp.get("symbol", "XAUUSD"))
        if api_path == "auth/register" and request.method == "POST":
            return api_register(RegisterReq(**body))
        if api_path == "auth/login" and request.method == "POST":
            return api_login(LoginReq(**body))
        if api_path == "auth/oauth/demo" and request.method == "POST":
            conn = ensure_seeded()
            provider = str(body.get("provider", "google")).lower()
            return oauth_login_or_register(
                conn,
                provider,
                body.get("email", f"{provider}_user@toptier.club"),
                body.get("display_name", f"{provider}_trader"),
            )
        if api_path == "auth/me":
            return api_me(authorization)
        if api_path.startswith("profile/"):
            return api_profile(api_path.split("/", 1)[1], authorization)
        if api_path.startswith("follow/") and request.method == "POST":
            return api_follow(api_path.split("/", 1)[1], authorization)
        if api_path == "orders" and request.method == "POST":
            return api_place_order(OrderReq(**body), authorization)
        if api_path.startswith("positions/") and api_path.endswith("/close") and request.method == "POST":
            pid = api_path.split("/")[1]
            return api_close_pos(pid, ClosePosReq(**body), authorization)
        if api_path.startswith("positions/") and request.method == "PATCH":
            pid = api_path.split("/")[1]
            return api_update_pos(pid, UpdateSlTpReq(**body), authorization)
        if api_path.startswith("accounts/") and api_path.endswith("/reset") and request.method == "POST":
            aid = api_path.split("/")[1]
            return api_reset_account(aid, authorization)
        if api_path == "leaderboard/weekly":
            return api_weekly_leaderboard(qp.get("tier", "ALL"))
        if api_path == "tournaments":
            return api_tournaments()
        if api_path.startswith("tournaments/") and api_path.endswith("/join") and request.method == "POST":
            tid = api_path.split("/")[1]
            return api_join_tournament(tid, authorization)
        if api_path == "rooms" and request.method == "GET":
            return api_list_rooms()
        if api_path == "rooms" and request.method == "POST":
            return api_create_room(RoomCreateReq(**body), authorization)
        if api_path == "rooms/join" and request.method == "POST":
            return api_join_room(RoomJoinReq(**body), authorization)
        if api_path.startswith("rooms/"):
            parts = api_path.split("/")
            code = parts[1]
            if len(parts) == 2:
                return api_get_room(code)
            sub = parts[2]
            if sub == "drawings" and request.method == "POST":
                return api_add_drawing(code, DrawingReq(**body), authorization)
            if sub == "drawings" and len(parts) == 4 and request.method == "DELETE":
                return api_del_drawing(code, parts[3], authorization)
            if sub == "propose" and request.method == "POST":
                return api_propose_trade(code, ProposeTradeReq(**body), authorization)
            if sub == "vote" and request.method == "POST":
                return api_vote_trade(code, VoteReq(**body), authorization)
            if sub == "messages" and request.method == "POST":
                return api_post_message(code, MessageReq(**body), authorization)
            if sub == "rtc" and request.method == "POST":
                return api_post_rtc(code, RtcSignalReq(**body), authorization)
            if sub == "rtc" and request.method == "GET":
                return api_get_rtc(code, authorization)
        return JSONResponse({"error": f"Unknown API route: {api_path}"}, status_code=404)

    return HTMLResponse(get_inlined_spa_html())


@app.api_route("/{full_path:path}", methods=["GET", "POST", "PATCH", "DELETE"])
async def serve_spa_catchall(
    full_path: str,
    request: Request,
    __api: Optional[str] = Query(default=None),
    __asset: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
):
    return await serve_spa_or_vercel_rewrite(request=request, __api=__api, __asset=__asset, authorization=authorization)

