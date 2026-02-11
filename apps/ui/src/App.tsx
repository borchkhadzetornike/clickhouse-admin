import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Clusters from "./pages/Clusters";
import Explorer from "./pages/Explorer";
import Proposals from "./pages/Proposals";
import Users from "./pages/Users";
import Audit from "./pages/Audit";
import RBAC from "./pages/RBAC";
import Snapshots from "./pages/Snapshots";
import AdminConsole from "./pages/AdminConsole";
import Profile from "./pages/Profile";

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/clusters" replace />} />
            <Route path="clusters" element={<Clusters />} />
            <Route path="explorer" element={<Explorer />} />
            <Route path="proposals" element={<Proposals />} />
            <Route
              path="admin-console"
              element={
                <ProtectedRoute roles={["admin", "editor"]}>
                  <AdminConsole />
                </ProtectedRoute>
              }
            />
            <Route path="rbac" element={<RBAC />} />
            <Route path="snapshots" element={<Snapshots />} />
            <Route path="profile" element={<Profile />} />
            <Route
              path="users"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="audit"
              element={
                <ProtectedRoute roles={["admin", "researcher"]}>
                  <Audit />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
