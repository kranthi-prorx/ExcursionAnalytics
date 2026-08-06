import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { AuthState, User } from '../types';
import { authAPI } from '../lib/api';
import { queryCache } from '../lib/queryCache';

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
  });

  // On startup: validate the stored token against the backend.
  // If it's expired or missing, clear it so the user is sent to /login.
  useEffect(() => {
    const token = localStorage.getItem('eha_token');
    const userStr = localStorage.getItem('eha_user');
    if (!token || !userStr) return;

    // Optimistically set auth state so the UI doesn't flash the login page
    try {
      const user = JSON.parse(userStr) as User;
      setState({ user, token, isAuthenticated: true });
    } catch {
      localStorage.removeItem('eha_token');
      localStorage.removeItem('eha_user');
      return;
    }

    // Then verify with the backend — if 401, the response interceptor
    // in api.ts will clear localStorage and redirect to /login automatically.
    // Also re-hydrate the user object so the role is always the live DB value.
    authAPI.me().then(res => {
      const freshUser = res.data;
      localStorage.setItem('eha_user', JSON.stringify(freshUser));
      setState(s => ({ ...s, user: freshUser }));
    }).catch(() => {
      // Interceptor already handles the redirect; just clear local state
      setState({ user: null, token: null, isAuthenticated: false });
    });
  }, []);


  const login = async (email: string, password: string) => {
    // Clear any cached data from a previous session before setting new auth state.
    // This prevents stale data from one user being served to the next.
    queryCache.clear();
    const res = await authAPI.login(email, password);
    const { token, user } = res.data;
    localStorage.setItem('eha_token', token);
    localStorage.setItem('eha_user', JSON.stringify(user));
    setState({ user, token, isAuthenticated: true });
  };

  const logout = () => {
    // Clear cached dashboard/analytics data so the next user starts with a fresh fetch.
    queryCache.clear();
    localStorage.removeItem('eha_token');
    localStorage.removeItem('eha_user');
    setState({ user: null, token: null, isAuthenticated: false });
  };

  const updateUser = (user: User) => {
    localStorage.setItem('eha_user', JSON.stringify(user));
    setState(s => ({ ...s, user }));
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
