import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { getMe } from "../api/auth";

interface User {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  profile_picture_url?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  setAuth: (token: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  setAuth: () => {},
  logout: () => {},
  refreshUser: async () => {},
  loading: true,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token"),
  );
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(() => {
    return getMe()
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem("token");
        setToken(null);
      });
  }, []);

  useEffect(() => {
    if (token) {
      fetchUser().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token, fetchUser]);

  const setAuth = (newToken: string) => {
    localStorage.setItem("token", newToken);
    setLoading(true);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (token) {
      await fetchUser();
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, setAuth, logout, refreshUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
