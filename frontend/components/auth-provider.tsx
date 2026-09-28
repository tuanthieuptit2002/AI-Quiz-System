'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError, refreshSession, setAccessToken } from '@/lib/api';
import type { AuthResult, User } from '@/lib/types';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  connectionError: string;
  reconnect: () => void;
  accept: (result: AuthResult) => void;
  updateUser: (user: User) => void;
  logout: () => Promise<void>;
  clear: () => void;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [revision, setRevision] = useState(0);
  const reconnect = useCallback(() => setRevision((value) => value + 1), []);
  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);
  useEffect(() => {
    let active = true;
    refreshSession()
      .then((result) => {
        if (active) {
          setUser(result.user);
          setConnectionError('');
        }
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof ApiError && [401, 403].includes(error.status)) {
          clear();
          setConnectionError('');
        } else
          setConnectionError(
            'Chưa kết nối được máy chủ. Kết nối lại để khôi phục phiên đăng nhập.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    window.addEventListener('session-expired', clear);
    window.addEventListener('online', reconnect);
    return () => {
      active = false;
      window.removeEventListener('session-expired', clear);
      window.removeEventListener('online', reconnect);
    };
  }, [clear, reconnect, revision]);
  useEffect(() => {
    if (!connectionError) return;
    const timer = setInterval(reconnect, 5000);
    return () => clearInterval(timer);
  }, [connectionError, reconnect]);
  const accept = (result: AuthResult) => {
    setAccessToken(result.accessToken);
    setUser(result.user);
  };
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    try {
      const prefix = `quizspace:exam:v1:${user?.id}:`;
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith(prefix))
        .forEach((key) => sessionStorage.removeItem(key));
    } catch {
      /* Browser storage may be disabled. */
    }
    clear();
  };
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        connectionError,
        reconnect,
        accept,
        updateUser: setUser,
        logout,
        clear,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is required');
  return context;
}
