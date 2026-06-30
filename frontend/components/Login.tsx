import { useState } from 'react';
import { Eye, EyeOff, Lock, User, AlertCircle } from 'lucide-react';
import { apiClient } from '../utils/api';

interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const normalizedError = error.trim().toLowerCase();
  const showError = Boolean(error);
  const isCredentialError =
    normalizedError.includes('invalid credential') ||
    normalizedError.includes('invalid username or password');
  const errorTitle = isCredentialError ? 'Incorrect username or password' : 'Unable to sign in';
  const errorMessage = isCredentialError
    ? 'Please verify your login details and try again.'
    : error;

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (error) setError('');
    setUsername(e.target.value);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (error) setError('');
    setPassword(e.target.value);
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.login(username, password);
      if (response.token) {
        onLogin();
        return;
      }
      setError('Unexpected login response');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #000e9c 0%, #002dbe 100%)' }}
    >
      <div className="w-full max-w-md">
        {/* Logo above card */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <img
            src="/OVHcloud_Game_Panel_Logo.png"
            alt="OVHcloud Game Panel"
            className="h-14 w-auto object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Sign in to manage your game servers
          </p>
        </div>

        {/* Card */}
        <div
          className="overflow-hidden rounded-2xl shadow-2xl"
          style={{ border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Form body */}
          <div className="bg-white px-8 py-8">
            <form onSubmit={handleCredentialsSubmit} className="space-y-5">
              {showError && (
                <div
                  className="flex items-start gap-3 rounded-lg p-3"
                  style={{ background: '#fff5f5', border: '1px solid #fecaca' }}
                >
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" style={{ color: '#ef4444' }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#991b1b' }}>{errorTitle}</p>
                    <p className="mt-0.5 text-sm" style={{ color: '#b91c1c' }}>{errorMessage}</p>
                  </div>
                </div>
              )}

              {/* Username */}
              <div className="space-y-1.5">
                <label htmlFor="username" className="block text-sm font-medium" style={{ color: '#1e293b' }}>
                  Username
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <User className="h-4 w-4" style={{ color: '#94a3b8' }} />
                  </div>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={handleUsernameChange}
                    placeholder="Enter your username"
                    autoComplete="username"
                    className="w-full rounded-lg py-2.5 pl-9 pr-4 text-sm transition-all focus:outline-none"
                    style={{
                      background: showError ? '#fff5f5' : '#f8fafc',
                      border: `1px solid ${showError ? '#fca5a5' : '#cbd5e1'}`,
                      color: '#0f172a',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = showError ? '#f87171' : '#0050d7';
                      e.currentTarget.style.boxShadow = showError
                        ? '0 0 0 3px rgba(239,68,68,0.12)'
                        : '0 0 0 3px rgba(0,80,215,0.12)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = showError ? '#fca5a5' : '#cbd5e1';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium" style={{ color: '#1e293b' }}>
                  Password
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Lock className="h-4 w-4" style={{ color: '#94a3b8' }} />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={handlePasswordChange}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="w-full rounded-lg py-2.5 pl-9 pr-10 text-sm transition-all focus:outline-none"
                    style={{
                      background: showError ? '#fff5f5' : '#f8fafc',
                      border: `1px solid ${showError ? '#fca5a5' : '#cbd5e1'}`,
                      color: '#0f172a',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = showError ? '#f87171' : '#0050d7';
                      e.currentTarget.style.boxShadow = showError
                        ? '0 0 0 3px rgba(239,68,68,0.12)'
                        : '0 0 0 3px rgba(0,80,215,0.12)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = showError ? '#fca5a5' : '#cbd5e1';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 transition-colors"
                    style={{ color: '#94a3b8', background: 'transparent', border: 'none' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#0050d7')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-lg py-2.5 text-sm font-semibold transition-all"
                style={{
                  background: loading ? '#94a3b8' : 'linear-gradient(135deg, #003cbd 0%, #0050d7 100%)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  border: 'none',
                  boxShadow: loading ? 'none' : '0 2px 8px rgba(0,80,215,0.30)',
                  color: '#ffffff',
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = 'linear-gradient(135deg, #002fa3 0%, #003cbd 100%)';
                }}
                onMouseLeave={(e) => {
                  if (!loading) e.currentTarget.style.background = 'linear-gradient(135deg, #003cbd 0%, #0050d7 100%)';
                }}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          © 2026 OVHcloud. All rights reserved.
        </p>
      </div>
    </div>
  );
}
