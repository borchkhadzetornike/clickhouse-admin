import { useState, useEffect, useCallback, useRef } from "react";
import {
  getUsers,
  getUser,
  createUser,
  updateUser,
  getUserAudit,
} from "../api/auth";
import { useAuth } from "../contexts/AuthContext";

/* ================================================================
   Types
   ================================================================ */

interface AppUser {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  profile_picture_url: string | null;
  created_at: string;
  updated_at: string | null;
}

interface AuditEntry {
  id: number;
  action: string;
  severity: string;
  created_at: string | null;
  metadata_json: string | null;
  target: string | null;
}

type ToastType = "success" | "error" | "info";

/* ================================================================
   Micro-components
   ================================================================ */

function Avatar({
  user,
  size = "md",
}: {
  user: Pick<AppUser, "first_name" | "last_name" | "username" | "profile_picture_url">;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-16 h-16 text-xl" : "w-10 h-10 text-sm";
  const initials =
    [user.first_name?.[0], user.last_name?.[0]].filter(Boolean).join("").toUpperCase() ||
    user.username?.[0]?.toUpperCase() ||
    "?";

  if (user.profile_picture_url) {
    return (
      <img
        src={user.profile_picture_url}
        alt={user.username}
        className={`${dim} rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-700 flex-shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${dim} rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold ring-2 ring-blue-200 dark:ring-blue-800 flex-shrink-0`}
    >
      {initials}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    disabled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] || map.active}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
        status === "active" ? "bg-emerald-500" : status === "disabled" ? "bg-red-500" : "bg-amber-500"
      }`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 ring-purple-200 dark:ring-purple-800",
    editor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 ring-blue-200 dark:ring-blue-800",
    researcher: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 ring-gray-200 dark:ring-gray-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ring-1 ring-inset ${map[role] || map.researcher}`}>
      {role}
    </span>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`} />;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-1.5 text-gray-400 hover:text-blue-500 transition-colors"
      title="Copy"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
      )}
    </button>
  );
}

/* ── Toast ────────────────────────────────────────────── */

function Toast({ message, type, onClose }: { message: string; type: ToastType; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  const base = "fixed bottom-5 right-5 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium transition-all";
  const colors: Record<ToastType, string> = {
    success: "bg-emerald-600 text-white",
    error: "bg-red-600 text-white",
    info: "bg-blue-600 text-white",
  };
  return (
    <div className={`${base} ${colors[type]}`}>
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">&times;</button>
    </div>
  );
}

/* ── Confirm Dialog ──────────────────────────────────── */

function ConfirmDialog({
  open,
  title,
  message,
  danger,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  danger?: boolean;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors ${danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Password strength meter ─────────────────────────── */

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"];
  const colors = ["bg-red-500", "bg-orange-500", "bg-amber-500", "bg-blue-500", "bg-emerald-500"];
  const idx = Math.max(0, score - 1);
  return (
    <div className="mt-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= idx ? colors[idx] : "bg-gray-200 dark:bg-gray-700"}`} />
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-0.5">{labels[idx]}</p>
    </div>
  );
}

/* ================================================================
   Main Component
   ================================================================ */

