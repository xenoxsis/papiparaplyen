"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { postLogin, postLogout } from "@/lib/api";

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
  loginWithData: (user: User) => void;
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
  const router = useRouter();

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

  // Treat any 401 from the API as a session expiry — clear state and redirect
  useEffect(() => {
    function handleUnauthorized() {
      setUser(null);
      localStorage.removeItem("auth_user");
      router.replace("/login");
    }
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, [router]);

  async function login(email: string, password: string): Promise<boolean> {
    try {
      const user = await postLogin(email, password);
      setUser(user);
      localStorage.setItem("auth_user", JSON.stringify(user));
      return true;
    } catch {
      return false;
    }
  }

  function loginWithData(user: User) {
    setUser(user);
    localStorage.setItem("auth_user", JSON.stringify(user));
  }

  function logout() {
    setUser(null);
    localStorage.removeItem("auth_user");
    postLogout().catch(() => {});
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
