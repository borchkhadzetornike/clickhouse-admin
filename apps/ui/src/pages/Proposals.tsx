import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  getClusters,
  getDatabases,
  getTables,
  getProposals,
  createProposal,
  createLegacyProposal,
  approveProposal,
  rejectProposal,
  dryRunProposal,
  executeProposal,
  getProposalJobs,
} from "../api/governance";

interface Operation {
  id: number;
  order_index: number;
  operation_type: string;
  params_json: string;
  sql_preview: string | null;
  compensation_sql: string | null;
}

interface Proposal {
  id: number;
  cluster_id: number;
  created_by: number;
  status: string;
  type: string;
  title: string | null;
  description: string | null;
  db_name: string | null;
  table_name: string | null;
  target_type: string | null;
  target_name: string | null;
  sql_preview: string | null;
  compensation_sql: string | null;
  reason: string | null;
  is_elevated: boolean;
  job_id: number | null;
  executed_by: number | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
  operations: Operation[];
}

interface JobStep {
  step_index: number;
  operation_type: string;
  sql_statement: string;
  compensation_sql: string | null;
  status: string;
  result_message: string | null;
  executed_at: string | null;
}

interface Job {
  id: number;
  proposal_id: number;
  mode: string;
  status: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  steps: JobStep[];
}

interface Cluster { id: number; name: string; }

