import axios from "axios";

const api = axios.create({ baseURL: "/api/gov" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Clusters ────────────────────────────────────────────

export const getClusters = () => api.get("/clusters");

export const createCluster = (data: {
  name: string;
  host: string;
  port: number;
  protocol: string;
  username: string;
  password: string;
  database?: string;
}) => api.post("/clusters", data);

export const updateCluster = (
  id: number,
  data: {
    name?: string;
    host?: string;
    port?: number;
    protocol?: string;
    username?: string;
    password?: string;
    database?: string;
  },
) => api.patch(`/clusters/${id}`, data);

export const deleteCluster = (id: number) => api.delete(`/clusters/${id}`);

export const validateConnection = (data: {
  host: string;
  port: number;
  protocol: string;
  username: string;
  password: string;
  database?: string;
}) => api.post("/clusters/validate", data);

export const testClusterConnection = (id: number) =>
  api.post(`/clusters/${id}/test`);

export const getClusterDiagnostics = (id: number) =>
  api.get(`/clusters/${id}/diagnostics`);

/** @deprecated Use testClusterConnection instead */
export const testConnection = (id: number) =>
  api.post(`/clusters/${id}/test-connection`);

// ── Explorer ────────────────────────────────────────────

export const getDatabases = (clusterId: number) =>
  api.get(`/clusters/${clusterId}/databases`);

export const getTables = (clusterId: number, db: string) =>
  api.get(`/clusters/${clusterId}/tables`, { params: { db } });

export const getColumns = (clusterId: number, db: string, table: string) =>
  api.get(`/clusters/${clusterId}/columns`, { params: { db, table } });

export const getTableDetail = (
  clusterId: number,
  db: string,
  table: string,
  includeSample = false,
) =>
  api.get(`/clusters/${clusterId}/table-detail`, {
    params: { db, table, sample: includeSample },
  });

// ── Proposals (Phase 3 — multi-operation) ───────────────

export const getProposals = () => api.get("/proposals");

export const getProposal = (id: number) => api.get(`/proposals/${id}`);

export const createProposal = (data: {
  cluster_id: number;
  title: string;
  operations: { operation_type: string; params: Record<string, unknown> }[];
  reason?: string;
  is_elevated?: boolean;
  description?: string;
}) => api.post("/proposals", data);

export const createLegacyProposal = (data: {
  cluster_id: number;
  proposal_type: string;
  db: string;
  table: string;
  target_type: string;
  target_name: string;
  reason?: string;
}) => api.post("/proposals/legacy", data);

export const approveProposal = (id: number, comment?: string) =>
  api.post(`/proposals/${id}/approve`, { comment: comment || null });

export const rejectProposal = (id: number, comment?: string) =>
  api.post(`/proposals/${id}/reject`, { comment: comment || null });

export const dryRunProposal = (id: number) =>
  api.post(`/proposals/${id}/dry-run`);

export const executeProposal = (id: number) =>
  api.post(`/proposals/${id}/execute`);

export const getProposalJobs = (id: number) =>
  api.get(`/proposals/${id}/jobs`);

// ── Audit ───────────────────────────────────────────────

export const getGovAudit = (params?: Record<string, string>) =>
  api.get("/audit", { params });

// ── Snapshots ───────────────────────────────────────────

export const getSnapshots = (clusterId: number, limit = 20) =>
  api.get("/snapshots", { params: { cluster_id: clusterId, limit } });

export const getSnapshot = (id: number) => api.get(`/snapshots/${id}`);

export const collectSnapshot = (clusterId: number) =>
  api.post("/snapshots/collect", { cluster_id: clusterId });

export const diffSnapshots = (fromId: number, toId: number) =>
  api.get("/snapshots/diff", { params: { from: fromId, to: toId } });

// ── RBAC Explorer ───────────────────────────────────────

export const getRBACUsers = (clusterId: number, snapshotId?: number) =>
  api.get("/explorer/users", {
    params: { cluster_id: clusterId, ...(snapshotId ? { snapshot_id: snapshotId } : {}) },
  });

export const getRBACUserDetail = (name: string, clusterId: number, snapshotId?: number) =>
  api.get(`/explorer/users/${encodeURIComponent(name)}`, {
    params: { cluster_id: clusterId, ...(snapshotId ? { snapshot_id: snapshotId } : {}) },
  });

export const getRBACRoles = (clusterId: number, snapshotId?: number) =>
  api.get("/explorer/roles", {
    params: { cluster_id: clusterId, ...(snapshotId ? { snapshot_id: snapshotId } : {}) },
  });

export const getRBACRoleDetail = (name: string, clusterId: number, snapshotId?: number) =>
  api.get(`/explorer/roles/${encodeURIComponent(name)}`, {
    params: { cluster_id: clusterId, ...(snapshotId ? { snapshot_id: snapshotId } : {}) },
  });

export const getObjectAccess = (
  clusterId: number,
  database: string,
  table?: string,
  snapshotId?: number,
) => {
  const path = table
    ? `/explorer/objects/${encodeURIComponent(database)}/${encodeURIComponent(table)}`
    : `/explorer/objects/${encodeURIComponent(database)}`;
  return api.get(path, {
    params: { cluster_id: clusterId, ...(snapshotId ? { snapshot_id: snapshotId } : {}) },
  });
};

export const getRBACRiskSummary = (clusterId: number, snapshotId?: number) =>
  api.get("/explorer/risk-summary", {
    params: { cluster_id: clusterId, ...(snapshotId ? { snapshot_id: snapshotId } : {}) },
  });

export const getRBACUserRisks = (name: string, clusterId: number, snapshotId?: number) =>
  api.get(`/explorer/users/${encodeURIComponent(name)}/risks`, {
    params: { cluster_id: clusterId, ...(snapshotId ? { snapshot_id: snapshotId } : {}) },
  });

export const getRBACRoleEffectivePrivileges = (name: string, clusterId: number, snapshotId?: number) =>
  api.get(`/explorer/roles/${encodeURIComponent(name)}/effective-privileges`, {
    params: { cluster_id: clusterId, ...(snapshotId ? { snapshot_id: snapshotId } : {}) },
  });

// ── Admin (Phase 3) ─────────────────────────────────────

export const getAdminUsers = (clusterId: number) =>
  api.get("/admin/users", { params: { cluster_id: clusterId } });

export const getAdminUserHistory = (username: string, clusterId: number) =>
  api.get(`/admin/users/${encodeURIComponent(username)}/history`, {
    params: { cluster_id: clusterId },
  });

export const getAdminRoles = (clusterId: number) =>
  api.get("/admin/roles", { params: { cluster_id: clusterId } });

export const getAdminRoleHistory = (roleName: string, clusterId: number) =>
  api.get(`/admin/roles/${encodeURIComponent(roleName)}/history`, {
    params: { cluster_id: clusterId },
  });

export const getSettingsProfiles = (clusterId: number) =>
  api.get("/admin/settings-profiles", { params: { cluster_id: clusterId } });

export const getProfileHistory = (name: string, clusterId: number) =>
  api.get(`/admin/settings-profiles/${encodeURIComponent(name)}/history`, {
    params: { cluster_id: clusterId },
  });

export const getQuotas = (clusterId: number) =>
  api.get("/admin/quotas", { params: { cluster_id: clusterId } });

export const getQuotaHistory = (name: string, clusterId: number) =>
  api.get(`/admin/quotas/${encodeURIComponent(name)}/history`, {
    params: { cluster_id: clusterId },
  });

export const getRowPolicies = (clusterId: number) =>
  api.get("/admin/row-policies", { params: { cluster_id: clusterId } });

export const getSQLPreview = (operationType: string, params: Record<string, unknown>) =>
  api.post("/admin/sql-preview", { operation_type: operationType, params });

export default api;
