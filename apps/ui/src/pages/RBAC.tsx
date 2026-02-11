import { useState, useEffect, useCallback, useRef } from "react";
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
  getSnapshots,
  diffSnapshots,
  getRBACRiskSummary,
  getRBACUserRisks,
  getRBACRoleEffectivePrivileges,
} from "../api/governance";
import { useAuth } from "../contexts/AuthContext";

/* ──────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────── */

type NavSection = "users" | "roles" | "objects" | "snapshots";

interface Cluster {
  id: number;
  name: string;
}
interface Snapshot {
  id: number;
  cluster_id: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  created_at: string;
  user_count: number | null;
  role_count: number | null;
  grant_count: number | null;
}
interface RiskSummary {
  high_count: number;
  medium_count: number;
  low_count: number;
  orphan_roles: string[];
  users_with_risks: string[];
  total_users: number;
  total_roles: number;
}

/* ──────────────────────────────────────────────────────────
   Reusable micro-components
   ────────────────────────────────────────────────────────── */

function Spinner({ size = "sm" }: { size?: "sm" | "md" }) {
  const s = size === "sm" ? "h-4 w-4" : "h-6 w-6";
  return (
    <svg className={`${s} animate-spin text-blue-500`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
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
      className="text-xs text-gray-400 hover:text-blue-500 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <svg className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Search..."}
        className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
      />
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${colors[level] || "bg-gray-100 text-gray-600"}`}>
      {level}
    </span>
  );
}

function CountBadge({ count, color = "gray" }: { count: number; color?: string }) {
  const colors: Record<string, string> = {
    gray: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    red: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    green: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    yellow: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
    purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${colors[color] || colors.gray}`}>
      {count}
    </span>
  );
}

