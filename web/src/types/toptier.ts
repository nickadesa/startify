export interface UserProfile {
  id: string;
  username: string;
  email?: string;
  avatar_color: string;
  bio: string;
  rank_tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Champion' | string;
  rank_division: string;
  rank_points: number;
  xp: number;
  level: number;
  elo: number;
  duel_wins: number;
  duel_losses: number;
  created_at: string;
}

export interface TraderAccount {
  id: string;
  user_id: string;
  mode: 'demo' | 'weekly_ranked' | 'room';
  room_id: string | null;
  starting_balance: number;
  balance: number;
  equity: number;
  peak_equity: number;
  max_drawdown_pct: number;
  trades_count: number;
  wins: number;
  losses: number;
  status: 'active' | 'busted';
  updated_at: string;
}

export interface TraderPosition {
  id: string;
  account_id: string;
  user_id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  order_type: 'market' | 'limit';
  entry_price: number;
  qty: number;
  notional_usd: number;
  leverage: number;
  stop_loss: number | null;
  take_profit: number | null;
  status: 'OPEN' | 'PENDING' | 'CLOSED';
  exit_price: number | null;
  pnl_usd: number;
  opened_at: string;
  closed_at: string | null;
}

export interface WeeklyLeaderboardRow {
  position: number;
  id: string;
  username: string;
  avatar_color: string;
  rank_tier: string;
  rank_division: string;
  rank_points: number;
  level: number;
  xp: number;
  elo: number;
  starting_balance: number;
  equity: number;
  max_drawdown_pct: number;
  trades_count: number;
  wins: number;
  losses: number;
  status: string;
  roi_pct: number;
  qualified: boolean;
}

export interface RoomMember {
  room_id: string;
  user_id: string;
  username: string;
  team: 'A' | 'B';
  is_captain: number;
  avatar_color?: string;
  rank_tier?: string;
  rank_division?: string;
  level?: number;
}

export interface RoomDrawing {
  id: string;
  room_id: string;
  team: 'A' | 'B';
  user_id: string;
  username: string;
  symbol: string;
  tool: string;
  data_json: string;
  created_at: string;
}

export interface RoomProposal {
  id: string;
  room_id: string;
  team: 'A' | 'B';
  proposer_id: string;
  proposer_name: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  order_type: string;
  entry_price: number;
  notional_usd: number;
  leverage: number;
  stop_loss: number | null;
  take_profit: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  voters_json: string;
  expires_at: string;
  created_at: string;
}

export interface RoomMessage {
  id: string;
  room_id: string;
  team: 'A' | 'B';
  user_id: string;
  username: string;
  msg_type: 'chat' | 'system' | 'setup';
  content: string;
  created_at: string;
}

export interface RoomInfo {
  id: string;
  code: string;
  name: string;
  mode: '1v1' | '2v2' | '3v3' | '4v4' | '5v5';
  visibility: 'public' | 'private';
  duration_mins: number;
  starting_balance: number;
  market_scope: string;
  max_leverage: number;
  vote_rule: 'majority' | 'unanimous';
  status: 'waiting' | 'live' | 'finished';
  created_by: string;
  started_at: string | null;
  ends_at: string | null;
  winner_team: string | null;
  members?: RoomMember[];
}

export interface RoomDetailPayload {
  room: RoomInfo;
  members: RoomMember[];
  account_a: TraderAccount | null;
  account_b: TraderAccount | null;
  drawings: RoomDrawing[];
  proposals: RoomProposal[];
  messages: RoomMessage[];
}

export interface TournamentItem {
  id: string;
  title: string;
  description: string;
  status: 'upcoming' | 'live' | 'ended';
  starting_balance: number;
  market_scope: string;
  min_trades: number;
  max_dd_pct: number;
  prize_badge: string;
  starts_at: string;
  ends_at: string;
  participants: number;
  standings: {
    username: string;
    equity: number;
    starting_balance: number;
    trades_count: number;
    max_drawdown_pct: number;
    roi_pct: number;
  }[];
}
