import { useState, useEffect } from "react";
import { getAuthAudit } from "../api/auth";
import { getGovAudit } from "../api/governance";

interface AuditEvent {
  id: number;
  actor_user_id: number | null;
  action: string;
  target?: string;
  entity_type?: string;
  entity_id?: number;
  metadata_json: string | null;
  created_at: string;
  source: string;
}

export default function Audit() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [source, setSource] = useState<"all" | "auth" | "governance">("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadEvents();
  }, [source]);

  const loadEvents = async () => {
    setError("");
    setLoading(true);
    try {
      let combined: AuditEvent[] = [];
      if (source === "all" || source === "auth") {
        try {
          const authRes = await getAuthAudit();
          combined = [
            ...combined,
            ...authRes.data.map((e: AuditEvent) => ({ ...e, source: "auth" })),
          ];
        } catch {
          /* may fail if not admin */
        }
      }
      if (source === "all" || source === "governance") {
        try {
          const govRes = await getGovAudit();
          combined = [
            ...combined,
            ...govRes.data.map((e: AuditEvent) => ({
              ...e,
              source: "governance",
            })),
          ];
        } catch {
          /* may fail for non-admin/researcher */
        }
      }
      combined.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setEvents(combined);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to load audit events");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold dark:text-white">Audit Log</h1>
        <div className="flex items-center gap-3">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as "all" | "auth" | "governance")}
            className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
          >
            <option value="all">All Sources</option>
            <option value="auth">Auth Service</option>
            <option value="governance">Governance Service</option>
          </select>
          <button
            onClick={loadEvents}
            disabled={loading}
            className="bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      <div className="bg-white shadow dark:bg-gray-900 dark:shadow-gray-900/50 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b dark:bg-gray-800 dark:border-gray-700">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
                Time
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
                Source
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
                Action
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
                Actor
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr
                key={`${e.source}-${e.id}-${i}`}
                className="border-b last:border-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      e.source === "auth"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {e.source}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium">{e.action}</td>
                <td className="px-4 py-3 dark:text-gray-300">
                  {e.actor_user_id ?? "-"}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs font-mono truncate max-w-xs">
                  {e.target ||
                    (e.entity_type
                      ? `${e.entity_type}:${e.entity_id}`
                      : "")}
                  {e.metadata_json && (
                    <span className="ml-1">{e.metadata_json}</span>
                  )}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-gray-400 dark:text-gray-500"
                >
                  {loading ? "Loading..." : "No audit events found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
