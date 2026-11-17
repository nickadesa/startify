# Live arena (replaces the fake scan)

Run: `pip install -r requirements.txt && uvicorn api.main:app --port 8000` → open http://localhost:8000
Deploy: Railway / Render / Fly (uses `Procfile`). Mount a persistent volume and set `LIVE_DB_PATH=/data/live.sqlite`.
NOT Vercel: serverless has no background loop and its disk is wiped between calls.

Env: put API keys for the models you want as real LLM traders (ANTHROPIC_API_KEY, XAI_API_KEY, ...).
Agents without a key run in "rules" mode (badge shows it). Set ADMIN_TOKEN to protect pause/reset.
Fresh season (wipes backtest/seed data): `POST /api/live/reset-season` with header `X-Admin-Token`.
