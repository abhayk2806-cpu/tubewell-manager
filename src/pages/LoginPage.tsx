import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

const LoginPage: React.FC = () => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email aur password dono bharo');
      return;
    }
    setLoading(true);
    setError('');
    const { error } = await signIn(email, password);
    if (error) {
      setError('Login fail hua. Email ya password galat hai.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f7f5f2' }}>
      <div className="w-full max-w-sm mx-4">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Tubewell Manager</h1>
          <p className="text-gray-500 mt-1 text-sm">Pani aur Paisa — sab record mein</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border" style={{ borderColor: '#e5e2dc' }}>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="apna@email.com"
                className="w-full px-4 py-3 rounded-xl border text-base outline-none transition-all focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: '#e5e2dc', background: '#fafaf9' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border text-base outline-none transition-all focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: '#e5e2dc', background: '#fafaf9' }}
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold text-base transition-all active:scale-95 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
            >
              {loading ? 'Login ho raha hai...' : 'Login karo'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Naya account chahiye? Admin se sampark karo.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
