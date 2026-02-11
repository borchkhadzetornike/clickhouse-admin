import axios from "axios";

const api = axios.create({ baseURL: "/api/auth" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const login = (username: string, password: string) =>
  api.post("/login", { username, password });

export const getMe = () => api.get("/me");

export const getUsers = () => api.get("/users");

export const getUser = (id: number) => api.get(`/users/${id}`);

export const createUser = (data: {
  username: string;
  password: string;
  role: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}) => api.post("/users", data);

export const updateUser = (
  id: number,
  data: {
    role?: string;
    is_active?: boolean;
    password?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    profile_picture_url?: string | null;
  },
) => api.patch(`/users/${id}`, data);

export const getUserAudit = (id: number, limit = 50) =>
  api.get(`/users/${id}/audit`, { params: { limit } });

export const getAuthAudit = (params?: Record<string, string | number>) =>
  api.get("/audit", { params });

export const getAuditEventDetail = (id: number) => api.get(`/audit/${id}`);

// ── Profile endpoints ────────────────────────────────────

export const getProfile = () => api.get("/profile");

export const updateProfile = (data: {
  first_name?: string;
  last_name?: string;
  email?: string;
  profile_picture_url?: string | null;
}) => api.patch("/profile", data);

export const changePassword = (data: {
  current_password: string;
  new_password: string;
}) => api.post("/profile/change-password", data);

export default api;
