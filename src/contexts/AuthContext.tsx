import {
  createContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  api,
  refreshSession,
  setAccessToken,
  setUnauthorizedHandler,
  type ApiSession,
} from "@/lib/api";
import type { UserRole } from "@/services/types";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True until the stored session (if any) has been checked. */
  loading: boolean;
  /** admin and staff can create/edit; viewers are read-only. */
  canWrite: boolean;
  /** Admins manage users and master data. */
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const notReady = () => {
  throw new Error("AuthProvider is missing");
};

const defaultAuthContext: AuthContextType = {
  user: null,
  isAuthenticated: false,
  loading: true,
  canWrite: false,
  isAdmin: false,
  login: notReady,
  logout: notReady,
};

export const AuthContext = createContext<AuthContextType>(defaultAuthContext);

const toUser = (session: ApiSession): AuthUser => ({
  id: session.user.id,
  email: session.user.email,
  name: session.user.name,
  role: session.user.role,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // The API could not renew the session: back to the login screen.
    setUnauthorizedHandler(() => setUser(null));

    // Restore the session from the refresh cookie (if there is one). The call
    // is shared, so React StrictMode's double effect does not rotate the
    // refresh token twice.
    refreshSession()
      .then((session) => {
        if (!cancelled) setUser(session ? toUser(session) : null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      setUnauthorizedHandler(null);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await api.post<ApiSession>(
      "/auth/login",
      { email: email.trim(), password },
      false,
    );
    setAccessToken(session.access_token);
    setUser(toUser(session));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post<void>("/auth/logout", undefined, false);
    } catch {
      // the local session ends either way
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        canWrite: user?.role === "admin" || user?.role === "staff",
        isAdmin: user?.role === "admin",
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