export default function Users() {
  const { user: currentUser } = useAuth();

  /* ── State ────────────────────────────────────────────── */
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortField, setSortField] = useState<"username" | "created_at" | "role">("username");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Inspector
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"profile" | "security" | "activity">("profile");
  const [userAudit, setUserAudit] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Create user wizard
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: "",
    password: "",
    first_name: "",
    last_name: "",
    email: "",
    role: "researcher",
  });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Edit mode (in inspector)
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", email: "" });

  // Confirmation dialog
  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    message: string;
    danger: boolean;
    confirmLabel: string;
    action: () => void;
  }>({ open: false, title: "", message: "", danger: false, confirmLabel: "Confirm", action: () => {} });

  // Password reset
  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  // Toast
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    setToast({ message, type });
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usernameRef = useRef<any>(null);

  /* ── Data loading ─────────────────────────────────────── */

  const loadUsers = useCallback(async () => {
    try {
      const res = await getUsers();
      setUsers(res.data);
    } catch {
      showToast("Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const loadUserAudit = useCallback(async (uid: number) => {
    setAuditLoading(true);
    try {
      const res = await getUserAudit(uid);
      setUserAudit(res.data);
    } catch {
      setUserAudit([]);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  /* ── Filtered & sorted list ───────────────────────────── */

  const filteredUsers = users
    .filter((u) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        u.username.toLowerCase().includes(q) ||
        (u.first_name || "").toLowerCase().includes(q) ||
        (u.last_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q);
      const matchRole = filterRole === "all" || u.role === filterRole;
      const matchStatus =
        filterStatus === "all" ||
        (filterStatus === "active" && u.is_active) ||
        (filterStatus === "disabled" && !u.is_active);
      return matchSearch && matchRole && matchStatus;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === "username") cmp = a.username.localeCompare(b.username);
      else if (sortField === "role") cmp = a.role.localeCompare(b.role);
      else cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });

  /* ── Handlers ─────────────────────────────────────────── */

  const selectUser = (u: AppUser) => {
    setSelectedUser(u);
    setInspectorTab("profile");
    setEditing(false);
    setPasswordResetOpen(false);
    setNewPassword("");
    loadUserAudit(u.id);
  };

  // Refresh the selected user data after changes
  const refreshSelected = async (uid: number) => {
    try {
      const res = await getUser(uid);
      setSelectedUser(res.data);
    } catch { /* ignore */ }
    loadUsers();
  };

  const handleToggleActive = (u: AppUser) => {
    const action = u.is_active ? "disable" : "enable";
    setConfirm({
      open: true,
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} User`,
      message: `Are you sure you want to ${action} ${u.username}?${u.is_active && u.role === "admin" ? " This user has admin privileges." : ""}`,
      danger: u.is_active,
      confirmLabel: action.charAt(0).toUpperCase() + action.slice(1),
      action: async () => {
        setConfirm((c) => ({ ...c, open: false }));
        try {
          await updateUser(u.id, { is_active: !u.is_active });
          showToast(`User ${u.username} ${action}d`);
          refreshSelected(u.id);
        } catch (err: unknown) {
          const axErr = err as { response?: { data?: { detail?: string } } };
          showToast(axErr.response?.data?.detail || `Failed to ${action} user`, "error");
        }
      },
    });
  };

  const handleRoleChange = (u: AppUser, newRole: string) => {
    const selfDemoting = currentUser?.id === u.id && u.role === "admin" && newRole !== "admin";
    setConfirm({
      open: true,
      title: "Change Role",
      message: selfDemoting
        ? `Warning: You are about to remove your own admin privileges. You will lose access to this page.`
        : `Change role of ${u.username} from ${u.role} to ${newRole}?`,
      danger: selfDemoting,
      confirmLabel: "Change Role",
      action: async () => {
        setConfirm((c) => ({ ...c, open: false }));
        try {
          await updateUser(u.id, { role: newRole });
          showToast(`Role updated to ${newRole}`);
          refreshSelected(u.id);
        } catch (err: unknown) {
          const axErr = err as { response?: { data?: { detail?: string } } };
          showToast(axErr.response?.data?.detail || "Failed to change role", "error");
        }
      },
    });
  };

  const handlePasswordReset = async () => {
    if (!selectedUser || !newPassword) return;
    if (newPassword.length < 8) { showToast("Password must be at least 8 characters", "error"); return; }
    try {
      await updateUser(selectedUser.id, { password: newPassword });
      showToast(`Password reset for ${selectedUser.username}`);
      setPasswordResetOpen(false);
      setNewPassword("");
      loadUserAudit(selectedUser.id);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      showToast(axErr.response?.data?.detail || "Failed to reset password", "error");
    }
  };

  const handleEditSave = async () => {
    if (!selectedUser) return;
    try {
      await updateUser(selectedUser.id, {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        email: editForm.email,
      });
      showToast("Profile updated");
      setEditing(false);
      refreshSelected(selectedUser.id);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      showToast(axErr.response?.data?.detail || "Failed to update profile", "error");
    }
  };

  const startEditing = () => {
    if (!selectedUser) return;
    setEditForm({
      first_name: selectedUser.first_name || "",
      last_name: selectedUser.last_name || "",
      email: selectedUser.email || "",
    });
    setEditing(true);
  };

  /* ── Create user ─────────────────────────────────────── */

  const validateCreate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!createForm.username.trim()) errors.username = "Username is required";
    else if (createForm.username.length < 3) errors.username = "Min 3 characters";
    if (!createForm.password) errors.password = "Password is required";
    else if (createForm.password.length < 8) errors.password = "Min 8 characters";
    if (createForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email))
      errors.email = "Invalid email format";
    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCreate()) return;
    setCreateSubmitting(true);
    try {
      const payload: Record<string, string> = {
        username: createForm.username.trim(),
        password: createForm.password,
        role: createForm.role,
      };
      if (createForm.first_name.trim()) payload.first_name = createForm.first_name.trim();
      if (createForm.last_name.trim()) payload.last_name = createForm.last_name.trim();
      if (createForm.email.trim()) payload.email = createForm.email.trim();
      await createUser(payload as Parameters<typeof createUser>[0]);
      showToast(`User ${payload.username} created`);
      setShowCreateWizard(false);
      setCreateForm({ username: "", password: "", first_name: "", last_name: "", email: "", role: "researcher" });
      setCreateErrors({});
      loadUsers();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      showToast(axErr.response?.data?.detail || "Failed to create user", "error");
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Focus username field when wizard opens
  useEffect(() => {
    if (showCreateWizard) setTimeout(() => usernameRef.current?.focus(), 100);
  }, [showCreateWizard]);

  /* ── Sort toggle ─────────────────────────────────────── */

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <svg className="w-3 h-3 text-gray-400 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>;
    return sortDir === "asc" ? (
      <svg className="w-3 h-3 text-blue-500 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
    ) : (
      <svg className="w-3 h-3 text-blue-500 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
    );
  };

  /* ================================================================
     Render
     ================================================================ */

  const displayName = (u: AppUser) =>
    [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username;

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col">
      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Users</h1>
          <span className="text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
            {users.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Global search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users..."
              className="pl-9 pr-3 py-2 w-64 text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>
          <button
            onClick={() => { setShowCreateWizard(true); setSelectedUser(null); }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Create User
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Left panel: user list ─────────────────────────── */}
        <div className="w-[440px] xl:w-[500px] flex-shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-white dark:bg-gray-900">
          {/* Filters */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2 flex-shrink-0">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="text-xs border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="all">All roles</option>
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="researcher">Researcher</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
            <div className="flex-1" />
            <button onClick={() => toggleSort("username")} className="flex items-center text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              Name <SortIcon field="username" />
            </button>
            <button onClick={() => toggleSort("created_at")} className="flex items-center text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 ml-2">
              Created <SortIcon field="created_at" />
            </button>
          </div>

          {/* User rows */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
                <svg className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <p className="text-sm font-medium">No users found</p>
                <p className="text-xs mt-1">Try adjusting your search or filters</p>
              </div>
            ) : (
              filteredUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { selectUser(u); setShowCreateWizard(false); }}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-gray-50 dark:border-gray-800/50 transition-colors ${
                    selectedUser?.id === u.id && !showCreateWizard
                      ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-2 border-l-transparent"
                  }`}
                >
                  <Avatar user={u} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {displayName(u)}
                      </span>
                      <RoleBadge role={u.role} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        @{u.username}
                      </span>
                      {u.email && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                          · {u.email}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <StatusBadge status={u.is_active ? "active" : "disabled"} />
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {new Date(u.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Right panel: Inspector or Create Wizard ────────── */}
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
          {showCreateWizard ? (
            <CreateUserWizard
              form={createForm}
              setForm={setCreateForm}
              errors={createErrors}
              submitting={createSubmitting}
              onSubmit={handleCreate}
              onCancel={() => { setShowCreateWizard(false); setCreateErrors({}); }}
              usernameRef={usernameRef}
            />
          ) : selectedUser ? (
            <UserInspector
              user={selectedUser}
              tab={inspectorTab}
              setTab={setInspectorTab}
              audit={userAudit}
              auditLoading={auditLoading}
              editing={editing}
              editForm={editForm}
              setEditForm={setEditForm}
              onStartEdit={startEditing}
              onCancelEdit={() => setEditing(false)}
              onSaveEdit={handleEditSave}
              onToggleActive={() => handleToggleActive(selectedUser)}
              onRoleChange={(role) => handleRoleChange(selectedUser, role)}
              passwordResetOpen={passwordResetOpen}
              setPasswordResetOpen={setPasswordResetOpen}
              newPassword={newPassword}
              setNewPassword={setNewPassword}
              onPasswordReset={handlePasswordReset}
              isSelf={currentUser?.id === selectedUser.id}
            />
          ) : (
            <EmptyInspector />
          )}
        </div>
      </div>

      {/* ── Global overlays ─────────────────────────────────── */}
      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        danger={confirm.danger}
        confirmLabel={confirm.confirmLabel}
        onConfirm={confirm.action}
        onCancel={() => setConfirm((c) => ({ ...c, open: false }))}
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ================================================================
   Empty Inspector
   ================================================================ */

function EmptyInspector() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
      <svg className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
      <p className="text-sm font-medium">Select a user to inspect</p>
      <p className="text-xs mt-1">Choose from the list or create a new user</p>
    </div>
  );
}

/* ================================================================
   Create User Wizard
   ================================================================ */

function CreateUserWizard({
  form,
  setForm,
  errors,
  submitting,
  onSubmit,
  onCancel,
  usernameRef,
}: {
  form: { username: string; password: string; first_name: string; last_name: string; email: string; role: string };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  errors: Record<string, string>;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  usernameRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="max-w-xl mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create New User</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Set up a new user account with identity and access information.
          </p>
        </div>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        {/* Identity section */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            Identity
          </h3>
          <div className="space-y-4">
            <FieldInput
              label="Username"
              required
              value={form.username}
              onChange={(v) => setForm((f) => ({ ...f, username: v }))}
              error={errors.username}
              placeholder="e.g. john.doe"
              hint="Unique identifier, cannot be changed later"
              inputRef={usernameRef}
            />
            <div className="grid grid-cols-2 gap-4">
              <FieldInput
                label="First Name"
                value={form.first_name}
                onChange={(v) => setForm((f) => ({ ...f, first_name: v }))}
                placeholder="John"
              />
              <FieldInput
                label="Last Name"
                value={form.last_name}
                onChange={(v) => setForm((f) => ({ ...f, last_name: v }))}
                placeholder="Doe"
              />
            </div>
            <FieldInput
              label="Email"
              value={form.email}
              onChange={(v) => setForm((f) => ({ ...f, email: v }))}
              error={errors.email}
              placeholder="john@example.com"
              type="email"
            />
          </div>
        </div>

        {/* Access section */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            Access &amp; Security
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Temporary Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Min 8 characters"
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-800 dark:text-gray-100 ${
                  errors.password ? "border-red-400 dark:border-red-600" : "border-gray-300 dark:border-gray-700"
                }`}
              />
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
              <PasswordStrength password={form.password} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
              <div className="grid grid-cols-3 gap-2">
                {["researcher", "editor", "admin"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, role: r }))}
                    className={`px-3 py-2 text-sm rounded-lg border font-medium transition-all ${
                      form.role === r
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 ring-2 ring-blue-200 dark:ring-blue-800"
                        : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600"
                    }`}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                {form.role === "admin" && "Full access: manage users, clusters, and all settings."}
                {form.role === "editor" && "Can view and edit ClickHouse cluster configurations."}
                {form.role === "researcher" && "Read-only access to explore clusters and RBAC data."}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {submitting ? "Creating..." : "Create User"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Reusable field input ──────────────────────────────── */

function FieldInput({
  label,
  value,
  onChange,
  error,
  placeholder,
  hint,
  required,
  disabled,
  type = "text",
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  type?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputRef?: any;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 ${
          disabled ? "bg-gray-100 dark:bg-gray-800 text-gray-500 cursor-not-allowed" : ""
        } ${error ? "border-red-400 dark:border-red-600" : "border-gray-300 dark:border-gray-700"}`}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

/* ================================================================
   User Inspector
   ================================================================ */

function UserInspector({
  user,
  tab,
  setTab,
  audit,
  auditLoading,
  editing,
  editForm,
  setEditForm,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleActive,
  onRoleChange,
  passwordResetOpen,
  setPasswordResetOpen,
  newPassword,
  setNewPassword,
  onPasswordReset,
  isSelf,
}: {
  user: AppUser;
  tab: "profile" | "security" | "activity";
  setTab: (t: "profile" | "security" | "activity") => void;
  audit: AuditEntry[];
  auditLoading: boolean;
  editing: boolean;
  editForm: { first_name: string; last_name: string; email: string };
  setEditForm: React.Dispatch<React.SetStateAction<typeof editForm>>;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onToggleActive: () => void;
  onRoleChange: (role: string) => void;
  passwordResetOpen: boolean;
  setPasswordResetOpen: (v: boolean) => void;
  newPassword: string;
  setNewPassword: (v: string) => void;
  onPasswordReset: () => void;
  isSelf: boolean;
}) {
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username;
  const tabs = [
    { id: "profile" as const, label: "Profile", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
    { id: "security" as const, label: "Security", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg> },
    { id: "activity" as const, label: "Activity", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* ── Header ───────────────────────────────────────── */}
      <div className="px-6 py-5 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Avatar user={user} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{displayName}</h2>
              <StatusBadge status={user.is_active ? "active" : "disabled"} />
              {isSelf && (
                <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                  You
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
                @{user.username} <CopyButton text={user.username} />
              </span>
              {user.email && (
                <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
                  {user.email} <CopyButton text={user.email} />
                </span>
              )}
              <RoleBadge role={user.role} />
            </div>
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────── */}
        <div className="flex gap-1 mt-4 -mb-5 border-b-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                tab === t.id
                  ? "bg-gray-50 dark:bg-gray-950 text-blue-600 dark:text-blue-400 border border-gray-200 dark:border-gray-800 border-b-transparent"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === "profile" && (
          <ProfileTab
            user={user}
            editing={editing}
            editForm={editForm}
            setEditForm={setEditForm}
            onStartEdit={onStartEdit}
            onCancelEdit={onCancelEdit}
            onSaveEdit={onSaveEdit}
          />
        )}
        {tab === "security" && (
          <SecurityTab
            user={user}
            onToggleActive={onToggleActive}
            onRoleChange={onRoleChange}
            passwordResetOpen={passwordResetOpen}
            setPasswordResetOpen={setPasswordResetOpen}
            newPassword={newPassword}
            setNewPassword={setNewPassword}
            onPasswordReset={onPasswordReset}
            isSelf={isSelf}
          />
        )}
        {tab === "activity" && (
          <ActivityTab audit={audit} loading={auditLoading} />
        )}
      </div>
    </div>
  );
}

/* ================================================================
   Profile Tab
   ================================================================ */

function ProfileTab({
  user,
  editing,
  editForm,
  setEditForm,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: {
  user: AppUser;
  editing: boolean;
  editForm: { first_name: string; last_name: string; email: string };
  setEditForm: React.Dispatch<React.SetStateAction<typeof editForm>>;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
}) {
  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Profile Information</h3>
        {!editing ? (
          <button onClick={onStartEdit} className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={onCancelEdit} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 font-medium">Cancel</button>
            <button onClick={onSaveEdit} className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 font-semibold">Save</button>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
        <ProfileRow label="Username" value={`@${user.username}`} mono />
        {editing ? (
          <>
            <ProfileRowEdit label="First Name" value={editForm.first_name} onChange={(v) => setEditForm((f) => ({ ...f, first_name: v }))} />
            <ProfileRowEdit label="Last Name" value={editForm.last_name} onChange={(v) => setEditForm((f) => ({ ...f, last_name: v }))} />
            <ProfileRowEdit label="Email" value={editForm.email} onChange={(v) => setEditForm((f) => ({ ...f, email: v }))} type="email" />
          </>
        ) : (
          <>
            <ProfileRow label="First Name" value={user.first_name || "—"} />
            <ProfileRow label="Last Name" value={user.last_name || "—"} />
            <ProfileRow label="Email" value={user.email || "—"} copyable={!!user.email} />
          </>
        )}
        <ProfileRow label="Role" value={<RoleBadge role={user.role} />} />
        <ProfileRow label="Status" value={<StatusBadge status={user.is_active ? "active" : "disabled"} />} />
        <ProfileRow label="Created" value={new Date(user.created_at).toLocaleString()} />
        <ProfileRow label="Last Updated" value={user.updated_at ? new Date(user.updated_at).toLocaleString() : "Never"} />
      </div>

      {user.profile_picture_url && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Profile Picture</h4>
          <img src={user.profile_picture_url} alt="Profile" className="w-24 h-24 rounded-xl object-cover border border-gray-200 dark:border-gray-700" />
        </div>
      )}

      {/* Metadata (internal) */}
      <div>
        <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Internal</h4>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
          <ProfileRow label="User ID" value={String(user.id)} mono />
        </div>
      </div>
    </div>
  );
}

function ProfileRow({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`text-sm text-gray-900 dark:text-gray-100 flex items-center ${mono ? "font-mono" : ""}`}>
        {value}
        {copyable && typeof value === "string" && <CopyButton text={value} />}
      </span>
    </div>
  );
}

function ProfileRowEdit({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 gap-4">
      <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm text-right text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none w-56"
      />
    </div>
  );
}

/* ================================================================
   Security Tab
   ================================================================ */

function SecurityTab({
  user,
  onToggleActive,
  onRoleChange,
  passwordResetOpen,
  setPasswordResetOpen,
  newPassword,
  setNewPassword,
  onPasswordReset,
  isSelf,
}: {
  user: AppUser;
  onToggleActive: () => void;
  onRoleChange: (role: string) => void;
  passwordResetOpen: boolean;
  setPasswordResetOpen: (v: boolean) => void;
  newPassword: string;
  setNewPassword: (v: string) => void;
  onPasswordReset: () => void;
  isSelf: boolean;
}) {
  return (
    <div className="max-w-lg space-y-6">
      {/* Role assignment */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          Role Assignment
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {["researcher", "editor", "admin"].map((r) => (
            <button
              key={r}
              onClick={() => r !== user.role && onRoleChange(r)}
              className={`px-3 py-2.5 text-sm rounded-lg border font-medium transition-all ${
                user.role === r
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 ring-2 ring-blue-200 dark:ring-blue-800"
                  : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600 cursor-pointer"
              }`}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
        <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
          {user.role === "admin" && "Full access to manage users, clusters, and settings."}
          {user.role === "editor" && "Can view and edit ClickHouse cluster configurations."}
          {user.role === "researcher" && "Read-only access to explore clusters and RBAC data."}
        </div>
        {isSelf && user.role === "admin" && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            Changing your own role will remove your admin access.
          </div>
        )}
      </div>

      {/* Account status */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Account Status
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <StatusBadge status={user.is_active ? "active" : "disabled"} />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {user.is_active ? "User can log in and use the system." : "User is locked out and cannot log in."}
            </p>
          </div>
          <button
            onClick={onToggleActive}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              user.is_active
                ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800"
                : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800"
            }`}
          >
            {user.is_active ? "Disable Account" : "Enable Account"}
          </button>
        </div>
      </div>

      {/* Password reset */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
          Password Reset
        </h3>
        {passwordResetOpen ? (
          <div className="space-y-3">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <PasswordStrength password={newPassword} />
            <div className="flex gap-2">
              <button
                onClick={onPasswordReset}
                disabled={!newPassword || newPassword.length < 8}
                className="px-4 py-2 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                Reset Password
              </button>
              <button
                onClick={() => { setPasswordResetOpen(false); setNewPassword(""); }}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setPasswordResetOpen(true)}
            className="px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
          >
            Reset Password
          </button>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   Activity Tab
   ================================================================ */

function ActivityTab({ audit, loading }: { audit: AuditEntry[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3 max-w-lg">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-3 items-start">
            <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (audit.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
        <svg className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <p className="text-sm font-medium">No activity yet</p>
        <p className="text-xs mt-1">Actions related to this user will appear here.</p>
      </div>
    );
  }

  const actionLabels: Record<string, { label: string; color: string }> = {
    login_success: { label: "Logged in", color: "text-emerald-500" },
    login_failed: { label: "Failed login", color: "text-red-500" },
    user_created: { label: "Account created", color: "text-blue-500" },
    user_updated: { label: "Account updated", color: "text-amber-500" },
    password_changed: { label: "Password changed", color: "text-purple-500" },
    password_change_failed: { label: "Password change failed", color: "text-red-500" },
    profile_updated: { label: "Profile updated", color: "text-blue-500" },
  };

  const severityIcon = (sev: string) => {
    if (sev === "warn") return <div className="w-2 h-2 bg-amber-500 rounded-full" />;
    if (sev === "error") return <div className="w-2 h-2 bg-red-500 rounded-full" />;
    return <div className="w-2 h-2 bg-gray-400 rounded-full" />;
  };

  return (
    <div className="max-w-lg">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Recent Activity</h3>
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" />
        <div className="space-y-0">
          {audit.map((e, i) => {
            const info = actionLabels[e.action] || { label: e.action.replace(/_/g, " "), color: "text-gray-500" };
            let meta: Record<string, unknown> | null = null;
            try { if (e.metadata_json) meta = JSON.parse(e.metadata_json); } catch { /* ignore */ }

            return (
              <div key={e.id} className="relative flex gap-3 pb-4 pl-9 group">
                <div className="absolute left-[11px] top-1.5 flex items-center justify-center">
                  {severityIcon(e.severity)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${info.color}`}>{info.label}</span>
                    {i === 0 && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium">Latest</span>}
                  </div>
                  {e.created_at && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {new Date(e.created_at).toLocaleString()}
                    </p>
                  )}
                  {meta && Object.keys(meta).length > 0 && (
                    <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 font-mono">
                      {Object.entries(meta).map(([k, v]) => (
                        <div key={k}>
                          <span className="text-gray-400">{k}:</span>{" "}
                          <span className="text-gray-700 dark:text-gray-300">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
