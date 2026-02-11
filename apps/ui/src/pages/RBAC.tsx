import { useState, useEffect } from "react";
import {
  getClusters,
  getRBACUsers,
  getRBACUserDetail,
  getRBACRoles,
  getRBACRoleDetail,
  getObjectAccess,
  getDatabases,
  getTables,
  collectSnapshot,
} from "../api/governance";
import { useAuth } from "../contexts/AuthContext";

type Tab = "users" | "roles" | "objects";

interface Cluster {
  id: number;
  name: string;
}

export default function RBAC() {
  const { user: appUser } = useAuth();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clusterId, setClusterId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("users");
  const [error, setError] = useState("");
  const [collecting, setCollecting] = useState(false);

  // ── Users tab state ─────────────────────────────────
  const [chUsers, setChUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  // ── Roles tab state ─────────────────────────────────
  const [chRoles, setChRoles] = useState<any[]>([]);
  const [selectedRole, setSelectedRole] = useState<any | null>(null);

  // ── Objects tab state ───────────────────────────────
  const [databases, setDatabases] = useState<string[]>([]);
  const [objDb, setObjDb] = useState("");
  const [tables, setTables] = useState<string[]>([]);
  const [objTable, setObjTable] = useState("");
  const [objectAccess, setObjectAccess] = useState<any | null>(null);

  useEffect(() => {
    getClusters().then((r) => setClusters(r.data));
  }, []);

  useEffect(() => {
    if (!clusterId) return;
    setSelectedUser(null);
    setSelectedRole(null);
    setObjectAccess(null);
    loadTabData();
  }, [clusterId, tab]);

  const loadTabData = async () => {
    if (!clusterId) return;
    setError("");
    try {
      if (tab === "users") {
        const r = await getRBACUsers(clusterId);
        setChUsers(r.data);
      } else if (tab === "roles") {
        const r = await getRBACRoles(clusterId);
        setChRoles(r.data);
      } else if (tab === "objects") {
        const r = await getDatabases(clusterId);
        setDatabases(r.data.map((d: any) => d.name));
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to load data. Collect a snapshot first.");
    }
  };

  const handleCollect = async () => {
    if (!clusterId) return;
    setCollecting(true);
    setError("");
    try {
      await collectSnapshot(clusterId);
      loadTabData();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Collection failed");
    } finally {
      setCollecting(false);
    }
  };

  const handleSelectUser = async (name: string) => {
    if (!clusterId) return;
    try {
      const r = await getRBACUserDetail(name, clusterId);
      setSelectedUser(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to load user");
    }
  };

  const handleSelectRole = async (name: string) => {
    if (!clusterId) return;
    try {
      const r = await getRBACRoleDetail(name, clusterId);
      setSelectedRole(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to load role");
    }
  };

  const handleObjDbChange = async (db: string) => {
    setObjDb(db);
    setObjTable("");
    setObjectAccess(null);
    if (db && clusterId) {
      try {
        const r = await getTables(clusterId, db);
        setTables(r.data.map((t: any) => t.name));
      } catch {
        setTables([]);
      }
    }
  };

  const handleLookupAccess = async () => {
    if (!clusterId || !objDb) return;
    try {
      const r = await getObjectAccess(clusterId, objDb, objTable || undefined);
      setObjectAccess(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Lookup failed");
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "users", label: "Users" },
    { key: "roles", label: "Roles" },
    { key: "objects", label: "Object Permissions" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">RBAC Explorer</h1>
        <div className="flex items-center gap-3">
          <select
            value={clusterId ?? ""}
            onChange={(e) => setClusterId(e.target.value ? Number(e.target.value) : null)}
            className="border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 px-3 py-2 text-sm"
          >
            <option value="">Select cluster</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {appUser?.role === "admin" && clusterId && (
            <button
              onClick={handleCollect}
              disabled={collecting}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {collecting ? "Collecting..." : "Collect Snapshot"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b dark:border-gray-700">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSelectedUser(null); setSelectedRole(null); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!clusterId && (
        <div className="text-center text-gray-400 dark:text-gray-500 py-16">Select a cluster to explore RBAC state.</div>
      )}

      {/* ── Users Tab ──────────────────────────────── */}
      {clusterId && tab === "users" && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-1 bg-white shadow rounded-xl dark:bg-gray-900 dark:shadow-gray-900/50 p-4 max-h-[600px] overflow-y-auto">
            <h2 className="font-semibold text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
              ClickHouse Users ({chUsers.length})
            </h2>
            <ul className="space-y-0.5">
              {chUsers.map((u) => (
                <li key={u.name}>
                  <button
                    onClick={() => handleSelectUser(u.name)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedUser?.name === u.name
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium"
                        : "hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {u.role_count} roles &middot; {u.direct_grant_count} grants
                      {u.auth_type && <> &middot; {u.auth_type}</>}
                    </div>
                  </button>
                </li>
              ))}
              {chUsers.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500 px-2">No users found</p>}
            </ul>
          </div>
          <div className="col-span-2">
            {selectedUser ? <UserDetail data={selectedUser} /> : (
              <div className="bg-white shadow rounded-xl dark:bg-gray-900 dark:shadow-gray-900/50 p-8 text-center text-gray-400 dark:text-gray-500">
                Select a user to view details
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Roles Tab ──────────────────────────────── */}
      {clusterId && tab === "roles" && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-1 bg-white shadow rounded-xl dark:bg-gray-900 dark:shadow-gray-900/50 p-4 max-h-[600px] overflow-y-auto">
            <h2 className="font-semibold text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
              ClickHouse Roles ({chRoles.length})
            </h2>
            <ul className="space-y-0.5">
              {chRoles.map((r) => (
                <li key={r.name}>
                  <button
                    onClick={() => handleSelectRole(r.name)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedRole?.name === r.name
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium"
                        : "hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {r.member_count} members &middot; {r.direct_grant_count} grants
                    </div>
                  </button>
                </li>
              ))}
              {chRoles.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500 px-2">No roles found</p>}
            </ul>
          </div>
          <div className="col-span-2">
            {selectedRole ? <RoleDetail data={selectedRole} /> : (
              <div className="bg-white shadow rounded-xl dark:bg-gray-900 dark:shadow-gray-900/50 p-8 text-center text-gray-400 dark:text-gray-500">
                Select a role to view details
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Objects Tab ────────────────────────────── */}
      {clusterId && tab === "objects" && (
        <div>
          <div className="bg-white shadow rounded-xl dark:bg-gray-900 dark:shadow-gray-900/50 p-4 mb-6">
            <div className="flex items-end gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Database</label>
                <select
                  value={objDb}
                  onChange={(e) => handleObjDbChange(e.target.value)}
                  className="border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 px-3 py-2 text-sm min-w-[200px]"
                >
                  <option value="">Select database</option>
                  {databases.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Table (optional)</label>
                <select
                  value={objTable}
                  onChange={(e) => setObjTable(e.target.value)}
                  className="border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 px-3 py-2 text-sm min-w-[200px]"
                >
                  <option value="">All tables</option>
                  {tables.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleLookupAccess}
                disabled={!objDb}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Lookup Access
              </button>
            </div>
          </div>
          {objectAccess && (
            <div className="bg-white shadow rounded-xl dark:bg-gray-900 dark:shadow-gray-900/50 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                <span className="font-medium text-sm">
                  Access to {objectAccess.database}
                  {objectAccess.table ? `.${objectAccess.table}` : ".*"}
                </span>
                <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">
                  ({objectAccess.entries.length} entries)
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Privileges</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {objectAccess.entries.map((e: any, i: number) => (
                    <tr key={i} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-3 font-medium">{e.name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          e.entity_type === "user" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                        }`}>
                          {e.entity_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {e.access_types.map((at: string) => (
                            <span key={at} className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 px-2 py-0.5 rounded text-xs font-mono">
                              {at}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{e.source}</td>
                    </tr>
                  ))}
                  {objectAccess.entries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                        No access found for this object.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────── */

function UserDetail({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="bg-white shadow rounded-xl dark:bg-gray-900 dark:shadow-gray-900/50 p-5">
        <h2 className="text-lg font-bold mb-3">{data.name}</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-gray-500 dark:text-gray-400">Auth type:</span> {data.auth_type || "—"}</div>
          <div><span className="text-gray-500 dark:text-gray-400">Default roles all:</span> {data.default_roles_all ? "Yes" : "No"}</div>
          <div><span className="text-gray-500 dark:text-gray-400">Host IPs:</span> {(data.host_ip || []).join(", ") || "—"}</div>
          <div><span className="text-gray-500 dark:text-gray-400">Default roles:</span> {(data.default_roles || []).join(", ") || "—"}</div>
        </div>
      </div>

      {/* Roles */}
      <div className="bg-white shadow rounded-xl dark:bg-gray-900 dark:shadow-gray-900/50 p-5">
        <h3 className="font-semibold text-sm mb-3">Roles ({data.all_roles?.length || 0})</h3>
        {data.all_roles?.length > 0 ? (
          <table className="w-full text-sm">
            <thead><tr className="border-b dark:border-gray-700">
              <th className="text-left py-1.5 font-medium text-gray-500 dark:text-gray-400">Role</th>
              <th className="text-left py-1.5 font-medium text-gray-500 dark:text-gray-400">Direct?</th>
              <th className="text-left py-1.5 font-medium text-gray-500 dark:text-gray-400">Default?</th>
              <th className="text-left py-1.5 font-medium text-gray-500 dark:text-gray-400">Path</th>
            </tr></thead>
            <tbody>
              {data.all_roles.map((r: any, i: number) => (
                <tr key={i} className="border-b dark:border-gray-700 last:border-0">
                  <td className="py-1.5 font-medium">{r.role_name}</td>
                  <td className="py-1.5">{r.is_direct ? "Yes" : "No"}</td>
                  <td className="py-1.5">{r.is_default ? "Yes" : "—"}</td>
                  <td className="py-1.5 text-gray-500 dark:text-gray-400 text-xs font-mono">{r.path?.join(" → ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-gray-400 dark:text-gray-500 text-sm">No roles assigned.</p>}
      </div>

      {/* Effective Privileges */}
      <div className="bg-white shadow rounded-xl dark:bg-gray-900 dark:shadow-gray-900/50 p-5">
        <h3 className="font-semibold text-sm mb-3">
          Effective Privileges ({data.effective_privileges?.length || 0})
        </h3>
        {data.effective_privileges?.length > 0 ? (
          <table className="w-full text-sm">
            <thead><tr className="border-b dark:border-gray-700">
              <th className="text-left py-1.5 font-medium text-gray-500 dark:text-gray-400">Access</th>
              <th className="text-left py-1.5 font-medium text-gray-500 dark:text-gray-400">Database</th>
              <th className="text-left py-1.5 font-medium text-gray-500 dark:text-gray-400">Table</th>
              <th className="text-left py-1.5 font-medium text-gray-500 dark:text-gray-400">Source</th>
              <th className="text-left py-1.5 font-medium text-gray-500 dark:text-gray-400">Origin</th>
            </tr></thead>
            <tbody>
              {data.effective_privileges.map((p: any, i: number) => (
                <tr key={i} className="border-b dark:border-gray-700 last:border-0">
                  <td className="py-1.5">
                    <span className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded text-xs font-mono">
                      {p.access_type}
                    </span>
                  </td>
                  <td className="py-1.5">{p.database || "*"}</td>
                  <td className="py-1.5">{p.table || "*"}</td>
                  <td className="py-1.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      p.source === "direct" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                    }`}>
                      {p.source === "direct" ? "direct" : `role: ${p.source_name}`}
                    </span>
                  </td>
                  <td className="py-1.5 text-gray-500 dark:text-gray-400 text-xs font-mono">{p.path?.join(" → ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-gray-400 dark:text-gray-500 text-sm">No effective privileges.</p>}
      </div>
    </div>
  );
}

function RoleDetail({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="bg-white shadow rounded-xl p-5">
        <h2 className="text-lg font-bold mb-1">{data.name}</h2>
      </div>

      {/* Members */}
      <div className="bg-white shadow rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-3">Members ({data.members?.length || 0})</h3>
        {data.members?.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {data.members.map((m: any, i: number) => (
              <span key={i} className={`px-3 py-1 rounded-lg text-sm font-medium ${
                m.type === "user" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
              }`}>
                {m.name} ({m.type})
              </span>
            ))}
          </div>
        ) : <p className="text-gray-400 text-sm">No members.</p>}
      </div>

      {/* Inherited Roles */}
      {data.inherited_roles?.length > 0 && (
        <div className="bg-white shadow rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-3">Inherited Roles</h3>
          <ul className="space-y-1">
            {data.inherited_roles.map((r: any, i: number) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{r.role_name}</span>
                <span className="text-gray-500 text-xs ml-2 font-mono">{r.path?.join(" → ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Direct Grants */}
      <div className="bg-white shadow rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-3">Direct Grants ({data.direct_grants?.length || 0})</h3>
        {data.direct_grants?.length > 0 ? (
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <th className="text-left py-1.5 font-medium text-gray-500">Access</th>
              <th className="text-left py-1.5 font-medium text-gray-500">Database</th>
              <th className="text-left py-1.5 font-medium text-gray-500">Table</th>
              <th className="text-left py-1.5 font-medium text-gray-500">Grant Option</th>
            </tr></thead>
            <tbody>
              {data.direct_grants.map((g: any, i: number) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1.5">
                    <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-mono">
                      {g.access_type}
                    </span>
                  </td>
                  <td className="py-1.5">{g.database || "*"}</td>
                  <td className="py-1.5">{g.table || "*"}</td>
                  <td className="py-1.5">{g.grant_option ? "Yes" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-gray-400 text-sm">No direct grants on this role.</p>}
      </div>
    </div>
  );
}
