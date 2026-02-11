import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  getClusters,
  getAdminUsers,
  getAdminRoles,
  getSettingsProfiles,
  getQuotas,
  getRowPolicies,
  getAdminUserHistory,
  getAdminRoleHistory,
  createProposal,
  getDatabases,
  getTables,
  getSQLPreview,
} from "../api/governance";

/* ──────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────── */

type Section = "users" | "roles" | "row_policies" | "profiles" | "quotas" | "privileges";

interface Cluster { id: number; name: string; }
interface AdminUser { name: string; auth_type: string | null; host_ip: string[]; roles: string[]; default_roles: string[]; settings_profiles?: string[]; quotas?: string[]; }
interface AdminRole { name: string; members: string[]; inherited_roles: string[]; direct_grants: { access_type: string; database: string; table: string }[]; }
interface SettingsProfile { name: string; settings: { name: string; value: string; min?: string; max?: string }[]; }
interface Quota { name: string; intervals: Record<string, unknown>[]; }
interface RowPolicy { name: string; database: string; table: string; select_filter: string; restrictive: boolean; apply_to_all: boolean; apply_to_roles: string[]; apply_to_except: string[]; }
interface HistoryEntry { id: number; entity_type: string; entity_name: string; action: string; details_json: string | null; actor_user_id: number | null; created_at: string; }

/* ──────────────────────────────────────────────────────────
   Micro-components
   ────────────────────────────────────────────────────────── */

function Spinner({ size = "sm" }: { size?: "sm" | "md" }) {
  const s = size === "sm" ? "h-4 w-4" : "h-6 w-6";
  return <svg className={`${s} animate-spin text-blue-500`} viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>;
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`} />;
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <svg className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "Search..."} className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none" />
    </div>
  );
}

function CountBadge({ count, color = "gray" }: { count: number; color?: string }) {
  const colors: Record<string, string> = {
    gray: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    green: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    red: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${colors[color] || colors.gray}`}>{count}</span>;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-xs text-gray-400 hover:text-blue-500 transition-colors font-medium">
      {copied ? "Copied!" : label || "Copy"}
    </button>
  );
}

