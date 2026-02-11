import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  getClusters,
  getAdminUsers,
  getAdminRoles,
  getSettingsProfiles,
  getQuotas,
  getAdminUserHistory,
  getAdminRoleHistory,
  createProposal,
  getDatabases,
  getTables,
} from "../api/governance";

interface Cluster { id: number; name: string; }
interface AdminUser { name: string; auth_type: string | null; host_ip: string[]; roles: string[]; default_roles: string[]; }
interface AdminRole { name: string; members: string[]; inherited_roles: string[]; direct_grants: { access_type: string; database: string; table: string }[]; }
interface SettingsProfile { name: string; settings: { name: string; value: string }[]; }
interface Quota { name: string; intervals: Record<string, unknown>[]; }
interface HistoryEntry { id: number; entity_type: string; entity_name: string; action: string; details_json: string | null; actor_user_id: number | null; created_at: string; }

const TABS = ["Users", "Roles", "Privileges", "Settings Profiles", "Quotas"] as const;
type Tab = typeof TABS[number];

export default function AdminConsole() {
  const { user } = useAuth();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clusterId, setClusterId] = useState<number>(0);
  const [tab, setTab] = useState<Tab>("Users");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Data
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [profiles, setProfiles] = useState<SettingsProfile[]>([]);
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<string>("");
  const [databases, setDatabases] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);

  // Forms
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { getClusters().then(r => setClusters(r.data)); }, []);

  useEffect(() => {
    if (!clusterId) return;
    const load = async () => {
      try {
        if (tab === "Users") { const r = await getAdminUsers(clusterId); setUsers(r.data); }
        else if (tab === "Roles") { const r = await getAdminRoles(clusterId); setRoles(r.data); }
        else if (tab === "Settings Profiles") { const r = await getSettingsProfiles(clusterId); setProfiles(r.data); }
        else if (tab === "Quotas") { const r = await getQuotas(clusterId); setQuotas(r.data); }
        if (tab === "Privileges") {
          const r = await getDatabases(clusterId);
          setDatabases(r.data.map((d: { name: string }) => d.name));
        }
      } catch { setError("Failed to load data"); }
    };
    load();
    setSelectedEntity("");
    setHistory([]);
  }, [clusterId, tab]);

  const loadHistory = async (entityType: string, name: string) => {
    setSelectedEntity(name);
    try {
      let res;
      if (entityType === "user") res = await getAdminUserHistory(name, clusterId);
      else res = await getAdminRoleHistory(name, clusterId);
      setHistory(res.data);
    } catch { setHistory([]); }
  };

  const submitProposal = async (title: string, ops: { operation_type: string; params: Record<string, unknown> }[], reason: string) => {
    setError(""); setSuccess("");
    try {
      await createProposal({ cluster_id: clusterId, title, operations: ops, reason });
      setSuccess(`Proposal "${title}" created! Go to Proposals to approve/execute.`);
      setShowForm(false);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to create proposal");
    }
  };

  const isAdmin = user?.role === "admin";
  const canCreate = user?.role === "admin" || user?.role === "editor";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Admin Console</h1>

      {/* Cluster selector */}
      <div className="mb-4 flex items-center gap-4">
        <select value={clusterId} onChange={e => setClusterId(+e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
          <option value={0}>Select cluster</option>
          {clusters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {!clusterId && <p className="text-gray-400 dark:text-gray-500">Select a cluster to manage.</p>}

      {clusterId > 0 && (
        <>
          {/* Tabs */}
          <div className="flex border-b mb-4 dark:border-gray-700">
            {TABS.map(t => (
              <button key={t} onClick={() => { setTab(t); setShowForm(false); setSuccess(""); }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                }`}>{t}</button>
            ))}
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400">{error}</div>}
          {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg mb-4 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400">{success}</div>}

          {/* ── Users tab ─────────────────────────── */}
          {tab === "Users" && (
            <UsersTab users={users} canCreate={canCreate} showForm={showForm} setShowForm={setShowForm}
              roles={roles.map(r => r.name)} profiles={profiles.map(p => p.name)} quotaNames={quotas.map(q => q.name)}
              submitProposal={submitProposal} loadHistory={loadHistory}
              selectedEntity={selectedEntity} history={history} />
          )}

          {/* ── Roles tab ─────────────────────────── */}
          {tab === "Roles" && (
            <RolesTab roles={roles} canCreate={canCreate} showForm={showForm} setShowForm={setShowForm}
              users={users.map(u => u.name)} allRoles={roles.map(r => r.name)}
              submitProposal={submitProposal} loadHistory={loadHistory}
              selectedEntity={selectedEntity} history={history} />
          )}

          {/* ── Privileges tab ────────────────────── */}
          {tab === "Privileges" && (
            <PrivilegesTab canCreate={canCreate} showForm={showForm} setShowForm={setShowForm}
              users={users.map(u => u.name)} roles={roles.map(r => r.name)}
              databases={databases} clusterId={clusterId}
              submitProposal={submitProposal} />
          )}

          {/* ── Settings Profiles tab ─────────────── */}
          {tab === "Settings Profiles" && (
            <ProfilesTab profiles={profiles} canCreate={canCreate} showForm={showForm} setShowForm={setShowForm}
              submitProposal={submitProposal} />
          )}

          {/* ── Quotas tab ────────────────────────── */}
          {tab === "Quotas" && (
            <QuotasTab quotas={quotas} canCreate={canCreate} showForm={showForm} setShowForm={setShowForm}
              submitProposal={submitProposal} />
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════ USERS TAB ═══════════════════════ */
function UsersTab({ users, canCreate, showForm, setShowForm, roles, profiles, quotaNames, submitProposal, loadHistory, selectedEntity, history }: {
  users: AdminUser[]; canCreate: boolean; showForm: boolean; setShowForm: (v: boolean) => void;
  roles: string[]; profiles: string[]; quotaNames: string[];
  submitProposal: (t: string, ops: { operation_type: string; params: Record<string, unknown> }[], r: string) => void;
  loadHistory: (type: string, name: string) => void; selectedEntity: string; history: HistoryEntry[];
}) {
  const [form, setForm] = useState({ username: "", password: "", reason: "", formType: "create_user" as string, role_name: "", profile_name: "", quota_name: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.formType === "create_user") {
      submitProposal(`Create user ${form.username}`, [{ operation_type: "create_user", params: { username: form.username, password: form.password } }], form.reason);
    } else if (form.formType === "alter_user_password") {
      submitProposal(`Reset password for ${form.username}`, [{ operation_type: "alter_user_password", params: { username: form.username, password: form.password } }], form.reason);
    } else if (form.formType === "drop_user") {
      submitProposal(`Drop user ${form.username}`, [{ operation_type: "drop_user", params: { username: form.username } }], form.reason);
    } else if (form.formType === "grant_role") {
      submitProposal(`Grant role ${form.role_name} to ${form.username}`, [{ operation_type: "grant_role", params: { role_name: form.role_name, target_type: "user", target_name: form.username } }], form.reason);
    } else if (form.formType === "assign_settings_profile") {
      submitProposal(`Assign profile ${form.profile_name} to ${form.username}`, [{ operation_type: "assign_settings_profile", params: { target_name: form.username, profile_name: form.profile_name } }], form.reason);
    } else if (form.formType === "assign_quota") {
      submitProposal(`Assign quota ${form.quota_name} to ${form.username}`, [{ operation_type: "assign_quota", params: { target_name: form.username, quota_name: form.quota_name } }], form.reason);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg">ClickHouse Users ({users.length})</h2>
          {canCreate && <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">{showForm ? "Cancel" : "New Action"}</button>}
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white shadow rounded-xl p-4 mb-4 space-y-3 dark:bg-gray-900 dark:shadow-gray-900/50">
            <div>
              <label className="block text-sm font-medium mb-1">Action</label>
              <select value={form.formType} onChange={e => setForm({ ...form, formType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                <option value="create_user">Create User</option>
                <option value="alter_user_password">Reset Password</option>
                <option value="drop_user">Drop User</option>
                <option value="grant_role">Grant Role to User</option>
                <option value="assign_settings_profile">Assign Settings Profile</option>
                <option value="assign_quota">Assign Quota</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Username</label>
                {(form.formType === "create_user") ? (
                  <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" required placeholder="new_user" />
                ) : (
                  <select value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" required>
                    <option value="">Select user</option>
                    {users.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
                  </select>
                )}
              </div>
              {(form.formType === "create_user" || form.formType === "alter_user_password") && (
                <div>
                  <label className="block text-sm font-medium mb-1">Password</label>
                  <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" required />
                </div>
              )}
              {form.formType === "grant_role" && (
                <div>
                  <label className="block text-sm font-medium mb-1">Role</label>
                  <select value={form.role_name} onChange={e => setForm({ ...form, role_name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" required>
                    <option value="">Select role</option>
                    {roles.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              )}
              {form.formType === "assign_settings_profile" && (
                <div>
                  <label className="block text-sm font-medium mb-1">Profile</label>
                  <select value={form.profile_name} onChange={e => setForm({ ...form, profile_name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" required>
                    <option value="">Select profile</option>
                    {profiles.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )}
              {form.formType === "assign_quota" && (
                <div>
                  <label className="block text-sm font-medium mb-1">Quota</label>
                  <select value={form.quota_name} onChange={e => setForm({ ...form, quota_name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" required>
                    <option value="">Select quota</option>
                    {quotaNames.map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Reason</label>
              <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" placeholder="Why?" />
            </div>
            <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">Submit as Proposal</button>
          </form>
        )}

        <div className="bg-white shadow rounded-xl overflow-hidden dark:bg-gray-900 dark:shadow-gray-900/50">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b dark:bg-gray-800 dark:border-gray-700"><tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Auth</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Roles</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Default Roles</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Actions</th>
            </tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.name} className="border-b last:border-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs dark:text-gray-400">{u.auth_type || "-"}</td>
                  <td className="px-4 py-3 text-xs">{u.roles.join(", ") || "-"}</td>
                  <td className="px-4 py-3 text-xs">{u.default_roles.join(", ") || "-"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => loadHistory("user", u.name)}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium">History</button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">No users found. Collect a snapshot first.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* History panel */}
      <div>
        {selectedEntity && (
          <div className="bg-white shadow rounded-xl p-4 dark:bg-gray-900 dark:shadow-gray-900/50">
            <h3 className="font-semibold mb-2">History: {selectedEntity}</h3>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No history yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map(h => (
                  <div key={h.id} className="border rounded p-2 text-xs dark:border-gray-700">
                    <div className="flex justify-between">
                      <span className="font-medium text-blue-700 dark:text-blue-400">{h.action}</span>
                      <span className="text-gray-400 dark:text-gray-500">{new Date(h.created_at).toLocaleString()}</span>
                    </div>
                    {h.details_json && <pre className="mt-1 text-gray-500 whitespace-pre-wrap rounded px-2 py-1 dark:bg-gray-800 dark:text-gray-400">{h.details_json}</pre>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ ROLES TAB ═══════════════════════ */
function RolesTab({ roles, canCreate, showForm, setShowForm, users, allRoles, submitProposal, loadHistory, selectedEntity, history }: {
  roles: AdminRole[]; canCreate: boolean; showForm: boolean; setShowForm: (v: boolean) => void;
  users: string[]; allRoles: string[];
  submitProposal: (t: string, ops: { operation_type: string; params: Record<string, unknown> }[], r: string) => void;
  loadHistory: (type: string, name: string) => void; selectedEntity: string; history: HistoryEntry[];
}) {
  const [form, setForm] = useState({ formType: "create_role", role_name: "", target_name: "", target_type: "user", reason: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.formType === "create_role") {
      submitProposal(`Create role ${form.role_name}`, [{ operation_type: "create_role", params: { role_name: form.role_name } }], form.reason);
    } else if (form.formType === "drop_role") {
      submitProposal(`Drop role ${form.role_name}`, [{ operation_type: "drop_role", params: { role_name: form.role_name } }], form.reason);
    } else if (form.formType === "grant_role") {
      submitProposal(`Grant ${form.role_name} to ${form.target_name}`, [
        { operation_type: "grant_role", params: { role_name: form.role_name, target_type: form.target_type, target_name: form.target_name } }
      ], form.reason);
    } else if (form.formType === "revoke_role") {
      submitProposal(`Revoke ${form.role_name} from ${form.target_name}`, [
        { operation_type: "revoke_role", params: { role_name: form.role_name, target_type: form.target_type, target_name: form.target_name } }
      ], form.reason);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg">ClickHouse Roles ({roles.length})</h2>
          {canCreate && <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">{showForm ? "Cancel" : "New Action"}</button>}
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white shadow rounded-xl p-4 mb-4 space-y-3 dark:bg-gray-900 dark:shadow-gray-900/50">
            <div>
              <label className="block text-sm font-medium mb-1">Action</label>
              <select value={form.formType} onChange={e => setForm({ ...form, formType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                <option value="create_role">Create Role</option>
                <option value="drop_role">Drop Role</option>
                <option value="grant_role">Grant Role to User/Role</option>
                <option value="revoke_role">Revoke Role from User/Role</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Role Name</label>
                {form.formType === "create_role" ? (
                  <input value={form.role_name} onChange={e => setForm({ ...form, role_name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" required placeholder="new_role" />
                ) : (
                  <select value={form.role_name} onChange={e => setForm({ ...form, role_name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" required>
                    <option value="">Select role</option>
                    {allRoles.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                )}
              </div>
              {(form.formType === "grant_role" || form.formType === "revoke_role") && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Target Type</label>
                    <select value={form.target_type} onChange={e => setForm({ ...form, target_type: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                      <option value="user">User</option>
                      <option value="role">Role</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Target Name</label>
                    <select value={form.target_name} onChange={e => setForm({ ...form, target_name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" required>
                      <option value="">Select target</option>
                      {(form.target_type === "user" ? users : allRoles).map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Reason</label>
              <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" placeholder="Why?" />
            </div>
            <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">Submit as Proposal</button>
          </form>
        )}

        <div className="bg-white shadow rounded-xl overflow-hidden dark:bg-gray-900 dark:shadow-gray-900/50">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b dark:bg-gray-800 dark:border-gray-700"><tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Members</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Inherited Roles</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Grants</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Actions</th>
            </tr></thead>
            <tbody>
              {roles.map(r => (
                <tr key={r.name} className="border-b last:border-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-xs">{r.members.join(", ") || "-"}</td>
                  <td className="px-4 py-3 text-xs">{r.inherited_roles.join(", ") || "-"}</td>
                  <td className="px-4 py-3 text-xs">{r.direct_grants.length}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => loadHistory("role", r.name)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">History</button>
                  </td>
                </tr>
              ))}
              {roles.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">No roles found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        {selectedEntity && (
          <div className="bg-white shadow rounded-xl p-4 dark:bg-gray-900 dark:shadow-gray-900/50">
            <h3 className="font-semibold mb-2">History: {selectedEntity}</h3>
            {history.length === 0 ? <p className="text-sm text-gray-400 dark:text-gray-500">No history yet.</p> : (
              <div className="space-y-2">{history.map(h => (
                <div key={h.id} className="border rounded p-2 text-xs dark:border-gray-700">
                  <div className="flex justify-between">
                    <span className="font-medium text-blue-700 dark:text-blue-400">{h.action}</span>
                    <span className="text-gray-400 dark:text-gray-500">{new Date(h.created_at).toLocaleString()}</span>
                  </div>
                  {h.details_json && <pre className="mt-1 text-gray-500 whitespace-pre-wrap rounded px-2 py-1 dark:bg-gray-800 dark:text-gray-400">{h.details_json}</pre>}
                </div>
              ))}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════ PRIVILEGES TAB ═══════════════════ */
function PrivilegesTab({ canCreate, showForm, setShowForm, users, roles, databases, clusterId, submitProposal }: {
  canCreate: boolean; showForm: boolean; setShowForm: (v: boolean) => void;
  users: string[]; roles: string[]; databases: string[]; clusterId: number;
  submitProposal: (t: string, ops: { operation_type: string; params: Record<string, unknown> }[], r: string) => void;
}) {
  const [form, setForm] = useState({ formType: "grant_privilege", privilege: "SELECT", database: "", table: "", target_type: "user", target_name: "", reason: "" });
  const [tables, setTables] = useState<string[]>([]);

  const handleDbChange = async (db: string) => {
    setForm({ ...form, database: db, table: "" });
    if (db) {
      try { const r = await getTables(clusterId, db); setTables(r.data.map((t: { name: string }) => t.name)); } catch { setTables([]); }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const action = form.formType === "grant_privilege" ? "Grant" : "Revoke";
    submitProposal(
      `${action} ${form.privilege} on ${form.database}.${form.table || "*"} to ${form.target_name}`,
      [{ operation_type: form.formType, params: {
        privilege: form.privilege,
        database: form.database,
        table: form.table || undefined,
        target_type: form.target_type,
        target_name: form.target_name,
      }}],
      form.reason,
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-lg">Privilege Wizard</h2>
        {canCreate && <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">{showForm ? "Cancel" : "Grant / Revoke"}</button>}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white shadow rounded-xl p-4 mb-4 space-y-3 dark:bg-gray-900 dark:shadow-gray-900/50">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Action</label>
              <select value={form.formType} onChange={e => setForm({ ...form, formType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                <option value="grant_privilege">GRANT</option>
                <option value="revoke_privilege">REVOKE</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Privilege</label>
              <select value={form.privilege} onChange={e => setForm({ ...form, privilege: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                {["SELECT", "INSERT", "ALTER", "CREATE", "DROP", "SHOW", "TRUNCATE", "OPTIMIZE"].map(p =>
                  <option key={p} value={p}>{p}</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Database</label>
              <select value={form.database} onChange={e => handleDbChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" required>
                <option value="">Select database</option>
                {databases.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Table (optional)</label>
              <select value={form.table} onChange={e => setForm({ ...form, table: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                <option value="">All tables (*)</option>
                {tables.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Target Type</label>
              <select value={form.target_type} onChange={e => setForm({ ...form, target_type: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                <option value="user">User</option>
                <option value="role">Role</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Target Name</label>
              <select value={form.target_name} onChange={e => setForm({ ...form, target_name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" required>
                <option value="">Select target</option>
                {(form.target_type === "user" ? users : roles).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Reason</label>
            <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" placeholder="Why?" />
          </div>
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">Submit as Proposal</button>
        </form>
      )}

      {!showForm && <p className="text-gray-400 text-sm dark:text-gray-500">Click "Grant / Revoke" to open the privilege wizard. All changes go through proposals.</p>}
    </div>
  );
}

/* ═══════════════════ PROFILES TAB ════════════════════ */
function ProfilesTab({ profiles, canCreate, showForm, setShowForm, submitProposal }: {
  profiles: SettingsProfile[]; canCreate: boolean; showForm: boolean; setShowForm: (v: boolean) => void;
  submitProposal: (t: string, ops: { operation_type: string; params: Record<string, unknown> }[], r: string) => void;
}) {
  const [form, setForm] = useState({ formType: "create_settings_profile", name: "", settings: "", reason: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let settingsObj: Record<string, unknown> = {};
    try { settingsObj = Object.fromEntries(form.settings.split("\n").filter(l => l.includes("=")).map(l => { const [k, v] = l.split("=").map(s => s.trim()); return [k, isNaN(Number(v)) ? v : Number(v)]; })); } catch { /* ignore */ }
    submitProposal(`${form.formType === "create_settings_profile" ? "Create" : "Drop"} settings profile ${form.name}`,
      [{ operation_type: form.formType, params: form.formType.startsWith("drop") ? { name: form.name } : { name: form.name, settings: settingsObj } }],
      form.reason);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-lg">Settings Profiles ({profiles.length})</h2>
        {canCreate && <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">{showForm ? "Cancel" : "New Action"}</button>}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white shadow rounded-xl p-4 mb-4 space-y-3 dark:bg-gray-900 dark:shadow-gray-900/50">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Action</label>
              <select value={form.formType} onChange={e => setForm({ ...form, formType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                <option value="create_settings_profile">Create Profile</option>
                <option value="alter_settings_profile">Alter Profile</option>
                <option value="drop_settings_profile">Drop Profile</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Profile Name</label>
              {form.formType === "create_settings_profile" ? (
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" required placeholder="profile_name" />
              ) : (
                <select value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" required>
                  <option value="">Select profile</option>
                  {profiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
              )}
            </div>
          </div>
          {!form.formType.startsWith("drop") && (
            <div>
              <label className="block text-sm font-medium mb-1">Settings (key = value, one per line)</label>
              <textarea value={form.settings} onChange={e => setForm({ ...form, settings: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm font-mono dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" rows={4} placeholder="max_memory_usage = 10000000000&#10;max_execution_time = 60" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Reason</label>
            <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" placeholder="Why?" />
          </div>
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">Submit as Proposal</button>
        </form>
      )}

      <div className="bg-white shadow rounded-xl overflow-hidden dark:bg-gray-900 dark:shadow-gray-900/50">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b dark:bg-gray-800 dark:border-gray-700"><tr>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Name</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Settings</th>
          </tr></thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.name} className="border-b last:border-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-xs font-mono">{p.settings.map(s => `${s.name}=${s.value}`).join(", ") || "-"}</td>
              </tr>
            ))}
            {profiles.length === 0 && <tr><td colSpan={2} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">No settings profiles found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════ QUOTAS TAB ══════════════════════ */
function QuotasTab({ quotas, canCreate, showForm, setShowForm, submitProposal }: {
  quotas: Quota[]; canCreate: boolean; showForm: boolean; setShowForm: (v: boolean) => void;
  submitProposal: (t: string, ops: { operation_type: string; params: Record<string, unknown> }[], r: string) => void;
}) {
  const [form, setForm] = useState({ formType: "create_quota", name: "", duration: "1 hour", maxQueries: "", maxResultRows: "", reason: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.formType === "drop_quota") {
      submitProposal(`Drop quota ${form.name}`, [{ operation_type: "drop_quota", params: { name: form.name } }], form.reason);
    } else {
      const limits: Record<string, number> = {};
      if (form.maxQueries) limits.queries = parseInt(form.maxQueries);
      if (form.maxResultRows) limits.result_rows = parseInt(form.maxResultRows);
      submitProposal(`${form.formType === "create_quota" ? "Create" : "Alter"} quota ${form.name}`,
        [{ operation_type: form.formType, params: { name: form.name, intervals: [{ duration: form.duration, limits }] } }],
        form.reason);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-lg">Quotas ({quotas.length})</h2>
        {canCreate && <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">{showForm ? "Cancel" : "New Action"}</button>}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white shadow rounded-xl p-4 mb-4 space-y-3 dark:bg-gray-900 dark:shadow-gray-900/50">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Action</label>
              <select value={form.formType} onChange={e => setForm({ ...form, formType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                <option value="create_quota">Create Quota</option>
                <option value="alter_quota">Alter Quota</option>
                <option value="drop_quota">Drop Quota</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Quota Name</label>
              {form.formType === "create_quota" ? (
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" required placeholder="quota_name" />
              ) : (
                <select value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" required>
                  <option value="">Select quota</option>
                  {quotas.map(q => <option key={q.name} value={q.name}>{q.name}</option>)}
                </select>
              )}
            </div>
          </div>
          {form.formType !== "drop_quota" && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Interval</label>
                <select value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  {["1 second", "1 minute", "5 minutes", "15 minutes", "1 hour", "1 day", "1 week", "1 month"].map(d =>
                    <option key={d} value={d}>{d}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Queries</label>
                <input type="number" value={form.maxQueries} onChange={e => setForm({ ...form, maxQueries: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" placeholder="e.g. 100" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Result Rows</label>
                <input type="number" value={form.maxResultRows} onChange={e => setForm({ ...form, maxResultRows: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" placeholder="e.g. 1000000" />
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Reason</label>
            <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" placeholder="Why?" />
          </div>
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">Submit as Proposal</button>
        </form>
      )}

      <div className="bg-white shadow rounded-xl overflow-hidden dark:bg-gray-900 dark:shadow-gray-900/50">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b dark:bg-gray-800 dark:border-gray-700"><tr>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Name</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Intervals</th>
          </tr></thead>
          <tbody>
            {quotas.map(q => (
              <tr key={q.name} className="border-b last:border-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                <td className="px-4 py-3 font-medium">{q.name}</td>
                <td className="px-4 py-3 text-xs">{q.intervals.length} interval(s)</td>
              </tr>
            ))}
            {quotas.length === 0 && <tr><td colSpan={2} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">No quotas found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
