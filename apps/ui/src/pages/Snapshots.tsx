import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  getClusters,
  getSnapshots,
  collectSnapshot,
  diffSnapshots,
} from "../api/governance";

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

export default function Snapshots() {
  const { user } = useAuth();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [clusterId, setClusterId] = useState<number | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [error, setError] = useState("");
  const [collecting, setCollecting] = useState(false);

  // diff state
  const [diffFrom, setDiffFrom] = useState<number | null>(null);
  const [diffTo, setDiffTo] = useState<number | null>(null);
  const [diffResult, setDiffResult] = useState<any | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  useEffect(() => {
    getClusters().then((r) => setClusters(r.data));
  }, []);

  useEffect(() => {
    if (clusterId) loadSnapshots();
  }, [clusterId]);

  const loadSnapshots = async () => {
    if (!clusterId) return;
    setError("");
    try {
      const r = await getSnapshots(clusterId);
      setSnapshots(r.data);
    } catch {
      setError("Failed to load snapshots");
    }
  };

  const handleCollect = async () => {
    if (!clusterId) return;
    setCollecting(true);
    setError("");
    try {
      await collectSnapshot(clusterId);
      loadSnapshots();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Collection failed");
    } finally {
      setCollecting(false);
    }
  };

  const handleDiff = async () => {
    if (!diffFrom || !diffTo) return;
    setDiffLoading(true);
    setError("");
    setDiffResult(null);
    try {
      const r = await diffSnapshots(diffFrom, diffTo);
      setDiffResult(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Diff failed");
    } finally {
      setDiffLoading(false);
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "completed": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "running": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "failed": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  const completedSnapshots = snapshots.filter((s) => s.status === "completed");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Snapshots</h1>
        <div className="flex items-center gap-3">
          <select
            value={clusterId ?? ""}
            onChange={(e) => {
              setClusterId(e.target.value ? Number(e.target.value) : null);
              setDiffResult(null);
              setDiffFrom(null);
              setDiffTo(null);
            }}
            className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
          >
            <option value="">Select cluster</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {user?.role === "admin" && clusterId && (
            <button
              onClick={handleCollect}
              disabled={collecting}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {collecting ? "Collecting..." : "Collect Now"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400">
          {error}
        </div>
      )}

      {!clusterId && (
        <div className="text-center text-gray-400 py-16 dark:text-gray-500">Select a cluster to manage snapshots.</div>
      )}

      {clusterId && (
        <>
          {/* Snapshot list */}
          <div className="bg-white shadow rounded-xl overflow-hidden mb-6 dark:bg-gray-900 dark:shadow-gray-900/50">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b dark:bg-gray-800 dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">ID</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Users</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Roles</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Grants</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Collected</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Compare</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                    <td className="px-4 py-3 font-medium">#{s.id}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(s.status)}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{s.user_count ?? "—"}</td>
                    <td className="px-4 py-3">{s.role_count ?? "—"}</td>
                    <td className="px-4 py-3">{s.grant_count ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {s.completed_at
                        ? new Date(s.completed_at).toLocaleString()
                        : s.started_at
                          ? "In progress..."
                          : "—"}
                    </td>
                    <td className="px-4 py-3 space-x-2">
                      {s.status === "completed" && (
                        <>
                          <button
                            onClick={() => setDiffFrom(s.id)}
                            className={`text-xs font-medium px-2 py-1 rounded ${
                              diffFrom === s.id
                                ? "bg-orange-100 text-orange-700"
                                : "text-gray-500 hover:bg-gray-100"
                            }`}
                          >
                            From
                          </button>
                          <button
                            onClick={() => setDiffTo(s.id)}
                            className={`text-xs font-medium px-2 py-1 rounded ${
                              diffTo === s.id
                                ? "bg-blue-100 text-blue-700"
                                : "text-gray-500 hover:bg-gray-100"
                            }`}
                          >
                            To
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {snapshots.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">
                      No snapshots yet. Click "Collect Now" to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Diff controls */}
          {diffFrom && diffTo && diffFrom !== diffTo && (
            <div className="mb-6 flex items-center gap-4">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Comparing snapshot <strong>#{diffFrom}</strong> → <strong>#{diffTo}</strong>
              </span>
              <button
                onClick={handleDiff}
                disabled={diffLoading}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {diffLoading ? "Computing..." : "Compute Diff"}
              </button>
            </div>
          )}

          {/* Diff results */}
          {diffResult && <DiffViewer data={diffResult} />}
        </>
      )}
    </div>
  );
}

function DiffViewer({ data }: { data: any }) {
  const sections: { key: string; label: string }[] = [
    { key: "users", label: "Users" },
    { key: "roles", label: "Roles" },
    { key: "role_grants", label: "Role Grants" },
    { key: "grants", label: "Privileges" },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">
        Diff: Snapshot #{data.from_snapshot_id} → #{data.to_snapshot_id}
      </h2>
      {sections.map((s) => {
        const d = data[s.key] || {};
        const hasChanges =
          (d.added_count || 0) + (d.removed_count || 0) + (d.modified_count || 0) > 0;
        return (
          <div key={s.key} className="bg-white shadow rounded-xl p-5 dark:bg-gray-900 dark:shadow-gray-900/50">
            <h3 className="font-semibold text-sm mb-2">
              {s.label}
              {!hasChanges && (
                <span className="ml-2 text-gray-400 font-normal dark:text-gray-500">No changes</span>
              )}
            </h3>
            {hasChanges && (
              <div className="space-y-2 text-sm">
                {(d.added || []).length > 0 && (
                  <div>
                    <span className="text-green-700 font-medium dark:text-green-400">
                      + {d.added.length} added
                    </span>
                    <div className="mt-1 space-y-1">
                      {d.added.map((item: any, i: number) => (
                        <div key={i} className="bg-green-50 border border-green-200 rounded px-3 py-1.5 font-mono text-xs dark:bg-green-900/30 dark:border-green-800">
                          {item.name || item.granted_role_name || item.access_type || JSON.stringify(item).slice(0, 120)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(d.removed || []).length > 0 && (
                  <div>
                    <span className="text-red-700 font-medium dark:text-red-400">
                      - {d.removed.length} removed
                    </span>
                    <div className="mt-1 space-y-1">
                      {d.removed.map((item: any, i: number) => (
                        <div key={i} className="bg-red-50 border border-red-200 rounded px-3 py-1.5 font-mono text-xs dark:bg-red-900/30 dark:border-red-800">
                          {item.name || item.granted_role_name || item.access_type || JSON.stringify(item).slice(0, 120)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(d.modified || []).length > 0 && (
                  <div>
                    <span className="text-yellow-700 font-medium dark:text-yellow-400">
                      ~ {d.modified.length} modified
                    </span>
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
