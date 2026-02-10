import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  getClusters,
  getDatabases,
  getTables,
  getProposals,
  createProposal,
  approveProposal,
  rejectProposal,
} from "../api/governance";

interface Proposal {
  id: number;
  cluster_id: number;
  created_by: number;
  status: string;
  type: string;
  db_name: string;
  table_name: string;
  target_type: string;
  target_name: string;
  sql_preview: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

interface Cluster {
  id: number;
  name: string;
}

const INITIAL_FORM = {
  cluster_id: "",
  proposal_type: "grant_select",
  db: "",
  table: "",
  target_type: "user",
  target_name: "",
  reason: "",
};

export default function Proposals() {
  const { user } = useAuth();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [databases, setDatabases] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(
    null,
  );

  useEffect(() => {
    loadProposals();
    getClusters().then((r) => setClusters(r.data));
  }, []);

  const loadProposals = async () => {
    try {
      const res = await getProposals();
      setProposals(res.data);
    } catch {
      setError("Failed to load proposals");
    }
  };

  const handleClusterChange = async (clusterId: string) => {
    setForm({ ...form, cluster_id: clusterId, db: "", table: "" });
    setTables([]);
    if (clusterId) {
      try {
        const res = await getDatabases(parseInt(clusterId));
        setDatabases(res.data.map((d: { name: string }) => d.name));
      } catch {
        setDatabases([]);
      }
    }
  };

  const handleDbChange = async (db: string) => {
    setForm({ ...form, db, table: "" });
    if (db && form.cluster_id) {
      try {
        const res = await getTables(parseInt(form.cluster_id), db);
        setTables(res.data.map((t: { name: string }) => t.name));
      } catch {
        setTables([]);
      }
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await createProposal({
        ...form,
        cluster_id: parseInt(form.cluster_id),
        reason: form.reason || undefined,
      });
      setShowForm(false);
      setForm(INITIAL_FORM);
      setSelectedProposal(res.data);
      loadProposals();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to create proposal");
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await approveProposal(id);
      loadProposals();
      setSelectedProposal(null);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to approve");
    }
  };

  const handleReject = async (id: number) => {
    try {
      await rejectProposal(id);
      loadProposals();
      setSelectedProposal(null);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to reject");
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "submitted":
        return "bg-yellow-100 text-yellow-800";
      case "approved":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const canCreate = user?.role === "admin" || user?.role === "editor";

  const clusterName = (id: number) =>
    clusters.find((c) => c.id === id)?.name || `#${id}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Proposals</h1>
        {canCreate && (
          <button
            onClick={() => {
              setShowForm(!showForm);
              setSelectedProposal(null);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            {showForm ? "Cancel" : "New Proposal"}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* ── Create form ──────────────────────────────── */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white shadow rounded-xl p-6 mb-6 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Cluster</label>
              <select
                value={form.cluster_id}
                onChange={(e) => handleClusterChange(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                required
              >
                <option value="">Select cluster</option>
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Proposal Type
              </label>
              <select
                value={form.proposal_type}
                onChange={(e) =>
                  setForm({ ...form, proposal_type: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="grant_select">GRANT SELECT</option>
                <option value="revoke_select">REVOKE SELECT</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Database
              </label>
              <select
                value={form.db}
                onChange={(e) => handleDbChange(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                required
              >
                <option value="">Select database</option>
                {databases.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Table</label>
              <select
                value={form.table}
                onChange={(e) => setForm({ ...form, table: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                required
              >
                <option value="">Select table</option>
                {tables.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Target Type
              </label>
              <select
                value={form.target_type}
                onChange={(e) =>
                  setForm({ ...form, target_type: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="user">User</option>
                <option value="role">Role</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Target Name
              </label>
              <input
                value={form.target_name}
                onChange={(e) =>
                  setForm({ ...form, target_name: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
                required
                placeholder="ClickHouse user or role name"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Reason</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              rows={2}
              placeholder="Why is this access needed?"
            />
          </div>
          <button
            type="submit"
            className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            Create Proposal
          </button>
        </form>
      )}

      {/* ── Detail view ──────────────────────────────── */}
      {selectedProposal && (
        <div className="bg-white shadow rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">
              Proposal #{selectedProposal.id}
            </h2>
            <button
              onClick={() => setSelectedProposal(null)}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm mb-4">
            <div>
              <span className="text-gray-500">Status:</span>{" "}
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(selectedProposal.status)}`}
              >
                {selectedProposal.status}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Type:</span>{" "}
              {selectedProposal.type.replace("_", " ").toUpperCase()}
            </div>
            <div>
              <span className="text-gray-500">Cluster:</span>{" "}
              {clusterName(selectedProposal.cluster_id)}
            </div>
            <div>
              <span className="text-gray-500">Database:</span>{" "}
              {selectedProposal.db_name}
            </div>
            <div>
              <span className="text-gray-500">Table:</span>{" "}
              {selectedProposal.table_name}
            </div>
            <div>
              <span className="text-gray-500">Target:</span>{" "}
              {selectedProposal.target_type}: {selectedProposal.target_name}
            </div>
            <div>
              <span className="text-gray-500">Created:</span>{" "}
              {new Date(selectedProposal.created_at).toLocaleString()}
            </div>
          </div>
          {selectedProposal.reason && (
            <p className="text-sm mb-4">
              <span className="text-gray-500">Reason:</span>{" "}
              {selectedProposal.reason}
            </p>
          )}
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm mb-4 overflow-x-auto">
            {selectedProposal.sql_preview}
          </div>
          <div className="flex gap-2">
            {user?.role === "admin" &&
              selectedProposal.status === "submitted" && (
                <>
                  <button
                    onClick={() => handleApprove(selectedProposal.id)}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(selectedProposal.id)}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                  >
                    Reject
                  </button>
                </>
              )}
            <button
              disabled
              className="bg-gray-300 text-gray-500 px-4 py-2 rounded-lg text-sm font-medium cursor-not-allowed"
              title="Execution not available in MVP"
            >
              Execute (Disabled)
            </button>
          </div>
        </div>
      )}

      {/* ── Table ────────────────────────────────────── */}
      <div className="bg-white shadow rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">
                ID
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">
                Type
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">
                Cluster
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">
                Target
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">
                SQL Preview
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">
                Status
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">
                Created
              </th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((p) => (
              <tr
                key={p.id}
                className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  setSelectedProposal(p);
                  setShowForm(false);
                }}
              >
                <td className="px-4 py-3 font-medium">#{p.id}</td>
                <td className="px-4 py-3">
                  {p.type.replace("_", " ").toUpperCase()}
                </td>
                <td className="px-4 py-3">{clusterName(p.cluster_id)}</td>
                <td className="px-4 py-3">
                  {p.target_type}: {p.target_name}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600 truncate max-w-[200px]">
                  {p.sql_preview}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(p.status)}`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(p.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {proposals.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  No proposals yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
