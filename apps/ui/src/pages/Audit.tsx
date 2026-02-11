import { useState, useEffect, useCallback } from "react";
import { getAuthAudit, getAuditEventDetail } from "../api/auth";

// ── Types ────────────────────────────────────────────────

interface AuditActor {
  id: number | null;
  username: string;
  role: string | null;
  display_name: string;
}

interface AuditTarget {
  entity_type?: string;
  entity_id?: number | string;
  entity_name?: string;
}

interface AuditListItem {
  id: number;
  created_at: string;
  source: string;
  action: string;
  severity: string;
  actor: AuditActor;
  target: AuditTarget | null;
  summary: string;
  metadata_preview: Record<string, unknown> | null;
  has_details: boolean;
}

interface AuditDetail {
  id: number;
  created_at: string;
  source: string;
  action: string;
  severity: string;
  actor: AuditActor;
  actor_snapshot: Record<string, unknown> | null;
  target: AuditTarget | null;
  request_context: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

// ── Helpers ──────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function localTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function utcTime(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").replace("Z", " UTC");
}

function friendlyAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Badge components ─────────────────────────────────────

const sourceBadgeClass: Record<string, string> = {
  auth: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  governance:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  executor:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

const severityBadgeClass: Record<string, string> = {
  info: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  warn: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const roleBadgeClass: Record<string, string> = {
  admin:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  editor:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  researcher:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

function Badge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
}

// ── JSON Viewer ──────────────────────────────────────────

function JsonViewer({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded transition-colors"
      >
        {copied ? "Copied!" : "Copy JSON"}
      </button>
      <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto">
        {text}
      </pre>
    </div>
  );
}

// ── Details Drawer ───────────────────────────────────────

function DetailsDrawer({
  detail,
  onClose,
}: {
  detail: AuditDetail | null;
  onClose: () => void;
}) {
  if (!detail) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 dark:bg-black/50 z-40"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col border-l dark:border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-800">
          <div className="flex items-center gap-2 min-w-0">
            <Badge
              label={detail.source}
              className={
                sourceBadgeClass[detail.source] || sourceBadgeClass.auth
              }
            />
            <Badge
              label={detail.severity}
              className={
                severityBadgeClass[detail.severity] || severityBadgeClass.info
              }
            />
            <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {friendlyAction(detail.action)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Event ID */}
          <div className="text-xs text-gray-400 dark:text-gray-500">
            Event #{detail.id}
          </div>

          {/* Time */}
          <Section title="Timestamp">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              {localTime(detail.created_at)}
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {utcTime(detail.created_at)}
            </div>
          </Section>

          {/* Actor */}
          <Section title="Actor">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                {detail.actor.display_name}
              </span>
              {detail.actor.role && (
                <Badge
                  label={detail.actor.role}
                  className={
                    roleBadgeClass[detail.actor.role] || roleBadgeClass.researcher
                  }
                />
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              @{detail.actor.username}
              {detail.actor.id !== null && (
                <span className="ml-2">ID: {detail.actor.id}</span>
              )}
            </div>
            {detail.actor_snapshot && (
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                {detail.actor_snapshot.email != null ? (
                  <div>Email: {String(detail.actor_snapshot.email)}</div>
                ) : null}
                {(detail.actor_snapshot.first_name != null ||
                  detail.actor_snapshot.last_name != null) ? (
                  <div>
                    Name: {String(detail.actor_snapshot.first_name ?? "")}{" "}
                    {String(detail.actor_snapshot.last_name ?? "")}
                  </div>
                ) : null}
              </div>
            )}
          </Section>

          {/* Target */}
          {detail.target && (
            <Section title="Target">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {detail.target.entity_type && (
                  <Badge
                    label={detail.target.entity_type}
                    className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 mr-2"
                  />
                )}
                <span className="font-medium">
                  {detail.target.entity_name || detail.target.entity_id || "-"}
                </span>
              </div>
            </Section>
          )}

          {/* Request Context */}
          {detail.request_context && (
            <Section title="Request Context">
              <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                {detail.request_context.ip != null ? (
                  <div>
                    <span className="text-gray-400 dark:text-gray-500">
                      IP:
                    </span>{" "}
                    {String(detail.request_context.ip)}
                  </div>
                ) : null}
                {detail.request_context.user_agent != null ? (
                  <div className="break-all">
                    <span className="text-gray-400 dark:text-gray-500">
                      User Agent:
                    </span>{" "}
                    {String(detail.request_context.user_agent)}
                  </div>
                ) : null}
              </div>
            </Section>
          )}

          {/* Full Details / Metadata */}
          {detail.metadata && Object.keys(detail.metadata).length > 0 && (
            <Section title="Details">
              <JsonViewer data={detail.metadata} />
            </Section>
          )}
        </div>
      </div>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────

export default function Audit() {
  const [events, setEvents] = useState<AuditListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [source, setSource] = useState("");
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Drawer state
  const [drawerDetail, setDrawerDetail] = useState<AuditDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const loadEvents = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page,
        page_size: pageSize,
      };
      if (source) params.source = source;
      if (severity) params.severity = severity;
      if (search) params.q = search;
      if (fromDate) params.from = new Date(fromDate).toISOString();
      if (toDate) params.to = new Date(toDate + "T23:59:59").toISOString();

      const res = await getAuthAudit(params);
      setEvents(res.data.items);
      setTotal(res.data.total);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to load audit events");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, source, severity, search, fromDate, toDate]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const openDetail = async (id: number) => {
    setDrawerLoading(true);
    try {
      const res = await getAuditEventDetail(id);
      setDrawerDetail(res.data);
    } catch {
      setError("Failed to load event details");
    } finally {
      setDrawerLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold dark:text-white">Audit Log</h1>
        <div className="text-sm text-gray-400 dark:text-gray-500">
          {total} event{total !== 1 ? "s" : ""}
        </div>
      </div>

      {/* ── Filter Bar ─────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 shadow dark:shadow-gray-900/50 rounded-xl p-4 mb-4 border border-transparent dark:border-gray-800">
        <div className="flex flex-wrap items-end gap-3">
          {/* Source */}
          <div className="min-w-[120px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Source
            </label>
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setPage(1);
              }}
              className="w-full border rounded-lg px-2.5 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            >
              <option value="">All</option>
              <option value="auth">Auth</option>
              <option value="governance">Governance</option>
              <option value="executor">Executor</option>
            </select>
          </div>

          {/* Severity */}
          <div className="min-w-[110px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Severity
            </label>
            <select
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value);
                setPage(1);
              }}
              className="w-full border rounded-lg px-2.5 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            >
              <option value="">All</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
          </div>

          {/* From */}
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="w-full border rounded-lg px-2.5 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            />
          </div>

          {/* To */}
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="w-full border rounded-lg px-2.5 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            />
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Search
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search actions, actors, details..."
                className="flex-1 border rounded-lg px-2.5 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
              <button
                type="submit"
                className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Go
              </button>
            </div>
          </form>

          {/* Page size + Refresh */}
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Per page
              </label>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="border rounded-lg px-2 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <button
              onClick={() => loadEvents()}
              disabled={loading}
              className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 p-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
              title="Refresh"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
          <button onClick={() => setError("")} className="ml-2 underline text-xs">
            dismiss
          </button>
        </div>
      )}

      {/* ── Table ─────────────────────────────── */}
      <div className="bg-white shadow dark:bg-gray-900 dark:shadow-gray-900/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b dark:bg-gray-800 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  Time
                </th>
                <th className="text-left px-3 py-3 font-semibold text-gray-600 dark:text-gray-400">
                  Source
                </th>
                <th className="text-left px-3 py-3 font-semibold text-gray-600 dark:text-gray-400">
                  Severity
                </th>
                <th className="text-left px-3 py-3 font-semibold text-gray-600 dark:text-gray-400">
                  Action
                </th>
                <th className="text-left px-3 py-3 font-semibold text-gray-600 dark:text-gray-400">
                  Actor
                </th>
                <th className="text-left px-3 py-3 font-semibold text-gray-600 dark:text-gray-400">
                  Target
                </th>
                <th className="text-left px-3 py-3 font-semibold text-gray-600 dark:text-gray-400">
                  Summary
                </th>
                <th className="text-center px-3 py-3 font-semibold text-gray-600 dark:text-gray-400 w-12">
                  {/* eye */}
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr
                  key={e.id}
                  className="border-b last:border-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 transition-colors"
                >
                  {/* Time */}
                  <td
                    className="px-4 py-3 whitespace-nowrap"
                    title={utcTime(e.created_at)}
                  >
                    <div className="text-gray-700 dark:text-gray-300 text-xs">
                      {localTime(e.created_at)}
                    </div>
                    <div className="text-gray-400 dark:text-gray-500 text-[11px]">
                      {relativeTime(e.created_at)}
                    </div>
                  </td>

                  {/* Source */}
                  <td className="px-3 py-3">
                    <Badge
                      label={e.source}
                      className={
                        sourceBadgeClass[e.source] || sourceBadgeClass.auth
                      }
                    />
                  </td>

                  {/* Severity */}
                  <td className="px-3 py-3">
                    <Badge
                      label={e.severity}
                      className={
                        severityBadgeClass[e.severity] ||
                        severityBadgeClass.info
                      }
                    />
                  </td>

                  {/* Action */}
                  <td className="px-3 py-3 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {friendlyAction(e.action)}
                  </td>

                  {/* Actor */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-800 dark:text-gray-200 font-medium text-xs">
                        {e.actor.username}
                      </span>
                      {e.actor.role && (
                        <Badge
                          label={e.actor.role}
                          className={
                            roleBadgeClass[e.actor.role] ||
                            roleBadgeClass.researcher
                          }
                        />
                      )}
                    </div>
                    {e.actor.display_name !== e.actor.username && (
                      <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                        {e.actor.display_name}
                      </div>
                    )}
                  </td>

                  {/* Target */}
                  <td className="px-3 py-3 text-xs text-gray-600 dark:text-gray-400">
                    {e.target ? (
                      <span>
                        {e.target.entity_type && (
                          <span className="text-gray-400 dark:text-gray-500">
                            {e.target.entity_type}:{" "}
                          </span>
                        )}
                        {e.target.entity_name || e.target.entity_id || "-"}
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">
                        -
                      </span>
                    )}
                  </td>

                  {/* Summary */}
                  <td className="px-3 py-3 text-gray-600 dark:text-gray-400 text-xs max-w-[240px] truncate">
                    {e.summary}
                  </td>

                  {/* Eye Button */}
                  <td className="px-3 py-3 text-center">
                    {e.has_details ? (
                      <button
                        onClick={() => openDetail(e.id)}
                        disabled={drawerLoading}
                        className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                        title="View details"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                    ) : (
                      <span className="text-gray-200 dark:text-gray-700">
                        -
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {events.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-16 text-center text-gray-400 dark:text-gray-500"
                  >
                    {loading ? (
                      <span>Loading audit events...</span>
                    ) : (
                      <span>No audit events found.</span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="px-2.5 py-1.5 border rounded-lg text-sm disabled:opacity-30 dark:border-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              First
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1.5 border rounded-lg text-sm disabled:opacity-30 dark:border-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1.5 border rounded-lg text-sm disabled:opacity-30 dark:border-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Next
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="px-2.5 py-1.5 border rounded-lg text-sm disabled:opacity-30 dark:border-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Last
            </button>
          </div>
        </div>
      )}

      {/* ── Details Drawer ────────────────────── */}
      <DetailsDrawer
        detail={drawerDetail}
        onClose={() => setDrawerDetail(null)}
      />
    </div>
  );
}
