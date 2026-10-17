"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  API_URL,
  ApiError,
} from "./api";
import {
  authFetch,
  clearTokens,
  decodeToken,
  getAccessToken,
  saveTokens,
  type CurrentUser,
} from "./auth-client";

interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  birthDate: string; // YYYY-MM-DD
  acceptedTerms: boolean;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function requestTokens(
  path: string,
  body: object,
): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      (data && typeof data.message === "string" ? data.message : null) ??
        "No se pudo conectar con el servidor",
      response.status,
    );
  }
  return data;
}

/** Única fuente de sesión del sitio — mismo criterio que AuthState en la
 * app Flutter (core/auth_state.dart): el token vive en localStorage (ver
 * auth-client.ts), esto solo decodifica el JWT ya guardado para saber
 * quién es el usuario, sin un endpoint /auth/me. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Lee localStorage UNA vez al montar — no existe en el servidor, así
    // que no puede ir en el estado inicial de useState (rompería SSR).
    const token = getAccessToken();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(token ? decodeToken(token) : null);
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const tokens = await requestTokens("/auth/login", { email, password });
    saveTokens(tokens.accessToken, tokens.refreshToken);
    setUser(decodeToken(tokens.accessToken));
  };

  const register = async (input: RegisterInput) => {
    const tokens = await requestTokens("/auth/register", input);
    saveTokens(tokens.accessToken, tokens.refreshToken);
    setUser(decodeToken(tokens.accessToken));
  };

  const logout = () => {
    clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

export { authFetch };