function PrivilegeBadge({ access }: { access: string }) {
  const isAdmin = ["CREATE USER", "ALTER USER", "DROP USER", "CREATE ROLE", "DROP ROLE", "GRANT", "SYSTEM", "ACCESS MANAGEMENT"].includes(access);
  const isDML = ["INSERT", "DELETE", "ALTER", "TRUNCATE"].includes(access);
  const c = isAdmin ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : isDML ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${c}`}>{access}</span>;
}

/* Toast */
function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 ${type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
      {message}
      <button onClick={onClose} className="ml-2 text-white/70 hover:text-white">&times;</button>
    </div>
  );
}

/* Nav icons */
function UsersIcon() { return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>; }
function RolesIcon() { return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>; }
function PolicyIcon() { return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>; }
function ProfileIcon() { return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>; }
function QuotaIcon() { return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>; }
function PrivilegeIcon() { return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>; }

/* ──────────────────────────────────────────────────────────
   SQL Preview Modal
   ────────────────────────────────────────────────────────── */

function SQLPreviewModal({ sql, compensationSql, warnings, title, onConfirm, onCancel, loading }: {
  sql: string; compensationSql?: string | null; warnings: string[]; title: string;
  onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto">
        <div className="px-6 py-4 border-b dark:border-gray-700">
          <h3 className="text-lg font-bold dark:text-gray-100">{title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Review the SQL that will be submitted as a proposal</p>
        </div>
        <div className="px-6 py-4 space-y-4">
          {warnings.length > 0 && (
            <div className="space-y-1">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-lg px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
                  <svg className="h-4 w-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                  {w}
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">SQL Preview</label>
            <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 font-mono text-sm text-green-400 whitespace-pre-wrap overflow-x-auto">
              {sql}
            </div>
            <div className="mt-1 flex justify-end">
              <CopyButton text={sql} label="Copy SQL" />
            </div>
          </div>
          {compensationSql && (
            <div>
              <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Rollback SQL</label>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 font-mono text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap">
                {compensationSql}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t dark:border-gray-700 flex items-center justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">Cancel</button>
          <button onClick={onConfirm} disabled={loading} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-1.5">
            {loading ? <><Spinner size="sm" /> Submitting...</> : "Submit as Proposal"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   History Drawer
   ────────────────────────────────────────────────────────── */

function HistoryDrawer({ entityName, history, onClose }: { entityName: string; history: HistoryEntry[]; onClose: () => void }) {
  return (
    <div className="fixed inset-y-0 right-0 z-40 w-96 bg-white dark:bg-gray-900 shadow-2xl border-l dark:border-gray-700 flex flex-col">
      <div className="px-4 py-3 border-b dark:border-gray-700 flex items-center justify-between flex-shrink-0">
        <div>
          <h3 className="font-bold text-sm dark:text-gray-100">History</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{entityName}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg">&times;</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {history.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No history yet</p>
        ) : (
          history.map(h => (
            <div key={h.id} className="border dark:border-gray-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{h.action}</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">{new Date(h.created_at).toLocaleString()}</span>
              </div>
              {h.details_json && (
                <pre className="text-[10px] text-gray-500 dark:text-gray-400 whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 rounded p-2 mt-1 font-mono">{h.details_json}</pre>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Main AdminConsole
   ────────────────────────────────────────────────────────── */

export default function AdminConsole() {
  const { user } = useAuth();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clusterId, setClusterId] = useState<number>(0);
  const [section, setSection] = useState<Section>("users");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Data
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [profiles, setProfiles] = useState<SettingsProfile[]>([]);
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [rowPolicies, setRowPolicies] = useState<RowPolicy[]>([]);
  const [databases, setDatabases] = useState<string[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // Selection
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<AdminRole | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<SettingsProfile | null>(null);
  const [selectedQuota, setSelectedQuota] = useState<Quota | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<RowPolicy | null>(null);

  // Search
  const [search, setSearch] = useState("");

  // History drawer
  const [historyEntity, setHistoryEntity] = useState<string>("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Action wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardSection, setWizardSection] = useState<Section>("users");

  // SQL preview modal
  const [previewModal, setPreviewModal] = useState<{
    title: string; sql: string; compensationSql?: string | null; warnings: string[];
    onConfirm: () => void;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = user?.role === "admin";
  const canCreate = user?.role === "admin" || user?.role === "editor";

  useEffect(() => { getClusters().then(r => setClusters(r.data)); }, []);

  useEffect(() => {
    if (!clusterId) return;
    setSelectedUser(null); setSelectedRole(null); setSelectedProfile(null);
    setSelectedQuota(null); setSelectedPolicy(null);
    setSearch("");
    loadData();
  }, [clusterId, section]);

  const loadData = async () => {
    if (!clusterId) return;
    setListLoading(true);
    try {
      if (section === "users") { const r = await getAdminUsers(clusterId); setUsers(r.data); }
      else if (section === "roles") { const r = await getAdminRoles(clusterId); setRoles(r.data); }
      else if (section === "profiles") { const r = await getSettingsProfiles(clusterId); setProfiles(r.data); }
      else if (section === "quotas") { const r = await getQuotas(clusterId); setQuotas(r.data); }
      else if (section === "row_policies") { const r = await getRowPolicies(clusterId); setRowPolicies(r.data); }
      else if (section === "privileges") {
        const r = await getDatabases(clusterId);
        setDatabases(r.data.map((d: { name: string }) => d.name));
        // also load users/roles for targets
        const [ur, rr] = await Promise.all([getAdminUsers(clusterId), getAdminRoles(clusterId)]);
        setUsers(ur.data); setRoles(rr.data);
      }
    } catch { setToast({ message: "Failed to load data", type: "error" }); }
    setListLoading(false);
  };

  const loadHistory = async (entityType: string, name: string) => {
    setHistoryEntity(name);
    setHistoryOpen(true);
    try {
      const res = entityType === "user" ? await getAdminUserHistory(name, clusterId) : await getAdminRoleHistory(name, clusterId);
      setHistory(res.data);
    } catch { setHistory([]); }
  };

  const submitProposal = async (title: string, ops: { operation_type: string; params: Record<string, unknown> }[], reason: string) => {
    setSubmitting(true);
    try {
      await createProposal({ cluster_id: clusterId, title, operations: ops, reason });
      setToast({ message: `Proposal "${title}" created! Go to Proposals to approve/execute.`, type: "success" });
      setPreviewModal(null);
      setWizardOpen(false);
      loadData();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setToast({ message: axErr.response?.data?.detail || "Failed to create proposal", type: "error" });
    }
    setSubmitting(false);
  };

  const requestPreview = async (opType: string, params: Record<string, unknown>, title: string, reason: string) => {
    try {
      const r = await getSQLPreview(opType, params);
      setPreviewModal({
        title,
        sql: r.data.sql,
        compensationSql: r.data.compensation_sql,
        warnings: r.data.warnings || [],
        onConfirm: () => submitProposal(title, [{ operation_type: opType, params }], reason),
      });
    } catch {
      setToast({ message: "Failed to generate SQL preview", type: "error" });
    }
  };

  // Nav
  const navItems: { key: Section; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "users", label: "Users", icon: <UsersIcon />, count: users.length || undefined },
    { key: "roles", label: "Roles", icon: <RolesIcon />, count: roles.length || undefined },
    { key: "row_policies", label: "Row Policies", icon: <PolicyIcon />, count: rowPolicies.length || undefined },
    { key: "profiles", label: "Profiles", icon: <ProfileIcon />, count: profiles.length || undefined },
    { key: "quotas", label: "Quotas", icon: <QuotaIcon />, count: quotas.length || undefined },
    { key: "privileges", label: "Privileges", icon: <PrivilegeIcon /> },
  ];

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Preview modal */}
      {previewModal && (
        <SQLPreviewModal
          sql={previewModal.sql} compensationSql={previewModal.compensationSql}
          warnings={previewModal.warnings} title={previewModal.title}
          onConfirm={previewModal.onConfirm} onCancel={() => setPreviewModal(null)} loading={submitting}
        />
      )}

      {/* History drawer */}
      {historyOpen && <HistoryDrawer entityName={historyEntity} history={history} onClose={() => setHistoryOpen(false)} />}

      {/* Top bar */}
      <div className="flex items-center justify-between px-1 pb-3 border-b dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold dark:text-gray-100">Admin Console</h1>
          <select value={clusterId} onChange={e => setClusterId(+e.target.value)}
            className="border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 px-3 py-1.5 text-sm">
            <option value={0}>Select cluster</option>
            {clusters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {canCreate && clusterId > 0 && (
          <button onClick={() => { setWizardSection(section); setWizardOpen(true); }}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            New Action
          </button>
        )}
      </div>

      {!clusterId ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">Select a cluster to manage access entities</p>
        </div>
      ) : (
        <div className="flex-1 flex gap-0 mt-2 min-h-0 overflow-hidden">
          {/* LEFT: Nav sidebar */}
          <div className="w-44 flex-shrink-0 border-r dark:border-gray-700 flex flex-col">
            <nav className="flex-1 overflow-y-auto py-1">
              {navItems.map(item => (
                <button key={item.key}
                  onClick={() => { setSection(item.key); setWizardOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    section === item.key
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 font-medium border-r-2 border-blue-600"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}>
                  {item.icon}
                  <span>{item.label}</span>
                  {item.count !== undefined && <CountBadge count={item.count} color={section === item.key ? "blue" : "gray"} />}
                </button>
              ))}
            </nav>
            <div className="border-t dark:border-gray-700 p-3 text-[10px] text-gray-400 dark:text-gray-500">
              All changes go through proposals for safe execution.
            </div>
          </div>

          {/* MIDDLE: Entity list */}
          <div className="w-72 flex-shrink-0 border-r dark:border-gray-700 flex flex-col overflow-hidden">
            <div className="p-2 border-b dark:border-gray-700 flex-shrink-0">
              <SearchInput value={search} onChange={setSearch} placeholder={`Search ${section}...`} />
            </div>
            <div className="flex-1 overflow-y-auto">
              {listLoading ? (
                <div className="p-3 space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : (
                <>
                  {section === "users" && <UserList users={users} search={search} selected={selectedUser} onSelect={setSelectedUser} />}
                  {section === "roles" && <RoleList roles={roles} search={search} selected={selectedRole} onSelect={setSelectedRole} />}
                  {section === "row_policies" && <PolicyList policies={rowPolicies} search={search} selected={selectedPolicy} onSelect={setSelectedPolicy} />}
                  {section === "profiles" && <ProfileList profiles={profiles} search={search} selected={selectedProfile} onSelect={setSelectedProfile} />}
                  {section === "quotas" && <QuotaList quotas={quotas} search={search} selected={selectedQuota} onSelect={setSelectedQuota} />}
                  {section === "privileges" && (
                    <div className="p-3 text-xs text-gray-500 dark:text-gray-400">
                      <p className="mb-2 font-medium">Use the "New Action" button to grant or revoke privileges via proposals.</p>
                      <p>Databases available: {databases.length}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* RIGHT: Inspector */}
          <div className="flex-1 overflow-y-auto p-4 min-w-0">
            {wizardOpen ? (
              <ActionWizard
                section={wizardSection} clusterId={clusterId}
                users={users} roles={roles} profiles={profiles} quotas={quotas} databases={databases}
                requestPreview={requestPreview}
                onClose={() => setWizardOpen(false)}
              />
            ) : (
              <>
                {section === "users" && (selectedUser ? <UserInspector user={selectedUser} onHistory={() => loadHistory("user", selectedUser.name)} /> : <EmptyInspector msg="Select a user to inspect" />)}
                {section === "roles" && (selectedRole ? <RoleInspector role={selectedRole} onHistory={() => loadHistory("role", selectedRole.name)} /> : <EmptyInspector msg="Select a role to inspect" />)}
                {section === "row_policies" && (selectedPolicy ? <PolicyInspector policy={selectedPolicy} /> : <EmptyInspector msg="Select a row policy to inspect" />)}
                {section === "profiles" && (selectedProfile ? <ProfileInspector profile={selectedProfile} /> : <EmptyInspector msg="Select a profile to inspect" />)}
                {section === "quotas" && (selectedQuota ? <QuotaInspector quota={selectedQuota} /> : <EmptyInspector msg="Select a quota to inspect" />)}
                {section === "privileges" && <EmptyInspector msg='Click "New Action" to grant or revoke privileges' />}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyInspector({ msg }: { msg: string }) {
  return <div className="flex items-center justify-center h-full"><p className="text-sm text-gray-400 dark:text-gray-500">{msg}</p></div>;
}

/* ──────────────────────────────────────────────────────────
   Entity Lists
   ────────────────────────────────────────────────────────── */

function UserList({ users, search, selected, onSelect }: { users: AdminUser[]; search: string; selected: AdminUser | null; onSelect: (u: AdminUser) => void }) {
  const filtered = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()));
  if (filtered.length === 0) return <p className="text-xs text-gray-400 dark:text-gray-500 p-4 text-center">{users.length === 0 ? "No users found. Collect a snapshot first." : "No matching users."}</p>;
  return (
    <ul className="py-1">{filtered.map(u => (
      <li key={u.name}>
        <button onClick={() => onSelect(u)} className={`w-full text-left px-3 py-2 text-sm transition-colors border-l-2 ${selected?.name === u.name ? "bg-blue-50 border-blue-600 dark:bg-blue-900/20 dark:border-blue-500" : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
          <div className="font-medium dark:text-gray-100">{u.name}</div>
          <div className="flex gap-2 mt-0.5">
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{u.auth_type || "?"}</span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{u.roles.length} roles</span>
          </div>
        </button>
      </li>
    ))}</ul>
  );
}

