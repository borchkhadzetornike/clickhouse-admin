import { useState, useEffect } from "react";
import { getUsers, createUser, updateUser } from "../api/auth";

interface AppUser {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function Users() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "researcher",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await getUsers();
      setUsers(res.data);
    } catch {
      setError("Failed to load users");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await createUser(form);
      setShowForm(false);
      setForm({ username: "", password: "", role: "researcher" });
      loadUsers();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to create user");
    }
  };

  const handleToggleActive = async (u: AppUser) => {
    try {
      await updateUser(u.id, { is_active: !u.is_active });
      loadUsers();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to update user");
    }
  };

  const handleRoleChange = async (u: AppUser, role: string) => {
    try {
      await updateUser(u.id, { role });
      loadUsers();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to update role");
    }
  };

  const handleResetPassword = async (u: AppUser) => {
    const newPass = window.prompt(`Enter new password for ${u.username}:`);
    if (!newPass) return;
    try {
      await updateUser(u.id, { password: newPass });
      setSuccess(`Password reset for ${u.username}`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to reset password");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          {showForm ? "Cancel" : "Create User"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg mb-4">
          {success}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white shadow rounded-xl p-6 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Temp Password
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="researcher">Researcher</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Create
            </button>
          </div>
        </form>
      )}

      <div className="bg-white shadow rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">
                Username
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">
                Role
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">
                Status
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">
                Created
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{u.username}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u, e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    <option value="researcher">researcher</option>
                    <option value="editor">editor</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      u.is_active
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {u.is_active ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 space-x-3">
                  <button
                    onClick={() => handleToggleActive(u)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    {u.is_active ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => handleResetPassword(u)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    Reset Password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
