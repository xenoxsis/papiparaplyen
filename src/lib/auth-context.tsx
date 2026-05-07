"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { postLogin } from "@/lib/api";

export type User = {
  id: number;
  name: string;
  initials: string;
  roles: string[];
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithData: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (partial: Partial<User>) => void;
  pendingShiftCount: number;
  setPendingShiftCount: (count: number) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingShiftCount, setPendingShiftCount] = useState(0);

  // Reading from localStorage after mount is a valid external-store sync.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("auth_user");
      const parsed = stored ? (JSON.parse(stored) as User) : null;
      setUser(parsed);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  async function login(email: string, password: string): Promise<boolean> {
    try {
      const authUser = await postLogin(email, password);
      const { token, ...user } = authUser;
      setUser(user);
      localStorage.setItem("auth_user", JSON.stringify(user));
      localStorage.setItem("auth_token", token);
      return true;
    } catch {
      return false;
    }
  }

  function loginWithData(user: User, token: string) {
    setUser(user);
    localStorage.setItem("auth_user", JSON.stringify(user));
    localStorage.setItem("auth_token", token);
  }

  function logout() {
    setUser(null);
    localStorage.removeItem("auth_user");
    localStorage.removeItem("auth_token");
  }

  function updateUser(partial: Partial<User>) {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      localStorage.setItem("auth_user", JSON.stringify(next));
      return next;
    });
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        loginWithData,
        logout,
        updateUser,
        pendingShiftCount,
        setPendingShiftCount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
