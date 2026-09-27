import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { decodeToken, login as loginRequest, type CurrentUser } from '../api/auth';

interface AuthContextValue {
  user: CurrentUser | null;
  token: string | null;
  isSuperAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('accessToken'));
  const user = useMemo(() => (token ? decodeToken(token) : null), [token]);
  const isSuperAdmin = user?.roles.includes('SUPER_ADMIN') ?? false;

  const login = async (email: string, password: string) => {
    const { accessToken } = await loginRequest(email, password);
    localStorage.setItem('accessToken', accessToken);
    setToken(accessToken);
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isSuperAdmin, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
