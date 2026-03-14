import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import {
  clearAuthStorage,
  getStoredUser,
  persistAuthSession,
} from "../lib/authStorage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(getStoredUser());
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    const payload = { username, password };
    const response = await api.post("/api/auth/login", payload);
    const { token, user: userPayload } = response.data;
    persistAuthSession(token, userPayload);
    setUser(userPayload);
    return userPayload;
  };

  const logout = () => {
    clearAuthStorage();
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      isAdmin: user?.role === "admin",
      login,
      logout,
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
