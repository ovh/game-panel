import { useState } from 'react';
import { Eye, EyeOff, Lock, User, AlertCircle } from 'lucide-react';
import { apiClient } from '../utils/api';
import { AppAlert, AppButton, AppCard, AppFormField, AppInput } from '../src/ui/components';

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
  const inputStateClass = showError
    ? 'border-red-400/45 bg-red-950/20 shadow-[0_0_0_1px_rgba(248,113,113,0.14)] focus:outline-none focus:ring-2 focus:ring-red-400/25 focus:border-red-300'
    : 'border-gray-600 bg-[#1f2937] focus:outline-none focus:ring-2 focus:ring-[var(--color-cyan-400)] focus:border-transparent';

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (error) {
      setError('');
    }
    setUsername(e.target.value);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (error) {
      setError('');
    }
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
    <div className="relative min-h-screen flex items-center justify-center bg-[#0a0e1a] px-4">
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="h-12 flex items-center justify-center mb-6">
            <img src="/ovhcloud-logo.png" alt="OVHcloud" className="h-10 w-auto object-contain" />
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Game Panel</h1>
          <p className="text-gray-200 text-sm">Sign in to manage your game servers</p>
        </div>

        <AppCard className="rounded-lg border border-gray-800 p-6 shadow-2xl md:p-8">
          <form onSubmit={handleCredentialsSubmit} className="space-y-6">
            {error && (
              <AppAlert
                tone="critical"
                variant="light"
                className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{errorTitle}</p>
                    <p className="mt-1 text-sm text-gray-300">{errorMessage}</p>
                  </div>
                </div>
              </AppAlert>
            )}

            <div>
              <AppFormField id="username" label="Username">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className={`w-5 h-5 transition-colors ${showError ? 'text-red-200/80' : 'text-gray-500'}`} />
                </div>
                <AppInput
                  id="username"
                  type="text"
                  value={username}
                  onChange={handleUsernameChange}
                  aria-invalid={showError}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg text-white placeholder-gray-300 transition-all duration-200 ${inputStateClass}`}
                  placeholder="Enter your username"
                  autoComplete="username"
                />
              </div>
              </AppFormField>
            </div>

            <div>
              <AppFormField id="password" label="Password">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className={`w-5 h-5 transition-colors ${showError ? 'text-red-200/80' : 'text-gray-500'}`} />
                </div>
                <AppInput
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={handlePasswordChange}
                  aria-invalid={showError}
                  className={`w-full pl-10 pr-12 py-3 border rounded-lg text-white placeholder-gray-300 transition-all duration-200 ${inputStateClass}`}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <AppButton
                  type="button"
                  tone="ghost"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex h-full items-center border-none bg-transparent pr-3 text-gray-500 hover:text-[var(--color-cyan-400)]"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </AppButton>
              </div>
              </AppFormField>
            </div>

            <AppButton
              type="submit"
              tone="primary"
              fullWidth
              disabled={loading}
              className="w-full py-3 px-4 bg-[#0050D7] hover:bg-[#157EEA] hover:text-white text-white font-semibold rounded-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl disabled:opacity-60"
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </AppButton>
          </form>
        </AppCard>

        <div className="text-center mt-8">
          <p className="text-gray-300 text-xs mt-4">© 2026 OVHcloud. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}


