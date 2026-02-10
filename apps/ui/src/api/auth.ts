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

export const createUser = (data: {
  username: string;
  password: string;
  role: string;
}) => api.post("/users", data);

export const updateUser = (
  id: number,
  data: { role?: string; is_active?: boolean; password?: string },
) => api.patch(`/users/${id}`, data);

export const getAuthAudit = (params?: Record<string, string>) =>
  api.get("/audit", { params });

export default api;
