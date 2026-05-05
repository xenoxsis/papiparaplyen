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
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  pendingShiftCount: number;
  setPendingShiftCount: (count: number) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [pendingShiftCount, setPendingShiftCount] = useState(0);

  // Reading from localStorage after mount is a valid external-store sync.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("auth_user");
      const parsed = stored ? (JSON.parse(stored) as User) : null;
      setUser(parsed);
    } catch {
      // ignore
    }
  }, []);

  async function login(email: string, password: string): Promise<boolean> {
    try {
      const authUser = await postLogin(email, password);
      setUser(authUser);
      localStorage.setItem("auth_user", JSON.stringify(authUser));
      return true;
    } catch {
      return false;
    }
  }

  function logout() {
    setUser(null);
    localStorage.removeItem("auth_user");
  }

  return (
    <AuthContext.Provider
      value={{ user, login, logout, pendingShiftCount, setPendingShiftCount }}
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
