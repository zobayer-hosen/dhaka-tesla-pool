'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { ApiError, api, clearToken, getToken, setToken } from './api';
import type { LoginResponse, Me, Role } from './types';

interface AuthContextValue {
  user: Me | null;
  loading: boolean;
  // Set when we couldn't check the saved token, e.g. the API is down.
  error: ApiError | null;
  // Arrow-function types: pages destructure these, so they must not rely on `this`.
  login: (email: string, password: string) => Promise<Me>;
  signup: (name: string, email: string, password: string) => Promise<Me>;
  logout: () => void;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Where each role lands after logging in.
export function homeFor(role: Role): string {
  return role === 'DRIVER' ? '/driver' : '/ride/current';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  // Who is logged in? Asks the API with the saved token, if there is one.
  const loadUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUser(getToken() ? await api<Me>('/auth/me') : null);
    } catch (e) {
      setUser(null);
      if (e instanceof ApiError && e.statusCode !== 401) {
        setError(e);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  // Keeps the token and loads who it belongs to.
  const startSession = useCallback(async (response: LoginResponse) => {
    setToken(response.accessToken);
    const me = await api<Me>('/auth/me');
    setUser(me);
    return me;
  }, []);

  const login = useCallback(
    async (email: string, password: string) =>
      startSession(
        await api<LoginResponse>('/auth/login', {
          method: 'POST',
          body: { email, password },
        }),
      ),
    [startSession],
  );

  // Sign-up also logs the passenger in (DECISIONS #21).
  const signup = useCallback(
    async (name: string, email: string, password: string) =>
      startSession(
        await api<LoginResponse>('/auth/signup', {
          method: 'POST',
          body: { name, email, password },
        }),
      ),
    [startSession],
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const retry = useCallback(() => {
    void loadUser();
  }, [loadUser]);

  return (
    <AuthContext.Provider
      value={{ user, loading, error, login, signup, logout, retry }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return value;
}