function PrivilegeBadge({ access }: { access: string }) {
  const isAdmin = ["CREATE USER", "ALTER USER", "DROP USER", "CREATE ROLE", "DROP ROLE", "GRANT", "SYSTEM", "ACCESS MANAGEMENT"].includes(access);
  const isDML = ["INSERT", "DELETE", "ALTER", "TRUNCATE"].includes(access);
  const color = isAdmin
    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
    : isDML
      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
      : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${color}`}>
      {access}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────
   Section navigation icons (SVGs)
   ────────────────────────────────────────────────────────── */

function UsersIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}
function RolesIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}
function ObjectsIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
    </svg>
  );
}
function SnapshotsIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────
   Main RBAC Page
   ────────────────────────────────────────────────────────── */

export default function RBAC() {
  const { user: appUser } = useAuth();

  // ── Top-level state ──
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clusterId, setClusterId] = useState<number | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotId, setSnapshotId] = useState<number | null>(null);
  const [section, setSection] = useState<NavSection>("users");
  const [error, setError] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [riskSummary, setRiskSummary] = useState<RiskSummary | null>(null);

  // ── Users state ──
  const [chUsers, setChUsers] = useState<any[]>([]);
  const [usersSearch, setUsersSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userRisks, setUserRisks] = useState<any[]>([]);
  const [userLoading, setUserLoading] = useState(false);

  // ── Roles state ──
  const [chRoles, setChRoles] = useState<any[]>([]);
  const [rolesSearch, setRolesSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState<any | null>(null);
  const [roleEffective, setRoleEffective] = useState<any[]>([]);
  const [roleLoading, setRoleLoading] = useState(false);

  // ── Objects state ──
  const [databases, setDatabases] = useState<string[]>([]);
  const [objDb, setObjDb] = useState("");
  const [tables, setTables] = useState<string[]>([]);
  const [objTable, setObjTable] = useState("");
  const [objectAccess, setObjectAccess] = useState<any | null>(null);
  const [objSearch, setObjSearch] = useState("");

  // ── Snapshots / Diff state ──
  const [diffFrom, setDiffFrom] = useState<number | null>(null);
  const [diffTo, setDiffTo] = useState<number | null>(null);
  const [diffResult, setDiffResult] = useState<any | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const [listLoading, setListLoading] = useState(false);

  // ── Init ──
  useEffect(() => {
    getClusters().then((r) => setClusters(r.data));
  }, []);

  const snapshotParams = snapshotId || undefined;

  const loadSnapshots = useCallback(async () => {
    if (!clusterId) return;
    try {
      const r = await getSnapshots(clusterId);
      setSnapshots(r.data);
    } catch { /* ignore */ }
  }, [clusterId]);

  const loadRiskSummary = useCallback(async () => {
    if (!clusterId) return;
    try {
      const r = await getRBACRiskSummary(clusterId, snapshotParams);
      setRiskSummary(r.data);
    } catch { setRiskSummary(null); }
  }, [clusterId, snapshotParams]);

  useEffect(() => {
    if (!clusterId) return;
    setSelectedUser(null);
    setSelectedRole(null);
    setObjectAccess(null);
    setDiffResult(null);
    loadSnapshots();
    loadRiskSummary();
    loadSectionData();
  }, [clusterId, section, snapshotId]);

  const loadSectionData = async () => {
    if (!clusterId) return;
    setError("");
    setListLoading(true);
    try {
      if (section === "users") {
        const r = await getRBACUsers(clusterId, snapshotParams);
        setChUsers(r.data);
      } else if (section === "roles") {
        const r = await getRBACRoles(clusterId, snapshotParams);
        setChRoles(r.data);
      } else if (section === "objects") {
        const r = await getDatabases(clusterId);
        setDatabases(r.data.map((d: any) => d.name));
      } else if (section === "snapshots") {
        await loadSnapshots();
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to load data. Collect a snapshot first.");
    } finally {
      setListLoading(false);
    }
  };

  const handleCollect = async () => {
    if (!clusterId) return;
    setCollecting(true);
    setError("");
    try {
      await collectSnapshot(clusterId);
      await loadSnapshots();
      await loadRiskSummary();
      loadSectionData();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Collection failed");
    } finally {
      setCollecting(false);
    }
  };

  // ── User selection ──
  const handleSelectUser = async (name: string) => {
    if (!clusterId) return;
    setUserLoading(true);
    try {
      const [detail, risks] = await Promise.all([
        getRBACUserDetail(name, clusterId, snapshotParams),
        getRBACUserRisks(name, clusterId, snapshotParams),
      ]);
      setSelectedUser(detail.data);
      setUserRisks(risks.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to load user");
    } finally {
      setUserLoading(false);
    }
  };

  // ── Role selection ──
  const handleSelectRole = async (name: string) => {
    if (!clusterId) return;
    setRoleLoading(true);
    try {
      const [detail, effective] = await Promise.all([
        getRBACRoleDetail(name, clusterId, snapshotParams),
        getRBACRoleEffectivePrivileges(name, clusterId, snapshotParams),
      ]);
      setSelectedRole(detail.data);
      setRoleEffective(effective.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to load role");
    } finally {
      setRoleLoading(false);
    }
  };

  // ── Object helpers ──
  const handleObjDbChange = async (db: string) => {
    setObjDb(db);
    setObjTable("");
    setObjectAccess(null);
    if (db && clusterId) {
      try {
        const r = await getTables(clusterId, db);
        setTables(r.data.map((t: any) => t.name));
      } catch { setTables([]); }
    }
  };

  const handleLookupAccess = async () => {
    if (!clusterId || !objDb) return;
    try {
      const r = await getObjectAccess(clusterId, objDb, objTable || undefined, snapshotParams);
      setObjectAccess(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Lookup failed");
    }
  };

  // ── Diff ──
  const handleDiff = async () => {
    if (!diffFrom || !diffTo) return;
    setDiffLoading(true);
    setError("");
    try {
      const r = await diffSnapshots(diffFrom, diffTo);
      setDiffResult(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Diff failed");
    } finally {
      setDiffLoading(false);
    }
  };

  // ── Filter helpers ──
  const filteredUsers = chUsers.filter((u) =>
    u.name.toLowerCase().includes(usersSearch.toLowerCase())
  );
  const filteredRoles = chRoles.filter((r) =>
    r.name.toLowerCase().includes(rolesSearch.toLowerCase())
  );
  const filteredDbs = databases.filter((d) =>
    d.toLowerCase().includes(objSearch.toLowerCase())
  );

  // ── Nav items ──
  const navItems: { key: NavSection; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "users", label: "Users", icon: <UsersIcon />, badge: chUsers.length || undefined },
    { key: "roles", label: "Roles", icon: <RolesIcon />, badge: chRoles.length || undefined },
    { key: "objects", label: "Objects", icon: <ObjectsIcon /> },
    { key: "snapshots", label: "Snapshots", icon: <SnapshotsIcon />, badge: snapshots.length || undefined },
  ];

  const completedSnapshots = snapshots.filter((s) => s.status === "completed");

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col">
      {/* ── Top bar: cluster/snapshot selectors + actions ── */}
      <div className="flex items-center justify-between px-1 pb-3 border-b dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold dark:text-gray-100">RBAC Intelligence</h1>

          {/* Cluster selector */}
          <select
            value={clusterId ?? ""}
            onChange={(e) => { setClusterId(e.target.value ? Number(e.target.value) : null); setSnapshotId(null); }}
            className="border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 px-3 py-1.5 text-sm"
          >
            <option value="">Select cluster</option>
            {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Snapshot selector */}
          {clusterId && completedSnapshots.length > 0 && (
            <select
              value={snapshotId ?? ""}
              onChange={(e) => setSnapshotId(e.target.value ? Number(e.target.value) : null)}
              className="border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 px-3 py-1.5 text-sm"
            >
              <option value="">Latest snapshot</option>
              {completedSnapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id} — {s.completed_at ? new Date(s.completed_at).toLocaleString() : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Risk summary badges */}
          {riskSummary && (riskSummary.high_count > 0 || riskSummary.medium_count > 0) && (
            <div className="flex items-center gap-1.5 mr-2">
              {riskSummary.high_count > 0 && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-400 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  {riskSummary.high_count} high risk
                </span>
              )}
              {riskSummary.medium_count > 0 && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-xs text-yellow-700 dark:text-yellow-400 font-medium">
                  {riskSummary.medium_count} medium
                </span>
              )}
              {riskSummary.orphan_roles.length > 0 && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400 font-medium">
                  {riskSummary.orphan_roles.length} orphan roles
                </span>
              )}
            </div>
          )}

          {appUser?.role === "admin" && clusterId && (
            <button
              onClick={handleCollect}
              disabled={collecting}
              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {collecting ? <><Spinner size="sm" /> Collecting...</> : "Collect Snapshot"}
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400 text-sm px-4 py-2 rounded-lg mx-1 mt-2 flex-shrink-0 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
        </div>
      )}

      {!clusterId ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <ObjectsIcon />
            <p className="mt-3 text-gray-400 dark:text-gray-500 text-sm">Select a cluster to explore RBAC state</p>
          </div>
        </div>
      ) : (
        /* ── Main 3-pane layout ── */
        <div className="flex-1 flex gap-0 mt-2 min-h-0 overflow-hidden">
          {/* ── LEFT: Navigation ── */}
          <div className="w-48 flex-shrink-0 border-r dark:border-gray-700 flex flex-col">
            <nav className="flex-1 overflow-y-auto py-1">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => { setSection(item.key); setSelectedUser(null); setSelectedRole(null); setObjectAccess(null); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    section === item.key
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 font-medium border-r-2 border-blue-600"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.badge !== undefined && <CountBadge count={item.badge} color={section === item.key ? "blue" : "gray"} />}
                </button>
              ))}
            </nav>

            {/* Risk summary card in sidebar */}
            {riskSummary && (
              <div className="border-t dark:border-gray-700 p-3">
                <h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Risk Overview</h4>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">High</span>
                    <span className={`font-bold ${riskSummary.high_count > 0 ? "text-red-600 dark:text-red-400" : "text-gray-400"}`}>{riskSummary.high_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Medium</span>
                    <span className={`font-bold ${riskSummary.medium_count > 0 ? "text-yellow-600 dark:text-yellow-400" : "text-gray-400"}`}>{riskSummary.medium_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Users</span>
                    <span className="font-medium text-gray-600 dark:text-gray-300">{riskSummary.total_users}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Roles</span>
                    <span className="font-medium text-gray-600 dark:text-gray-300">{riskSummary.total_roles}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── MIDDLE: Entity list ── */}
          <div className="w-72 flex-shrink-0 border-r dark:border-gray-700 flex flex-col overflow-hidden">
            {section === "users" && (
              <>
                <div className="p-2 border-b dark:border-gray-700 flex-shrink-0">
                  <SearchInput value={usersSearch} onChange={setUsersSearch} placeholder="Search users..." />
                </div>
                <div className="flex-1 overflow-y-auto">
                  {listLoading ? (
                    <div className="p-3 space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                  ) : filteredUsers.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 p-4 text-center">
                      {chUsers.length === 0 ? "No users found. Collect a snapshot first." : "No matching users."}
                    </p>
                  ) : (
                    <ul className="py-1">
                      {filteredUsers.map((u) => {
                        const hasRisk = riskSummary?.users_with_risks.includes(u.name);
                        return (
                          <li key={u.name}>
                            <button
                              onClick={() => handleSelectUser(u.name)}
                              className={`w-full text-left px-3 py-2 text-sm transition-colors border-l-2 ${
                                selectedUser?.name === u.name
                                  ? "bg-blue-50 border-blue-600 dark:bg-blue-900/20 dark:border-blue-500"
                                  : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium dark:text-gray-100">{u.name}</span>
                                {hasRisk && <span className="h-1.5 w-1.5 rounded-full bg-red-500" title="Has risks" />}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">{u.role_count} roles</span>
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">{u.direct_grant_count} grants</span>
                                {u.auth_type && <span className="text-[10px] text-gray-400 dark:text-gray-500">{u.auth_type}</span>}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}

            {section === "roles" && (
              <>
                <div className="p-2 border-b dark:border-gray-700 flex-shrink-0">
                  <SearchInput value={rolesSearch} onChange={setRolesSearch} placeholder="Search roles..." />
                </div>
                <div className="flex-1 overflow-y-auto">
                  {listLoading ? (
                    <div className="p-3 space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                  ) : filteredRoles.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 p-4 text-center">
                      {chRoles.length === 0 ? "No roles found." : "No matching roles."}
                    </p>
                  ) : (
                    <ul className="py-1">
                      {filteredRoles.map((r) => {
                        const isOrphan = riskSummary?.orphan_roles.includes(r.name);
                        return (
                          <li key={r.name}>
                            <button
                              onClick={() => handleSelectRole(r.name)}
                              className={`w-full text-left px-3 py-2 text-sm transition-colors border-l-2 ${
                                selectedRole?.name === r.name
                                  ? "bg-blue-50 border-blue-600 dark:bg-blue-900/20 dark:border-blue-500"
                                  : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium dark:text-gray-100">{r.name}</span>
                                {isOrphan && (
                                  <span className="text-[9px] px-1 py-0 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 font-medium">orphan</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">{r.member_count} members</span>
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">{r.direct_grant_count} grants</span>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}

            {section === "objects" && (
              <>
                <div className="p-2 border-b dark:border-gray-700 flex-shrink-0">
                  <SearchInput value={objSearch} onChange={setObjSearch} placeholder="Search databases..." />
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Database</label>
                    <select
                      value={objDb}
                      onChange={(e) => handleObjDbChange(e.target.value)}
                      className="w-full border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 px-2 py-1.5 text-sm"
                    >
                      <option value="">Select database</option>
                      {filteredDbs.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  {objDb && (
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Table (optional)</label>
                      <select
                        value={objTable}
                        onChange={(e) => setObjTable(e.target.value)}
                        className="w-full border rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 px-2 py-1.5 text-sm"
                      >
                        <option value="">All tables</option>
                        {tables.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  )}
                  <button
                    onClick={handleLookupAccess}
                    disabled={!objDb}
                    className="w-full bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    Lookup Access
                  </button>
                </div>
              </>
            )}

            {section === "snapshots" && (
              <div className="flex-1 overflow-y-auto">
                <div className="p-2 border-b dark:border-gray-700 flex-shrink-0">
                  <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {snapshots.length} snapshots
                  </p>
                </div>
                <ul className="py-1">
                  {snapshots.map((s) => (
                    <li key={s.id} className="px-3 py-2 border-b dark:border-gray-700 last:border-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium dark:text-gray-100">#{s.id}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          s.status === "completed"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : s.status === "failed"
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                        }`}>{s.status}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                        {s.completed_at ? new Date(s.completed_at).toLocaleString() : s.started_at ? "In progress..." : "—"}
                      </div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                        {s.user_count ?? 0} users &middot; {s.role_count ?? 0} roles &middot; {s.grant_count ?? 0} grants
                      </div>
                      {s.status === "completed" && (
                        <div className="flex gap-1 mt-1">
                          <button
                            onClick={() => setDiffFrom(s.id)}
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              diffFrom === s.id ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                          >From</button>
                          <button
                            onClick={() => setDiffTo(s.id)}
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              diffTo === s.id ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                          >To</button>
                        </div>
                      )}
                    </li>
                  ))}
                  {snapshots.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 p-4 text-center">No snapshots yet</p>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* ── RIGHT: Inspector pane ── */}
          <div className="flex-1 overflow-y-auto p-4 min-w-0">
            {section === "users" && (
              userLoading ? <InspectorSkeleton /> :
              selectedUser ? <UserInspector data={selectedUser} risks={userRisks} /> :
              <EmptyInspector message="Select a user to inspect" />
            )}

            {section === "roles" && (
              roleLoading ? <InspectorSkeleton /> :
              selectedRole ? <RoleInspector data={selectedRole} effective={roleEffective} orphanRoles={riskSummary?.orphan_roles || []} /> :
              <EmptyInspector message="Select a role to inspect" />
            )}

            {section === "objects" && (
              objectAccess ? <ObjectInspector data={objectAccess} /> :
              <EmptyInspector message="Select a database and click Lookup Access" />
            )}

            {section === "snapshots" && (
              <>
                {diffFrom && diffTo && diffFrom !== diffTo && (
                  <div className="mb-4 flex items-center gap-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Comparing <strong>#{diffFrom}</strong> &rarr; <strong>#{diffTo}</strong>
                    </span>
                    <button
                      onClick={handleDiff}
                      disabled={diffLoading}
                      className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                    >
                      {diffLoading ? <><Spinner size="sm" /> Computing...</> : "Compute Diff"}
                    </button>
                    <button
                      onClick={() => { setDiffFrom(null); setDiffTo(null); setDiffResult(null); }}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >Clear</button>
                  </div>
                )}
                {diffResult ? <DiffViewer data={diffResult} /> : (
                  <EmptyInspector message={
                    diffFrom && diffTo && diffFrom === diffTo
                      ? "Select two different snapshots to compare"
                      : diffFrom || diffTo
                        ? `Select the ${!diffFrom ? '"From"' : '"To"'} snapshot to compare`
                        : "Select From and To snapshots to compare changes"
                  } />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Inspector skeletons / empty states
   ────────────────────────────────────────────────────────── */

function InspectorSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function EmptyInspector({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-sm text-gray-400 dark:text-gray-500">{message}</p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   User Inspector — tabbed
   ────────────────────────────────────────────────────────── */

type UserTab = "overview" | "roles" | "privileges" | "objects" | "risks";

function UserInspector({ data, risks }: { data: any; risks: any[] }) {
  const [tab, setTab] = useState<UserTab>("overview");

  const userTabs: { key: UserTab; label: string; badge?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "roles", label: "Roles", badge: data.all_roles?.length || 0 },
    { key: "privileges", label: "Effective Privileges", badge: data.effective_privileges?.length || 0 },
    { key: "objects", label: "Object Access" },
    { key: "risks", label: "Risks", badge: risks.length || undefined },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-lg">
          {data.name[0]?.toUpperCase()}
        </div>
        <div>
          <h2 className="text-lg font-bold dark:text-gray-100">{data.name}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {data.auth_type || "Unknown auth"} &middot; {data.all_roles?.length || 0} roles &middot; {data.effective_privileges?.length || 0} privileges
          </p>
        </div>
        {risks.length > 0 && (
          <div className="ml-auto flex items-center gap-1">
            {risks.filter((r: any) => r.level === "high").length > 0 && <RiskBadge level="high" />}
            {risks.filter((r: any) => r.level === "medium").length > 0 && <RiskBadge level="medium" />}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 mb-4 border-b dark:border-gray-700">
        {userTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === t.key
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <CountBadge count={t.badge} color={t.key === "risks" && t.badge > 0 ? "red" : "gray"} />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && <UserOverviewTab data={data} />}
      {tab === "roles" && <UserRolesTab data={data} />}
      {tab === "privileges" && <UserPrivilegesTab data={data} />}
      {tab === "objects" && <UserObjectsTab data={data} />}
      {tab === "risks" && <UserRisksTab risks={risks} />}
    </div>
  );
}

function UserOverviewTab({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
        <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Authentication</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400 text-xs">Auth Type</span>
            <p className="font-medium dark:text-gray-100">{data.auth_type || "—"}</p>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400 text-xs">Default Roles All</span>
            <p className="font-medium dark:text-gray-100">{data.default_roles_all ? "Yes" : "No"}</p>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400 text-xs">Host IPs</span>
            <p className="font-medium dark:text-gray-100">{(data.host_ip || []).join(", ") || "Any"}</p>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400 text-xs">Default Roles</span>
            <p className="font-medium dark:text-gray-100">{(data.default_roles || []).join(", ") || "—"}</p>
          </div>
        </div>
      </div>

      {data.settings_profiles && data.settings_profiles.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
          <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Settings Profiles</h3>
          <div className="flex flex-wrap gap-2">
            {data.settings_profiles.map((sp: any, i: number) => (
              <span key={i} className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium dark:text-gray-300">
                {sp.name || JSON.stringify(sp)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4 text-center">
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{data.all_roles?.length || 0}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Roles</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4 text-center">
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{data.effective_privileges?.length || 0}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Privileges</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4 text-center">
          <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">
            {data.all_roles?.filter((r: any) => r.is_direct).length || 0}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Direct Roles</p>
        </div>
      </div>
    </div>
  );
}

function UserRolesTab({ data }: { data: any }) {
  const roles = data.all_roles || [];
  const directRoles = roles.filter((r: any) => r.is_direct);
  const inheritedRoles = roles.filter((r: any) => !r.is_direct);

  return (
    <div className="space-y-4">
      {/* Role hierarchy visualization */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
        <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
          Role Hierarchy
        </h3>
        {roles.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No roles assigned</p>
        ) : (
          <div className="space-y-1">
            {directRoles.map((r: any) => (
              <RoleTreeNode key={r.role_name} role={r} allRoles={roles} depth={0} />
            ))}
          </div>
        )}
      </div>

      {/* Detailed table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
          <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            All Roles ({roles.length})
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Role</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Direct</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Default</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Path</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r: any, i: number) => (
              <tr key={i} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-4 py-2 font-medium dark:text-gray-100">
                  <div className="flex items-center gap-1.5">
                    {r.role_name}
                    <CopyButton text={r.role_name} />
                  </div>
                </td>
                <td className="px-4 py-2">
                  {r.is_direct ? (
                    <span className="text-green-600 dark:text-green-400 text-xs font-medium">Yes</span>
                  ) : (
                    <span className="text-gray-400 text-xs">No</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {r.is_default ? (
                    <span className="text-blue-600 dark:text-blue-400 text-xs font-medium">Yes</span>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 font-mono">{r.path?.join(" → ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleTreeNode({ role, allRoles, depth }: { role: any; allRoles: any[]; depth: number }) {
  const children = allRoles.filter((r: any) =>
    !r.is_direct && r.path?.length > 0 && r.path[r.path.length - 2] === role.role_name
  );

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div className="flex items-center gap-2 py-1">
        {depth > 0 && <span className="text-gray-300 dark:text-gray-600">└─</span>}
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
          role.is_direct
            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
        }`}>
          {role.role_name}
        </span>
        {role.is_default && <span className="text-[9px] text-green-600 dark:text-green-400 font-medium">default</span>}
      </div>
      {children.map((c: any) => (
        <RoleTreeNode key={c.role_name} role={c} allRoles={allRoles} depth={depth + 1} />
      ))}
    </div>
  );
}

function UserPrivilegesTab({ data }: { data: any }) {
  const [filter, setFilter] = useState("");
  const privs: any[] = data.effective_privileges || [];
  const filtered = privs.filter((p: any) =>
    p.access_type.toLowerCase().includes(filter.toLowerCase()) ||
    (p.database || "").toLowerCase().includes(filter.toLowerCase()) ||
    (p.table || "").toLowerCase().includes(filter.toLowerCase()) ||
    (p.source_name || "").toLowerCase().includes(filter.toLowerCase())
  );

  // Group by scope for better readability
  const byDb: Record<string, any[]> = {};
  for (const p of filtered) {
    const key = p.database || "(global)";
    if (!byDb[key]) byDb[key] = [];
    byDb[key].push(p);
  }

  return (
    <div className="space-y-3">
      <SearchInput value={filter} onChange={setFilter} placeholder="Filter privileges..." />

      <div className="text-xs text-gray-500 dark:text-gray-400">
        {filtered.length} privileges across {Object.keys(byDb).length} scope(s)
      </div>

      {Object.entries(byDb).map(([db, privList]) => (
        <div key={db} className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600 dark:text-gray-300 font-mono">{db}</span>
            <CountBadge count={privList.length} color="blue" />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-gray-700">
                <th className="text-left px-4 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Access</th>
                <th className="text-left px-4 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Table</th>
                <th className="text-left px-4 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Source</th>
                <th className="text-left px-4 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Path</th>
              </tr>
            </thead>
            <tbody>
              {privList.map((p: any, i: number) => (
                <tr key={i} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-1.5"><PrivilegeBadge access={p.access_type} /></td>
                  <td className="px-4 py-1.5 text-xs dark:text-gray-300 font-mono">{p.table || "*"}</td>
                  <td className="px-4 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      p.source === "direct"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                    }`}>
                      {p.source === "direct" ? "direct" : `role: ${p.source_name}`}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 font-mono max-w-[200px] truncate">{p.path?.join(" → ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {filtered.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No privileges found</p>
      )}
    </div>
  );
}

function UserObjectsTab({ data }: { data: any }) {
  const privs: any[] = data.effective_privileges || [];

  // Group by database → table
  const objMap: Record<string, Record<string, Set<string>>> = {};
  for (const p of privs) {
    const db = p.database || "(global)";
    const tbl = p.table || "*";
    if (!objMap[db]) objMap[db] = {};
    if (!objMap[db][tbl]) objMap[db][tbl] = new Set();
    objMap[db][tbl].add(p.access_type);
  }

  const entries = Object.entries(objMap);

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Databases/tables this user can access based on effective privileges
      </p>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No object access found</p>
      ) : (
        entries.map(([db, tables]) => (
          <div key={db} className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <ObjectsIcon />
              <span className="font-medium text-sm dark:text-gray-100 font-mono">{db}</span>
              <CopyButton text={db} />
            </div>
            <div className="space-y-1 ml-6">
              {Object.entries(tables).map(([tbl, accessSet]) => (
                <div key={tbl} className="flex items-center gap-2 py-0.5">
                  <span className="text-xs dark:text-gray-300 font-mono">{tbl}</span>
                  <div className="flex flex-wrap gap-0.5">
                    {Array.from(accessSet).sort().map((a) => (
                      <PrivilegeBadge key={a} access={a} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function UserRisksTab({ risks }: { risks: any[] }) {
  const high = risks.filter((r) => r.level === "high");
  const medium = risks.filter((r) => r.level === "medium");
  const low = risks.filter((r) => r.level === "low");

  const RiskGroup = ({ title, items, color }: { title: string; items: any[]; color: string }) => {
    if (items.length === 0) return null;
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-hidden">
        <div className={`px-4 py-2 border-b dark:border-gray-700 flex items-center gap-2 ${
          color === "red" ? "bg-red-50 dark:bg-red-900/10" : color === "yellow" ? "bg-yellow-50 dark:bg-yellow-900/10" : "bg-blue-50 dark:bg-blue-900/10"
        }`}>
          <RiskBadge level={color === "red" ? "high" : color === "yellow" ? "medium" : "low"} />
          <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{title} ({items.length})</span>
        </div>
        <div className="divide-y dark:divide-gray-700">
          {items.map((r, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium dark:text-gray-100">{r.message}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                <span>Type: <span className="font-mono">{r.type}</span></span>
                <span>Source: <span className="font-mono">{r.source}</span></span>
                {r.path?.length > 0 && <span>Path: <span className="font-mono">{r.path.join(" → ")}</span></span>}
              </div>
              {r.privilege && (
                <div className="mt-1">
                  <CopyButton text={`REVOKE ${r.privilege} FROM ${r.source}`} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {risks.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/20 mb-3">
            <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">No risk indicators detected for this user</p>
        </div>
      ) : (
        <>
          <RiskGroup title="High Risk" items={high} color="red" />
          <RiskGroup title="Medium Risk" items={medium} color="yellow" />
          <RiskGroup title="Low Risk" items={low} color="blue" />
        </>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Role Inspector — tabbed
   ────────────────────────────────────────────────────────── */

type RoleTab = "members" | "grants" | "inheritance" | "effective";

function RoleInspector({ data, effective, orphanRoles }: { data: any; effective: any[]; orphanRoles: string[] }) {
  const [tab, setTab] = useState<RoleTab>("members");
  const isOrphan = orphanRoles.includes(data.name);

  const roleTabs: { key: RoleTab; label: string; badge?: number }[] = [
    { key: "members", label: "Members", badge: data.members?.length || 0 },
    { key: "grants", label: "Direct Grants", badge: data.direct_grants?.length || 0 },
    { key: "inheritance", label: "Inheritance", badge: data.inherited_roles?.length || 0 },
    { key: "effective", label: "Effective Privileges", badge: effective.length || 0 },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-lg">
          <RolesIcon />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold dark:text-gray-100">{data.name}</h2>
            {isOrphan && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 font-medium">
                Orphan Role
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {data.members?.length || 0} members &middot; {data.direct_grants?.length || 0} grants &middot; {data.inherited_roles?.length || 0} inherited
          </p>
        </div>
      </div>

      {/* Warning for orphan */}
      {isOrphan && (
        <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-4 text-xs text-yellow-700 dark:text-yellow-400">
          This role has no members (no users or other roles inherit it). Consider whether it can be safely removed.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0.5 mb-4 border-b dark:border-gray-700">
        {roleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === t.key
                ? "border-purple-600 text-purple-600 dark:text-purple-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            {t.label}
            {t.badge !== undefined && t.badge > 0 && <CountBadge count={t.badge} color="gray" />}
          </button>
        ))}
      </div>

      {tab === "members" && <RoleMembersTab data={data} />}
      {tab === "grants" && <RoleGrantsTab data={data} />}
      {tab === "inheritance" && <RoleInheritanceTab data={data} />}
      {tab === "effective" && <RoleEffectiveTab effective={effective} />}
    </div>
  );
}

function RoleMembersTab({ data }: { data: any }) {
  const members = data.members || [];
  const users = members.filter((m: any) => m.type === "user");
  const roles = members.filter((m: any) => m.type === "role");

  return (
    <div className="space-y-3">
      {members.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No members</p>
      ) : (
        <>
          {users.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
              <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Users ({users.length})</h4>
              <div className="flex flex-wrap gap-2">
                {users.map((m: any, i: number) => (
                  <span key={i} className="px-3 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-sm font-medium text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    {m.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {roles.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
              <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Roles ({roles.length})</h4>
              <div className="flex flex-wrap gap-2">
                {roles.map((m: any, i: number) => (
                  <span key={i} className="px-3 py-1 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-sm font-medium text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
                    <RolesIcon />
                    {m.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RoleGrantsTab({ data }: { data: any }) {
  const grants = data.direct_grants || [];
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-hidden">
      {grants.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No direct grants</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Access</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Database</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Table</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Grant Option</th>
            </tr>
          </thead>
          <tbody>
            {grants.map((g: any, i: number) => (
              <tr key={i} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-4 py-2"><PrivilegeBadge access={g.access_type} /></td>
                <td className="px-4 py-2 text-xs dark:text-gray-300 font-mono">{g.database || "*"}</td>
                <td className="px-4 py-2 text-xs dark:text-gray-300 font-mono">{g.table || "*"}</td>
                <td className="px-4 py-2 text-xs">{g.grant_option ? <span className="text-green-600 dark:text-green-400 font-medium">Yes</span> : <span className="text-gray-400">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {grants.length > 0 && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700">
          <CopyButton text={grants.map((g: any) => `GRANT ${g.access_type} ON ${g.database || "*"}.${g.table || "*"} TO ${data.name}`).join(";\n")} />
        </div>
      )}
    </div>
  );
}

function RoleInheritanceTab({ data }: { data: any }) {
  const inherited = data.inherited_roles || [];

  return (
    <div className="space-y-3">
      {inherited.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No inherited roles</p>
      ) : (
        <>
          {/* Visual tree */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 p-4">
            <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Inheritance Graph</h3>
            <div className="font-mono text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 font-medium">{data.name}</span>
              </div>
              {inherited.map((r: any, i: number) => (
                <div key={i} className="ml-4 flex items-center gap-2 py-0.5">
                  <span className="text-gray-300 dark:text-gray-600">├──</span>
                  <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-xs dark:text-gray-300">{r.role_name}</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{r.path?.join(" → ")}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RoleEffectiveTab({ effective }: { effective: any[] }) {
  const [filter, setFilter] = useState("");
  const filtered = effective.filter((p: any) =>
    p.access_type?.toLowerCase().includes(filter.toLowerCase()) ||
    (p.database || "").toLowerCase().includes(filter.toLowerCase()) ||
    (p.source_name || "").toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <SearchInput value={filter} onChange={setFilter} placeholder="Filter privileges..." />
      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No effective privileges</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Access</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Database</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Table</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Source</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Path</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any, i: number) => (
                <tr key={i} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-2"><PrivilegeBadge access={p.access_type} /></td>
                  <td className="px-4 py-2 text-xs dark:text-gray-300 font-mono">{p.database || "*"}</td>
                  <td className="px-4 py-2 text-xs dark:text-gray-300 font-mono">{p.table || "*"}</td>
                  <td className="px-4 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      p.source === "direct"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                    }`}>
                      {p.source === "direct" ? "direct" : `role: ${p.source_name}`}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[10px] text-gray-400 dark:text-gray-500 font-mono max-w-[180px] truncate">{p.path?.join(" → ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Object Access Inspector
   ────────────────────────────────────────────────────────── */

function ObjectInspector({ data }: { data: any }) {
  const [filter, setFilter] = useState("");
  const entries = (data.entries || []).filter((e: any) =>
    e.name.toLowerCase().includes(filter.toLowerCase()) ||
    e.access_types.some((at: string) => at.toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ObjectsIcon />
          <h2 className="text-lg font-bold dark:text-gray-100 font-mono">
            {data.database}{data.table ? `.${data.table}` : ".*"}
          </h2>
          <CountBadge count={data.entries?.length || 0} color="blue" />
        </div>
        <CopyButton text={JSON.stringify(data, null, 2)} />
      </div>

      <SearchInput value={filter} onChange={setFilter} placeholder="Filter by name or privilege..." />

      <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-hidden">
        {entries.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No access found</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Entity</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Type</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Privileges</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Source</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e: any, i: number) => (
                <tr key={i} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-2 font-medium dark:text-gray-100">
                    <div className="flex items-center gap-1.5">
                      {e.name}
                      <CopyButton text={e.name} />
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      e.entity_type === "user"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                    }`}>{e.entity_type}</span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-0.5">
                      {e.access_types.map((at: string) => <PrivilegeBadge key={at} access={at} />)}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{e.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Diff Viewer
   ────────────────────────────────────────────────────────── */

function DiffViewer({ data }: { data: any }) {
  const sections: { key: string; label: string; icon: string }[] = [
    { key: "users", label: "Users", icon: "U" },
    { key: "roles", label: "Roles", icon: "R" },
    { key: "role_grants", label: "Role Grants", icon: "RG" },
    { key: "grants", label: "Privileges", icon: "P" },
  ];

  // Summary stats
  const totalAdded = sections.reduce((s, sec) => s + (data[sec.key]?.added_count || 0), 0);
  const totalRemoved = sections.reduce((s, sec) => s + (data[sec.key]?.removed_count || 0), 0);
  const totalModified = sections.reduce((s, sec) => s + (data[sec.key]?.modified_count || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold dark:text-gray-100">
          Diff: #{data.from_snapshot_id} &rarr; #{data.to_snapshot_id}
        </h2>
        <CopyButton text={JSON.stringify(data, null, 2)} />
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-4 bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 px-4 py-3">
        <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 font-medium">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          +{totalAdded} added
        </span>
        <span className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 font-medium">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          -{totalRemoved} removed
        </span>
        <span className="flex items-center gap-1.5 text-sm text-yellow-600 dark:text-yellow-400 font-medium">
          <span className="h-2 w-2 rounded-full bg-yellow-500" />
          ~{totalModified} modified
        </span>
      </div>

      {sections.map((sec) => {
        const d = data[sec.key] || {};
        const hasChanges = (d.added_count || 0) + (d.removed_count || 0) + (d.modified_count || 0) > 0;

        return (
          <div key={sec.key} className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-400">
                  {sec.icon}
                </span>
                <span className="text-sm font-bold dark:text-gray-100">{sec.label}</span>
              </div>
              {!hasChanges && <span className="text-xs text-gray-400 dark:text-gray-500">No changes</span>}
              {hasChanges && (
                <div className="flex gap-2 text-[10px]">
                  {(d.added_count || 0) > 0 && <span className="text-green-600 dark:text-green-400">+{d.added_count}</span>}
                  {(d.removed_count || 0) > 0 && <span className="text-red-600 dark:text-red-400">-{d.removed_count}</span>}
                  {(d.modified_count || 0) > 0 && <span className="text-yellow-600 dark:text-yellow-400">~{d.modified_count}</span>}
                </div>
              )}
            </div>

            {hasChanges && (
              <div className="p-4 space-y-3">
                {(d.added || []).length > 0 && (
                  <div>
                    <span className="text-xs font-bold text-green-600 dark:text-green-400 block mb-1">
                      Added ({d.added.length})
                    </span>
                    <div className="space-y-1">
                      {d.added.map((item: any, i: number) => (
                        <div key={i} className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded px-3 py-1.5 text-xs font-mono dark:text-green-300">
                          {item.name || item.granted_role_name || item.access_type || JSON.stringify(item).slice(0, 150)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(d.removed || []).length > 0 && (
                  <div>
                    <span className="text-xs font-bold text-red-600 dark:text-red-400 block mb-1">
                      Removed ({d.removed.length})
                    </span>
                    <div className="space-y-1">
                      {d.removed.map((item: any, i: number) => (
                        <div key={i} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-3 py-1.5 text-xs font-mono dark:text-red-300">
                          {item.name || item.granted_role_name || item.access_type || JSON.stringify(item).slice(0, 150)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(d.modified || []).length > 0 && (
                  <div>
                    <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400 block mb-1">
                      Modified ({d.modified.length})
                    </span>
                    <div className="space-y-1">
                      {d.modified.map((item: any, i: number) => (
                        <div key={i} className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded px-3 py-1.5">
                          <div className="text-[10px] text-red-600 dark:text-red-400 font-mono line-through">
                            {item.old?.name || JSON.stringify(item.old).slice(0, 100)}
                          </div>
                          <div className="text-[10px] text-green-600 dark:text-green-400 font-mono">
                            {item.new?.name || JSON.stringify(item.new).slice(0, 100)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
