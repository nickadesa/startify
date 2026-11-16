import React, { useEffect, useState } from 'react';
import { Copy, Play, Plus, Swords, Users } from 'lucide-react';
import { RoomInfo } from '../types/toptier';

interface TeamArenaViewProps {
  token: string | null;
  onEnterRoom: (code: string) => void;
  onRequireAuth: () => void;
}

const MODES: ('1v1' | '2v2' | '3v3' | '4v4' | '5v5')[] = ['1v1', '2v2', '3v3', '4v4', '5v5'];

export const TeamArenaView: React.FC<TeamArenaViewProps> = ({ token, onEnterRoom, onRequireAuth }) => {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('TOPTIER Squad Battle');
  const [mode, setMode] = useState<'1v1' | '2v2' | '3v3' | '4v4' | '5v5'>('2v2');
  const [duration, setDuration] = useState(60);
  const [voteRule, setVoteRule] = useState<'majority' | 'unanimous'>('majority');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [error, setError] = useState<string | null>(null);

  const loadRooms = async () => {
    const res = await fetch('/api/rooms');
    if (res.ok) {
      const data = await res.json();
      setRooms(data.rooms || []);
    }
  };

  useEffect(() => {
    loadRooms();
    const t = setInterval(loadRooms, 10000);
    return () => clearInterval(t);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      onRequireAuth();
      return;
    }
    setError(null);
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: roomName,
        mode,
        visibility,
        duration_mins: duration,
        starting_balance: 10000,
        market_scope: 'All Markets',
        max_leverage: 50,
        vote_rule: voteRule,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || 'Failed to create room');
      return;
    }
    setShowCreate(false);
    onEnterRoom(data.room.code);
  };

  const handleJoin = async (code: string) => {
    if (!token) {
      onRequireAuth();
      return;
    }
    setError(null);
    const res = await fetch('/api/rooms/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.detail || 'Could not join room');
      return;
    }
    onEnterRoom(data.room.code);
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-5">
      {/* Hero Banner */}
      <div className="tt-card p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 text-sky-500 px-3 py-1 text-[0.75rem] font-semibold">
            <Swords className="w-3.5 h-3.5" /> 1v1 to 5v5 Team Arenas
          </div>
          <h1 className="text-[1.375rem] font-bold tracking-tight">Collaborative Team Trading Battles</h1>
          <p className="text-[0.8125rem] text-[var(--text-secondary)]">
            Draw on the exact same chart with teammates, vote before executing team trades, and coordinate live via Voice & Text Chat.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] pl-3 pr-1 py-1">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Room Code (e.g. DUO2V2)"
              className="bg-transparent text-[0.75rem] w-36 outline-none uppercase"
            />
            <button
              onClick={() => joinCode && handleJoin(joinCode)}
              className="px-3 py-1 rounded-full bg-[var(--text-primary)] text-[var(--bg-card)] text-[0.75rem] font-semibold cursor-pointer"
            >
              Join
            </button>
          </div>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-500 text-white text-[0.8125rem] font-semibold cursor-pointer hover:bg-emerald-600"
          >
            <Plus className="w-4 h-4" /> Create Room
          </button>
        </div>
      </div>

      {error && <div className="tt-card p-3 text-[0.8125rem] text-rose-500 border-rose-500/40">{error}</div>}

      {/* Create Room Form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="tt-card p-5 space-y-4">
          <h3 className="text-[0.9375rem] font-bold">Configure Arena Room</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[0.8125rem]">
            <div>
              <label className="block text-[0.75rem] text-[var(--text-secondary)] mb-1">Room Name</label>
              <input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] outline-none"
              />
            </div>
            <div>
              <label className="block text-[0.75rem] text-[var(--text-secondary)] mb-1">Team Size</label>
              <div className="grid grid-cols-5 gap-1">
                {MODES.map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setMode(m)}
                    className={`py-2 rounded-lg text-[0.75rem] font-semibold cursor-pointer ${
                      mode === m ? 'bg-[var(--text-primary)] text-[var(--bg-card)]' : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[0.75rem] text-[var(--text-secondary)] mb-1">Duration & Vote Rule</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="px-2 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)]"
                >
                  <option value={15}>15m Blitz</option>
                  <option value={60}>1H Sprint</option>
                  <option value={240}>4H Session</option>
                  <option value={1440}>24H Day</option>
                </select>
                <select
                  value={voteRule}
                  onChange={(e) => setVoteRule(e.target.value as 'majority' | 'unanimous')}
                  className="px-2 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)]"
                >
                  <option value="majority">Majority Vote</option>
                  <option value="unanimous">100% Unanimous</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[0.75rem] text-[var(--text-secondary)] mb-1">Visibility</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility('public')}
                  className={`py-2 rounded-lg text-[0.75rem] font-semibold cursor-pointer ${
                    visibility === 'public' ? 'bg-[var(--text-primary)] text-[var(--bg-card)]' : 'bg-[var(--bg-subtle)]'
                  }`}
                >
                  Public Match
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility('private')}
                  className={`py-2 rounded-lg text-[0.75rem] font-semibold cursor-pointer ${
                    visibility === 'private' ? 'bg-[var(--text-primary)] text-[var(--bg-card)]' : 'bg-[var(--bg-subtle)]'
                  }`}
                >
                  Friends Only
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-full border border-[var(--border-subtle)] text-[0.8125rem] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-full bg-emerald-500 text-white text-[0.8125rem] font-semibold cursor-pointer"
            >
              Launch Arena & Enter
            </button>
          </div>
        </form>
      )}

      {/* Open Rooms Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rooms.map((r) => {
          const teamSize = Number(r.mode[0]);
          const maxPlayers = teamSize * 2;
          const count = r.members?.length || 1;
          return (
            <div key={r.id} className="tt-card p-5 flex flex-col justify-between gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[var(--text-primary)] text-[var(--bg-card)] px-2.5 py-0.5 text-[0.6875rem] font-bold">
                      {r.mode}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${
                        r.status === 'live' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'
                      }`}
                    >
                      {r.status.toUpperCase()}
                    </span>
                    <span className="text-[0.6875rem] text-[var(--text-secondary)]">{r.vote_rule} vote</span>
                  </div>
                  <h3 className="text-[1rem] font-bold mt-2">{r.name}</h3>
                  <div className="text-[0.75rem] text-[var(--text-secondary)] mt-0.5">
                    {r.duration_mins}m · ${r.starting_balance.toLocaleString()} · {r.market_scope}
                  </div>
                </div>
                <button
                  onClick={() => navigator.clipboard?.writeText(r.code)}
                  title="Copy Room Code"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-subtle)] text-[0.75rem] font-mono font-semibold cursor-pointer"
                >
                  {r.code} <Copy className="w-3 h-3" />
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
                <div className="flex items-center gap-1.5 text-[0.75rem] text-[var(--text-secondary)]">
                  <Users className="w-4 h-4" />
                  <span>
                    {count}/{maxPlayers} Traders
                  </span>
                </div>
                <button
                  onClick={() => handleJoin(r.code)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[var(--text-primary)] text-[var(--bg-card)] text-[0.75rem] font-semibold cursor-pointer hover:opacity-90"
                >
                  <Play className="w-3.5 h-3.5" /> Enter Arena
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