function RoleList({ roles, search, selected, onSelect }: { roles: AdminRole[]; search: string; selected: AdminRole | null; onSelect: (r: AdminRole) => void }) {
  const filtered = roles.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));
  if (filtered.length === 0) return <p className="text-xs text-gray-400 dark:text-gray-500 p-4 text-center">No roles found.</p>;
  return (
    <ul className="py-1">{filtered.map(r => (
      <li key={r.name}>
        <button onClick={() => onSelect(r)} className={`w-full text-left px-3 py-2 text-sm transition-colors border-l-2 ${selected?.name === r.name ? "bg-blue-50 border-blue-600 dark:bg-blue-900/20 dark:border-blue-500" : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
          <div className="font-medium dark:text-gray-100">{r.name}</div>
          <div className="flex gap-2 mt-0.5">
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{r.members.length} members</span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{r.direct_grants.length} grants</span>
          </div>
        </button>
      </li>
    ))}</ul>
  );
}

function PolicyList({ policies, search, selected, onSelect }: { policies: RowPolicy[]; search: string; selected: RowPolicy | null; onSelect: (p: RowPolicy) => void }) {
  const filtered = policies.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.database.toLowerCase().includes(search.toLowerCase()));
  if (filtered.length === 0) return <p className="text-xs text-gray-400 dark:text-gray-500 p-4 text-center">No row policies found.</p>;
  return (
    <ul className="py-1">{filtered.map(p => (
      <li key={`${p.name}-${p.database}-${p.table}`}>
        <button onClick={() => onSelect(p)} className={`w-full text-left px-3 py-2 text-sm transition-colors border-l-2 ${selected?.name === p.name ? "bg-blue-50 border-blue-600 dark:bg-blue-900/20 dark:border-blue-500" : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
          <div className="font-medium dark:text-gray-100">{p.name}</div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono">{p.database}.{p.table}</div>
        </button>
      </li>
    ))}</ul>
  );
}

function ProfileList({ profiles, search, selected, onSelect }: { profiles: SettingsProfile[]; search: string; selected: SettingsProfile | null; onSelect: (p: SettingsProfile) => void }) {
  const filtered = profiles.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  if (filtered.length === 0) return <p className="text-xs text-gray-400 dark:text-gray-500 p-4 text-center">No settings profiles found.</p>;
  return (
    <ul className="py-1">{filtered.map(p => (
      <li key={p.name}>
        <button onClick={() => onSelect(p)} className={`w-full text-left px-3 py-2 text-sm transition-colors border-l-2 ${selected?.name === p.name ? "bg-blue-50 border-blue-600 dark:bg-blue-900/20 dark:border-blue-500" : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
          <div className="font-medium dark:text-gray-100">{p.name}</div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{p.settings.length} settings</div>
        </button>
      </li>
    ))}</ul>
  );
}

function QuotaList({ quotas, search, selected, onSelect }: { quotas: Quota[]; search: string; selected: Quota | null; onSelect: (q: Quota) => void }) {
  const filtered = quotas.filter(q => q.name.toLowerCase().includes(search.toLowerCase()));
  if (filtered.length === 0) return <p className="text-xs text-gray-400 dark:text-gray-500 p-4 text-center">No quotas found.</p>;
  return (
    <ul className="py-1">{filtered.map(q => (
      <li key={q.name}>
        <button onClick={() => onSelect(q)} className={`w-full text-left px-3 py-2 text-sm transition-colors border-l-2 ${selected?.name === q.name ? "bg-blue-50 border-blue-600 dark:bg-blue-900/20 dark:border-blue-500" : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
          <div className="font-medium dark:text-gray-100">{q.name}</div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{q.intervals.length} interval(s)</div>
        </button>
      </li>
    ))}</ul>
  );
}

/* ──────────────────────────────────────────────────────────
   Inspectors
   ────────────────────────────────────────────────────────── */

type UserTab = "overview" | "roles" | "privileges";

function UserInspector({ user, onHistory }: { user: AdminUser; onHistory: () => void }) {
  const [tab, setTab] = useState<UserTab>("overview");
  const tabs: { key: UserTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "roles", label: `Roles (${user.roles.length})` },
    { key: "privileges", label: "Privileges" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-lg">{user.name[0]?.toUpperCase()}</div>
          <div>
            <h2 className="text-lg font-bold dark:text-gray-100">{user.name}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{user.auth_type || "Unknown auth"} &middot; {user.roles.length} roles</p>
          </div>
        </div>
        <button onClick={onHistory} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">View History</button>
      </div>

      <div className="flex gap-0.5 mb-4 border-b dark:border-gray-700">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${tab === t.key ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
            <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Authentication</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500 dark:text-gray-400 text-xs">Auth Type</span><p className="font-medium dark:text-gray-100">{user.auth_type || "—"}</p></div>
              <div><span className="text-gray-500 dark:text-gray-400 text-xs">Host IPs</span><p className="font-medium dark:text-gray-100">{user.host_ip.length > 0 ? user.host_ip.join(", ") : "Any"}</p></div>
              <div><span className="text-gray-500 dark:text-gray-400 text-xs">Default Roles</span><p className="font-medium dark:text-gray-100">{user.default_roles.length > 0 ? user.default_roles.join(", ") : "—"}</p></div>
              <div><span className="text-gray-500 dark:text-gray-400 text-xs">Assigned Roles</span><p className="font-medium dark:text-gray-100">{user.roles.length > 0 ? user.roles.join(", ") : "—"}</p></div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4 text-center">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{user.roles.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Roles</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4 text-center">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{user.default_roles.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Default Roles</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4 text-center">
              <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">{user.host_ip.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Host IPs</p>
            </div>
          </div>
        </div>
      )}

      {tab === "roles" && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
          {user.roles.length === 0 ? <p className="text-sm text-gray-400 dark:text-gray-500">No roles assigned</p> : (
            <div className="flex flex-wrap gap-2">
              {user.roles.map(r => (
                <span key={r} className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-sm font-medium text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                  <RolesIcon /> {r}
                  {user.default_roles.includes(r) && <span className="text-[9px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1 rounded">default</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "privileges" && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            For detailed effective privileges with inheritance explanation, use the <span className="font-medium text-blue-600 dark:text-blue-400">RBAC Intelligence</span> page.
          </p>
        </div>
      )}
    </div>
  );
}

type RoleTab = "members" | "grants" | "inheritance";

function RoleInspector({ role, onHistory }: { role: AdminRole; onHistory: () => void }) {
  const [tab, setTab] = useState<RoleTab>("members");
  const tabs: { key: RoleTab; label: string }[] = [
    { key: "members", label: `Members (${role.members.length})` },
    { key: "grants", label: `Grants (${role.direct_grants.length})` },
    { key: "inheritance", label: `Inherited (${role.inherited_roles.length})` },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400"><RolesIcon /></div>
          <div>
            <h2 className="text-lg font-bold dark:text-gray-100">{role.name}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{role.members.length} members &middot; {role.direct_grants.length} grants</p>
          </div>
        </div>
        <button onClick={onHistory} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">View History</button>
      </div>

      <div className="flex gap-0.5 mb-4 border-b dark:border-gray-700">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${tab === t.key ? "border-purple-600 text-purple-600 dark:text-purple-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "members" && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
          {role.members.length === 0 ? <p className="text-sm text-gray-400 dark:text-gray-500">No members</p> : (
            <div className="flex flex-wrap gap-2">
              {role.members.map(m => (
                <span key={m} className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm font-medium dark:text-gray-300 flex items-center gap-1.5">
                  <UsersIcon /> {m}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "grants" && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-hidden">
          {role.direct_grants.length === 0 ? <p className="text-sm text-gray-400 dark:text-gray-500 p-4">No direct grants</p> : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700"><tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Access</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Database</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Table</th>
                </tr></thead>
                <tbody>
                  {role.direct_grants.map((g, i) => (
                    <tr key={i} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-2"><PrivilegeBadge access={g.access_type} /></td>
                      <td className="px-4 py-2 text-xs dark:text-gray-300 font-mono">{g.database || "*"}</td>
                      <td className="px-4 py-2 text-xs dark:text-gray-300 font-mono">{g.table || "*"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700">
                <CopyButton text={role.direct_grants.map(g => `GRANT ${g.access_type} ON ${g.database || "*"}.${g.table || "*"} TO ${role.name}`).join(";\n")} label="Copy GRANT SQL" />
              </div>
            </>
          )}
        </div>
      )}

      {tab === "inheritance" && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
          {role.inherited_roles.length === 0 ? <p className="text-sm text-gray-400 dark:text-gray-500">No inherited roles</p> : (
            <div className="space-y-1">
              {role.inherited_roles.map(r => (
                <div key={r} className="flex items-center gap-2 py-1">
                  <span className="text-gray-300 dark:text-gray-600">├──</span>
                  <span className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-xs font-medium text-purple-700 dark:text-purple-400">{r}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PolicyInspector({ policy }: { policy: RowPolicy }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400"><PolicyIcon /></div>
        <div>
          <h2 className="text-lg font-bold dark:text-gray-100">{policy.name}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{policy.database}.{policy.table}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
          <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Policy Details</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500 dark:text-gray-400 text-xs">Type</span><p className="font-medium dark:text-gray-100">{policy.restrictive ? "RESTRICTIVE" : "PERMISSIVE"}</p></div>
            <div><span className="text-gray-500 dark:text-gray-400 text-xs">Apply to All</span><p className="font-medium dark:text-gray-100">{policy.apply_to_all ? "Yes" : "No"}</p></div>
            <div><span className="text-gray-500 dark:text-gray-400 text-xs">Database</span><p className="font-medium dark:text-gray-100 font-mono">{policy.database}</p></div>
            <div><span className="text-gray-500 dark:text-gray-400 text-xs">Table</span><p className="font-medium dark:text-gray-100 font-mono">{policy.table}</p></div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
          <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Filter Condition</h3>
          <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-3 font-mono text-sm text-green-400 whitespace-pre-wrap">
            {policy.select_filter || "(none)"}
          </div>
          {policy.select_filter && <div className="mt-1 flex justify-end"><CopyButton text={policy.select_filter} /></div>}
        </div>

        {(policy.apply_to_roles.length > 0 || policy.apply_to_except.length > 0) && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
            <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Applies To</h3>
            {policy.apply_to_roles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {policy.apply_to_roles.map(r => (
                  <span key={r} className="px-2 py-1 rounded-lg bg-green-50 dark:bg-green-900/20 text-xs text-green-700 dark:text-green-400 font-medium">{r}</span>
                ))}
              </div>
            )}
            {policy.apply_to_except.length > 0 && (
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Except:</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {policy.apply_to_except.map(r => (
                    <span key={r} className="px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-400 font-medium">{r}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileInspector({ profile }: { profile: SettingsProfile }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 dark:text-teal-400"><ProfileIcon /></div>
        <div>
          <h2 className="text-lg font-bold dark:text-gray-100">{profile.name}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{profile.settings.length} settings</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-hidden">
        {profile.settings.length === 0 ? <p className="text-sm text-gray-400 dark:text-gray-500 p-4">No settings defined</p> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700"><tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Setting</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Value</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Min</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Max</th>
            </tr></thead>
            <tbody>
              {profile.settings.map((s, i) => (
                <tr key={i} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-2 font-mono text-xs font-medium dark:text-gray-100">{s.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-blue-600 dark:text-blue-400">{s.value}</td>
                  <td className="px-4 py-2 text-xs text-gray-400">{s.min || "—"}</td>
                  <td className="px-4 py-2 text-xs text-gray-400">{s.max || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function QuotaInspector({ quota }: { quota: Quota }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400"><QuotaIcon /></div>
        <div>
          <h2 className="text-lg font-bold dark:text-gray-100">{quota.name}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{quota.intervals.length} interval(s)</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
        <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Resource Limits</h3>
        {quota.intervals.length === 0 ? <p className="text-sm text-gray-400 dark:text-gray-500">No intervals defined</p> : (
          <div className="space-y-3">
            {quota.intervals.map((iv, i) => (
              <div key={i} className="border dark:border-gray-700 rounded-lg p-3">
                <div className="text-xs font-medium dark:text-gray-100 mb-2">Duration: {String(iv.duration ?? "—")}</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-gray-500 dark:text-gray-400">Max Queries</span><p className="font-medium dark:text-gray-300">{iv.max_queries != null ? String(iv.max_queries) : "—"}</p></div>
                  <div><span className="text-gray-500 dark:text-gray-400">Max Result Rows</span><p className="font-medium dark:text-gray-300">{iv.max_result_rows != null ? String(iv.max_result_rows) : "—"}</p></div>
                  <div><span className="text-gray-500 dark:text-gray-400">Max Result Bytes</span><p className="font-medium dark:text-gray-300">{iv.max_result_bytes != null ? String(iv.max_result_bytes) : "—"}</p></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Action Wizard — unified proposal wizard
   ────────────────────────────────────────────────────────── */

const OPERATIONS: Record<Section, { value: string; label: string }[]> = {
  users: [
    { value: "create_user", label: "Create User" },
    { value: "alter_user_password", label: "Reset Password" },
    { value: "drop_user", label: "Drop User" },
    { value: "grant_role", label: "Grant Role to User" },
    { value: "revoke_role", label: "Revoke Role from User" },
    { value: "set_default_roles", label: "Set Default Roles" },
    { value: "assign_settings_profile", label: "Assign Settings Profile" },
    { value: "assign_quota", label: "Assign Quota" },
  ],
  roles: [
    { value: "create_role", label: "Create Role" },
    { value: "drop_role", label: "Drop Role" },
    { value: "grant_role", label: "Grant Role" },
    { value: "revoke_role", label: "Revoke Role" },
  ],
  row_policies: [
    { value: "create_row_policy", label: "Create Row Policy" },
    { value: "alter_row_policy", label: "Alter Row Policy" },
    { value: "drop_row_policy", label: "Drop Row Policy" },
  ],
  profiles: [
    { value: "create_settings_profile", label: "Create Profile" },
    { value: "alter_settings_profile", label: "Alter Profile" },
    { value: "drop_settings_profile", label: "Drop Profile" },
  ],
  quotas: [
    { value: "create_quota", label: "Create Quota" },
    { value: "alter_quota", label: "Alter Quota" },
    { value: "drop_quota", label: "Drop Quota" },
  ],
  privileges: [
    { value: "grant_privilege", label: "Grant Privilege" },
    { value: "revoke_privilege", label: "Revoke Privilege" },
  ],
};

const PRIVILEGES = ["SELECT", "INSERT", "ALTER", "CREATE", "DROP", "SHOW", "TRUNCATE", "OPTIMIZE", "KILL QUERY", "CREATE USER", "CREATE ROLE", "GRANT", "SYSTEM"];

function ActionWizard({ section, clusterId, users, roles, profiles, quotas, databases, requestPreview, onClose }: {
  section: Section; clusterId: number;
  users: AdminUser[]; roles: AdminRole[]; profiles: SettingsProfile[]; quotas: Quota[]; databases: string[];
  requestPreview: (opType: string, params: Record<string, unknown>, title: string, reason: string) => void;
  onClose: () => void;
}) {
  const ops = OPERATIONS[section] || [];
  const [opType, setOpType] = useState(ops[0]?.value || "");
  const [form, setForm] = useState<Record<string, string>>({});
  const [tables, setTables] = useState<string[]>([]);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleDbChange = async (db: string) => {
    set("database", db);
    set("table", "");
    if (db) {
      try { const r = await getTables(clusterId, db); setTables(r.data.map((t: { name: string }) => t.name)); } catch { setTables([]); }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params: Record<string, unknown> = { ...form };
    // Parse settings for profile
    if (opType.includes("settings_profile") && form.settings_text) {
      const settingsObj: Record<string, unknown> = {};
      form.settings_text.split("\n").filter(l => l.includes("=")).forEach(l => {
        const [k, v] = l.split("=").map(s => s.trim());
        settingsObj[k] = isNaN(Number(v)) ? v : Number(v);
      });
      params.settings = settingsObj;
      delete params.settings_text;
    }
    // Parse quota intervals
    if (opType.includes("quota") && !opType.startsWith("drop")) {
      const limits: Record<string, number> = {};
      if (form.maxQueries) limits.queries = parseInt(form.maxQueries);
      if (form.maxResultRows) limits.result_rows = parseInt(form.maxResultRows);
      params.intervals = [{ duration: form.duration || "1 hour", limits }];
      delete params.maxQueries; delete params.maxResultRows; delete params.duration;
    }
    // Row policy apply_to
    if (opType.includes("row_policy") && form.apply_to_text) {
      params.apply_to = form.apply_to_text.split(",").map(s => s.trim()).filter(Boolean);
      delete params.apply_to_text;
    }
    const reason = (form.reason as string) || "";
    const label = ops.find(o => o.value === opType)?.label || opType;
    const title = `${label}: ${form.username || form.role_name || form.name || form.target_name || ""}`.trim();
    requestPreview(opType, params, title, reason);
  };

  const userNames = users.map(u => u.name);
  const roleNames = roles.map(r => r.name);
  const profileNames = profiles.map(p => p.name);
  const quotaNames = quotas.map(q => q.name);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold dark:text-gray-100">New Action</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">&times;</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Operation type */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Operation</label>
          <select value={opType} onChange={e => { setOpType(e.target.value); setForm({}); }}
            className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
            {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Dynamic fields based on operation */}
        <div className="grid grid-cols-2 gap-3">
          {/* Username field */}
          {["create_user", "alter_user_password", "drop_user", "set_default_roles"].includes(opType) && (
            <div className="col-span-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Username</label>
              {opType === "create_user" ? (
                <input value={form.username || ""} onChange={e => set("username", e.target.value)} required placeholder="new_user"
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
              ) : (
                <select value={form.username || ""} onChange={e => set("username", e.target.value)} required
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <option value="">Select user</option>
                  {userNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Password */}
          {["create_user", "alter_user_password"].includes(opType) && (
            <div className="col-span-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Password</label>
              <input type="password" value={form.password || ""} onChange={e => set("password", e.target.value)} required
                className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
            </div>
          )}

          {/* Role name */}
          {["create_role", "drop_role", "grant_role", "revoke_role"].includes(opType) && (
            <div className="col-span-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Role Name</label>
              {opType === "create_role" ? (
                <input value={form.role_name || ""} onChange={e => set("role_name", e.target.value)} required placeholder="new_role"
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
              ) : (
                <select value={form.role_name || ""} onChange={e => set("role_name", e.target.value)} required
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <option value="">Select role</option>
                  {roleNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Target for grant/revoke role */}
          {["grant_role", "revoke_role"].includes(opType) && section !== "users" && (
            <>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Target Type</label>
                <select value={form.target_type || "user"} onChange={e => set("target_type", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <option value="user">User</option>
                  <option value="role">Role</option>
                </select>
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Target Name</label>
                <select value={form.target_name || ""} onChange={e => set("target_name", e.target.value)} required
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <option value="">Select target</option>
                  {((form.target_type || "user") === "user" ? userNames : roleNames).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Grant role to user from users section */}
          {["grant_role", "revoke_role"].includes(opType) && section === "users" && (
            <div className="col-span-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">User</label>
              <select value={form.target_name || ""} onChange={e => { set("target_name", e.target.value); set("target_type", "user"); }} required
                className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                <option value="">Select user</option>
                {userNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}

          {/* Assign settings profile */}
          {opType === "assign_settings_profile" && (
            <>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">User</label>
                <select value={form.target_name || ""} onChange={e => set("target_name", e.target.value)} required
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <option value="">Select user</option>
                  {userNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Profile</label>
                <select value={form.profile_name || ""} onChange={e => set("profile_name", e.target.value)} required
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <option value="">Select profile</option>
                  {profileNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Assign quota */}
          {opType === "assign_quota" && (
            <>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">User</label>
                <select value={form.target_name || ""} onChange={e => set("target_name", e.target.value)} required
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <option value="">Select user</option>
                  {userNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Quota</label>
                <select value={form.quota_name || ""} onChange={e => set("quota_name", e.target.value)} required
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <option value="">Select quota</option>
                  {quotaNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Privilege fields */}
          {["grant_privilege", "revoke_privilege"].includes(opType) && (
            <>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Privilege</label>
                <select value={form.privilege || "SELECT"} onChange={e => set("privilege", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  {PRIVILEGES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Database</label>
                <select value={form.database || ""} onChange={e => handleDbChange(e.target.value)} required
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <option value="">Select database</option>
                  {databases.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Table (optional)</label>
                <select value={form.table || ""} onChange={e => set("table", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <option value="">All tables (*)</option>
                  {tables.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Target Type</label>
                <select value={form.target_type || "user"} onChange={e => set("target_type", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <option value="user">User</option>
                  <option value="role">Role</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Target Name</label>
                <select value={form.target_name || ""} onChange={e => set("target_name", e.target.value)} required
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <option value="">Select target</option>
                  {((form.target_type || "user") === "user" ? userNames : roleNames).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Settings profile fields */}
          {["create_settings_profile", "alter_settings_profile", "drop_settings_profile"].includes(opType) && (
            <div className="col-span-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Profile Name</label>
              {opType === "create_settings_profile" ? (
                <input value={form.name || ""} onChange={e => set("name", e.target.value)} required placeholder="profile_name"
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
              ) : (
                <select value={form.name || ""} onChange={e => set("name", e.target.value)} required
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <option value="">Select profile</option>
                  {profileNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Settings text */}
          {["create_settings_profile", "alter_settings_profile"].includes(opType) && (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Settings (key = value, one per line)</label>
              <textarea value={form.settings_text || ""} onChange={e => set("settings_text", e.target.value)} rows={3}
                placeholder={"max_memory_usage = 10000000000\nmax_execution_time = 60"}
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
            </div>
          )}

          {/* Quota fields */}
          {["create_quota", "alter_quota", "drop_quota"].includes(opType) && (
            <div className="col-span-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Quota Name</label>
              {opType === "create_quota" ? (
                <input value={form.name || ""} onChange={e => set("name", e.target.value)} required placeholder="quota_name"
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
              ) : (
                <select value={form.name || ""} onChange={e => set("name", e.target.value)} required
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <option value="">Select quota</option>
                  {quotaNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
            </div>
          )}

          {["create_quota", "alter_quota"].includes(opType) && (
            <>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Interval</label>
                <select value={form.duration || "1 hour"} onChange={e => set("duration", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  {["1 second", "1 minute", "5 minutes", "15 minutes", "1 hour", "1 day", "1 week", "1 month"].map(d =>
                    <option key={d} value={d}>{d}</option>
                  )}
                </select>
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Max Queries</label>
                <input type="number" value={form.maxQueries || ""} onChange={e => set("maxQueries", e.target.value)} placeholder="e.g. 100"
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Max Result Rows</label>
                <input type="number" value={form.maxResultRows || ""} onChange={e => set("maxResultRows", e.target.value)} placeholder="e.g. 1000000"
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
              </div>
            </>
          )}

          {/* Row policy fields */}
          {["create_row_policy", "alter_row_policy", "drop_row_policy"].includes(opType) && (
            <>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Policy Name</label>
                <input value={form.name || ""} onChange={e => set("name", e.target.value)} required placeholder="policy_name"
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Database</label>
                <select value={form.database || ""} onChange={e => handleDbChange(e.target.value)} required
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <option value="">Select database</option>
                  {databases.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Table</label>
                <select value={form.table || ""} onChange={e => set("table", e.target.value)} required
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  <option value="">Select table</option>
                  {tables.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </>
          )}

          {["create_row_policy", "alter_row_policy"].includes(opType) && (
            <>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Filter Condition (SQL expression)</label>
                <input value={form.condition || ""} onChange={e => set("condition", e.target.value)} required placeholder="e.g. department = 'engineering'"
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
              </div>
              <div className="col-span-1">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                  <input type="checkbox" checked={form.restrictive === "true"} onChange={e => set("restrictive", String(e.target.checked))} className="rounded" />
                  Restrictive
                </label>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Apply To (comma-separated roles/users)</label>
                <input value={form.apply_to_text || ""} onChange={e => set("apply_to_text", e.target.value)} placeholder="role1, role2"
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
              </div>
            </>
          )}
        </div>

        {/* Reason */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Reason</label>
          <input value={form.reason || ""} onChange={e => set("reason", e.target.value)} placeholder="Why is this change needed?"
            className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3">
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
            Preview SQL & Submit
          </button>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
        </div>

        {/* Info */}
        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-400">
          All changes are submitted as proposals. An admin must approve and execute the proposal before it takes effect on the ClickHouse cluster.
        </div>
      </form>
    </div>
  );
}
