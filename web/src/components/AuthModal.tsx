import React, { useState } from 'react';
import { Lock, Mail, User, X } from 'lucide-react';
import { UserProfile } from '../types/toptier';

interface AuthModalProps {
  onClose: () => void;
  onSuccess: (token: string, user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose, onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const url = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        mode === 'login'
          ? { identifier: username || email, password }
          : { username, email, password };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Authentication failed');
      onSuccess(data.token, data.user);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'discord') => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/oauth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          email: `${provider}_trader@toptier.club`,
          display_name: `${provider}_trader`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `${provider} login failed`);
      onSuccess(data.token, data.user);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'OAuth login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'siam_pro', password: 'TopTier2026!' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Demo login failed');
      onSuccess(data.token, data.user);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="tt-card w-full max-w-md p-6 space-y-4 shadow-2xl rounded-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[1.125rem] font-bold tracking-tight">
              {mode === 'login' ? 'Sign in to TOPTIERclub' : 'Create Trader Account'}
            </h2>
            <p className="text-[0.75rem] text-[var(--text-secondary)]">
              Compete in Weekly $10K Ranked, 10m Replay & 1v1–5v5 Arenas
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Google & Discord OAuth Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => handleOAuth('google')}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:opacity-90 text-[0.8125rem] font-semibold cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.54-5.17 3.54-8.97z" />
              <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96h-4.01v3.14C3.515 21.3 7.565 24 12.255 24z" />
              <path fill="#FBBC05" d="M5.535 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62h-4.01a11.74 11.74 0 0 0 0 10.76l4.01-3.14z" />
              <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0 7.565 0 3.515 2.7 1.525 6.62l4.01 3.14c.95-2.85 3.6-4.96 6.72-4.96z" />
            </svg>
            Google
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleOAuth('discord')}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-[var(--border-subtle)] bg-[#5865F2]/15 text-[#5865F2] hover:bg-[#5865F2]/25 text-[0.8125rem] font-semibold cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z" />
            </svg>
            Discord
          </button>
        </div>

        <div className="flex items-center gap-2 text-[0.6875rem] text-[var(--text-secondary)]">
          <div className="flex-1 h-[1px] bg-[var(--border-subtle)]" />
          <span>OR CONTINUE WITH EMAIL</span>
          <div className="flex-1 h-[1px] bg-[var(--border-subtle)]" />
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[var(--bg-subtle)]">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`py-1.5 rounded-md text-[0.8125rem] font-medium cursor-pointer ${
              mode === 'login' ? 'bg-[var(--bg-card)] shadow-xs text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
            }`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`py-1.5 rounded-md text-[0.8125rem] font-medium cursor-pointer ${
              mode === 'register' ? 'bg-[var(--bg-card)] shadow-xs text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
            }`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[0.75rem] font-medium text-[var(--text-secondary)] mb-1">
              {mode === 'login' ? 'Username or Email' : 'Username'}
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-secondary)]" />
              <input
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={mode === 'login' ? 'siam_pro or email' : 'your_username'}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[0.8125rem] outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-[0.75rem] font-medium text-[var(--text-secondary)] mb-1">Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-secondary)]" />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="trader@toptier.club"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[0.8125rem] outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[0.75rem] font-medium text-[var(--text-secondary)] mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-secondary)]" />
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[0.8125rem] outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {error && <p className="text-[0.75rem] text-rose-500 font-medium">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-full bg-[var(--text-primary)] text-[var(--bg-card)] text-[0.875rem] font-semibold cursor-pointer hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account & Get $10,000 Demo'}
          </button>
        </form>

        <div className="pt-2 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={handleQuickDemo}
            disabled={loading}
            className="w-full py-2 rounded-full border border-[var(--border-subtle)] text-[0.75rem] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            Quick Demo Login as @siam_pro (Gold / Lv.4)
          </button>
        </div>
      </div>
    </div>
  );
};
