import { createContext, useState, useEffect, type ReactNode } from "react";
import { tokenManager } from "@/services/api";

interface User {
  userId: number;
  email: string;
}

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (token: string, userId: number, email: string) => void;
  logout: () => void;
}

const defaultAuthContext: AuthContextType = {
  user: null,
  isAuthenticated: false,
  login: () => {
    throw new Error("login must be used within an AuthProvider");
  },
  logout: () => {
    throw new Error("logout must be used within an AuthProvider");
  },
};

export const AuthContext = createContext<AuthContextType>(defaultAuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Check if user is already logged in
    const savedUser = tokenManager.getUser();
    if (savedUser && tokenManager.isAuthenticated()) {
      setUser(savedUser);
    }
  }, []);

  const login = (token: string, userId: number, email: string) => {
    tokenManager.setToken(token);
    tokenManager.setUser(userId, email);
    setUser({ userId, email });
  };

  const logout = () => {
    tokenManager.removeToken();
    tokenManager.clearUser();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};
