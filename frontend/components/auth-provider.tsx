'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, refreshSession, setAccessToken } from '@/lib/api';
import type { AuthResult, User } from '@/lib/types';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  accept: (result: AuthResult) => void;
  updateUser: (user: User) => void;
  logout: () => Promise<void>;
  clear: () => void;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);
  useEffect(() => {
    let active = true;
    refreshSession()
      .then((result) => {
        if (active) setUser(result.user);
      })
      .catch(() => {
        if (active) clear();
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    window.addEventListener('session-expired', clear);
    return () => {
      active = false;
      window.removeEventListener('session-expired', clear);
    };
  }, [clear]);
  const accept = (result: AuthResult) => {
    setAccessToken(result.accessToken);
    setUser(result.user);
  };
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    clear();
  };
  return (
    <AuthContext.Provider value={{ user, loading, accept, updateUser: setUser, logout, clear }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is required');
  return context;
}