export default function Proposals() {
  const { user } = useAuth();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dryRunResult, setDryRunResult] = useState<Job | null>(null);
  const [executing, setExecuting] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);

  // Legacy form state
  const [legacyForm, setLegacyForm] = useState({
    cluster_id: "", proposal_type: "grant_select", db: "", table: "", target_type: "user", target_name: "", reason: "",
  });
  const [databases, setDatabases] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);

  useEffect(() => {
    loadProposals();
    getClusters().then(r => setClusters(r.data));
  }, []);

  const loadProposals = async () => {
    try { const res = await getProposals(); setProposals(res.data); } catch { setError("Failed to load proposals"); }
  };

  const loadJobs = async (proposalId: number) => {
    try { const res = await getProposalJobs(proposalId); setJobs(res.data); } catch { setJobs([]); }
  };

  const selectProposal = (p: Proposal) => {
    setSelectedProposal(p);
    setShowForm(false);
    setDryRunResult(null);
    loadJobs(p.id);
  };

  // Legacy form handlers
  const handleClusterChange = async (clusterId: string) => {
    setLegacyForm({ ...legacyForm, cluster_id: clusterId, db: "", table: "" });
    setTables([]);
    if (clusterId) {
      try { const res = await getDatabases(parseInt(clusterId)); setDatabases(res.data.map((d: { name: string }) => d.name)); } catch { setDatabases([]); }
    }
  };

  const handleDbChange = async (db: string) => {
    setLegacyForm({ ...legacyForm, db, table: "" });
    if (db && legacyForm.cluster_id) {
      try { const res = await getTables(parseInt(legacyForm.cluster_id), db); setTables(res.data.map((t: { name: string }) => t.name)); } catch { setTables([]); }
    }
  };

  const handleLegacyCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await createLegacyProposal({ ...legacyForm, cluster_id: parseInt(legacyForm.cluster_id), reason: legacyForm.reason || undefined });
      setShowForm(false);
      selectProposal(res.data);
      loadProposals();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to create proposal");
    }
  };

  const handleApprove = async (id: number) => {
    try { await approveProposal(id); loadProposals(); if (selectedProposal?.id === id) { const res = await getProposals(); const updated = res.data.find((p: Proposal) => p.id === id); if (updated) setSelectedProposal(updated); } } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to approve");
    }
  };

  const handleReject = async (id: number) => {
    try { await rejectProposal(id); loadProposals(); setSelectedProposal(null); } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to reject");
    }
  };

  const handleDryRun = async (id: number) => {
    setDryRunning(true); setDryRunResult(null); setError("");
    try {
      const res = await dryRunProposal(id);
      setDryRunResult(res.data);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Dry-run failed");
    } finally { setDryRunning(false); }
  };

  const handleExecute = async (id: number) => {
    if (!confirm("Execute this proposal against ClickHouse? This will make real changes.")) return;
    setExecuting(true); setError("");
    try {
      const res = await executeProposal(id);
      setDryRunResult(null);
      loadProposals();
      loadJobs(id);
      // Refresh selected proposal
      const pRes = await getProposals();
      const updated = pRes.data.find((p: Proposal) => p.id === id);
      if (updated) setSelectedProposal(updated);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Execution failed");
    } finally { setExecuting(false); }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "submitted": return "bg-yellow-100 text-yellow-800";
      case "approved": return "bg-blue-100 text-blue-800";
      case "executed": return "bg-green-100 text-green-800";
      case "rejected": return "bg-red-100 text-red-800";
      case "executing": return "bg-purple-100 text-purple-800";
      case "failed": return "bg-red-100 text-red-800";
      case "partially_executed": return "bg-orange-100 text-orange-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const stepStatusColor = (s: string) => {
    switch (s) {
      case "success": case "dry_run_ok": return "text-green-600";
      case "error": return "text-red-600";
      case "skipped": return "text-gray-400";
      default: return "text-yellow-600";
    }
  };

  const canCreate = user?.role === "admin" || user?.role === "editor";
  const clusterName = (id: number) => clusters.find(c => c.id === id)?.name || `#${id}`;
  const proposalTitle = (p: Proposal) => p.title || `${p.type?.replace("_", " ").toUpperCase()} on ${p.db_name}.${p.table_name}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Proposals</h1>
        {canCreate && (
          <button onClick={() => { setShowForm(!showForm); setSelectedProposal(null); }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            {showForm ? "Cancel" : "Quick Grant/Revoke"}
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}

      {/* Legacy quick-create form */}
      {showForm && (
        <form onSubmit={handleLegacyCreate} className="bg-white shadow rounded-xl p-6 mb-6 space-y-4">
          <p className="text-sm text-gray-500 mb-2">Quick grant/revoke proposal. For advanced operations, use the Admin Console.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Cluster</label>
              <select value={legacyForm.cluster_id} onChange={e => handleClusterChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required>
                <option value="">Select cluster</option>
                {clusters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label className="block text-sm font-medium mb-1">Type</label>
              <select value={legacyForm.proposal_type} onChange={e => setLegacyForm({ ...legacyForm, proposal_type: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="grant_select">GRANT SELECT</option>
                <option value="revoke_select">REVOKE SELECT</option>
              </select></div>
            <div><label className="block text-sm font-medium mb-1">Database</label>
              <select value={legacyForm.db} onChange={e => handleDbChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required>
                <option value="">Select database</option>
                {databases.map(d => <option key={d} value={d}>{d}</option>)}
              </select></div>
            <div><label className="block text-sm font-medium mb-1">Table</label>
              <select value={legacyForm.table} onChange={e => setLegacyForm({ ...legacyForm, table: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" required>
                <option value="">Select table</option>
                {tables.map(t => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label className="block text-sm font-medium mb-1">Target Type</label>
              <select value={legacyForm.target_type} onChange={e => setLegacyForm({ ...legacyForm, target_type: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="user">User</option>
                <option value="role">Role</option>
              </select></div>
            <div><label className="block text-sm font-medium mb-1">Target Name</label>
              <input value={legacyForm.target_name} onChange={e => setLegacyForm({ ...legacyForm, target_name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" required placeholder="ClickHouse user or role name" /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">Reason</label>
            <textarea value={legacyForm.reason} onChange={e => setLegacyForm({ ...legacyForm, reason: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Why?" /></div>
          <button type="submit" className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700">Create Proposal</button>
        </form>
      )}

      {/* ── Detail View ──────────────────────────── */}
      {selectedProposal && (
        <div className="bg-white shadow rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Proposal #{selectedProposal.id}: {proposalTitle(selectedProposal)}</h2>
            <button onClick={() => setSelectedProposal(null)} className="text-gray-400 hover:text-gray-600 text-sm">Close</button>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm mb-4">
            <div><span className="text-gray-500">Status:</span>{" "}
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(selectedProposal.status)}`}>{selectedProposal.status}</span></div>
            <div><span className="text-gray-500">Type:</span> {selectedProposal.type}</div>
            <div><span className="text-gray-500">Cluster:</span> {clusterName(selectedProposal.cluster_id)}</div>
            <div><span className="text-gray-500">Created:</span> {new Date(selectedProposal.created_at).toLocaleString()}</div>
            {selectedProposal.executed_at && <div><span className="text-gray-500">Executed:</span> {new Date(selectedProposal.executed_at).toLocaleString()}</div>}
          </div>

          {selectedProposal.reason && <p className="text-sm mb-4"><span className="text-gray-500">Reason:</span> {selectedProposal.reason}</p>}

          {/* Operations */}
          {selectedProposal.operations.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-2">Operations ({selectedProposal.operations.length})</h3>
              <div className="space-y-1">
                {selectedProposal.operations.map((op, i) => (
                  <div key={op.id} className="bg-gray-50 rounded p-2 text-xs font-mono">
                    <span className="text-gray-400 mr-2">#{i + 1}</span>
                    <span className="text-blue-700">{op.operation_type}</span>
                    {op.sql_preview && <span className="ml-2 text-gray-600">— {op.sql_preview}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SQL Preview */}
          {selectedProposal.sql_preview && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-2">SQL Preview</h3>
              <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre-wrap">
                {selectedProposal.sql_preview}
              </div>
            </div>
          )}

          {/* Compensation SQL */}
          {selectedProposal.compensation_sql && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-2">Compensation SQL (Rollback)</h3>
              <div className="bg-gray-900 text-orange-400 p-4 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre-wrap">
                {selectedProposal.compensation_sql}
              </div>
            </div>
          )}

          {/* Dry-run results */}
          {dryRunResult && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-2">Dry-Run Results — {dryRunResult.status}</h3>
              <div className="border rounded-lg overflow-hidden">
                {dryRunResult.steps.map((s, i) => (
                  <div key={i} className={`px-3 py-2 text-xs border-b last:border-0 flex items-center gap-2 ${i % 2 === 0 ? "bg-gray-50" : ""}`}>
                    <span className={`font-bold ${stepStatusColor(s.status)}`}>{s.status.toUpperCase()}</span>
                    <span className="font-mono text-gray-600 flex-1">{s.sql_statement}</span>
                    {s.result_message && <span className="text-gray-400">{s.result_message}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Job history */}
          {jobs.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-2">Execution History</h3>
              {jobs.map(job => (
                <div key={job.id} className="border rounded-lg mb-2 overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 text-xs flex items-center gap-3">
                    <span className="font-bold">Job #{job.id}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(job.status)}`}>{job.status}</span>
                    <span className="text-gray-400">{job.mode}</span>
                    <span className="text-gray-400">{new Date(job.created_at).toLocaleString()}</span>
                    {job.error && <span className="text-red-600">{job.error}</span>}
                  </div>
                  {job.steps.map((s, i) => (
                    <div key={i} className={`px-3 py-2 text-xs border-t flex items-center gap-2`}>
                      <span className={`font-bold w-20 ${stepStatusColor(s.status)}`}>{s.status}</span>
                      <span className="font-mono text-gray-600 flex-1 truncate">{s.sql_statement}</span>
                      {s.result_message && s.result_message !== "OK" && <span className="text-gray-500 max-w-xs truncate">{s.result_message}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            {user?.role === "admin" && selectedProposal.status === "submitted" && (
              <>
                <button onClick={() => handleApprove(selectedProposal.id)} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">Approve</button>
                <button onClick={() => handleReject(selectedProposal.id)} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700">Reject</button>
              </>
            )}
            {user?.role === "admin" && (selectedProposal.status === "submitted" || selectedProposal.status === "approved") && (
              <button onClick={() => handleDryRun(selectedProposal.id)} disabled={dryRunning}
                className="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-600 disabled:opacity-50">
                {dryRunning ? "Running..." : "Dry Run"}
              </button>
            )}
            {user?.role === "admin" && selectedProposal.status === "approved" && (
              <button onClick={() => handleExecute(selectedProposal.id)} disabled={executing}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                {executing ? "Executing..." : "Execute"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Table ────────────────────────────────── */}
      <div className="bg-white shadow rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">ID</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Title</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Cluster</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Ops</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">SQL Preview</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Created</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map(p => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"
                onClick={() => selectProposal(p)}>
                <td className="px-4 py-3 font-medium">#{p.id}</td>
                <td className="px-4 py-3">{proposalTitle(p)}</td>
                <td className="px-4 py-3">{clusterName(p.cluster_id)}</td>
                <td className="px-4 py-3">{p.operations.length || 1}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600 truncate max-w-[200px]">{p.sql_preview}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(p.status)}`}>{p.status}</span>
                </td>
                <td className="px-4 py-3 text-gray-500">{new Date(p.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {proposals.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No proposals yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
