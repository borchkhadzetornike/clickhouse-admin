import { useState, useEffect, useCallback, useRef } from "react";
import {
  getClusters,
  getDatabases,
  getTables,
  getTableDetail,
} from "../api/governance";

/* ================================================================
   Types
   ================================================================ */

interface Cluster {
  id: number;
  name: string;
  status: string;
}
interface Database {
  name: string;
  table_count: number;
  is_system: boolean;
}
interface TableEntry {
  name: string;
  engine: string | null;
  total_rows: number | null;
  total_bytes: number | null;
  last_modified: string | null;
}
interface ColumnRich {
  name: string;
  type: string;
  default_kind: string;
  default_expression: string;
  comment: string;
  is_in_primary_key: boolean;
  is_in_sorting_key: boolean;
  codec: string;
}
interface TableMeta {
  engine: string;
  engine_full: string;
  partition_key: string;
  sorting_key: string;
  primary_key: string;
  sampling_key: string;
  total_rows: number | null;
  total_bytes: number | null;
  lifetime_rows: number | null;
  lifetime_bytes: number | null;
  last_modified: string | null;
  comment: string;
}
interface SampleData {
  columns: { name: string; type: string }[];
  rows: Record<string, unknown>[];
  rows_read: number;
  elapsed_ms: number;
  error?: string;
}
interface TableDetailData {
  database: string;
  table: string;
  columns: ColumnRich[];
  metadata: TableMeta;
  ddl: string;
  sample: SampleData | null;
}

type InspectorTab = "columns" | "ddl" | "metadata" | "sample";

/* ================================================================
   Utility helpers
   ================================================================ */

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let b = bytes;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatRows(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

/* ================================================================
   Small reusable components
   ================================================================ */

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`} />;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
      title={label}
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          Copied
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          {label}
        </>
      )}
    </button>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

function EngineBadge({ engine }: { engine: string | null }) {
  if (!engine) return null;
  const color = engine.includes("MergeTree")
    ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
    : engine === "View" || engine === "MaterializedView"
    ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300"
    : engine === "Memory"
    ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`} title={engine}>
      {engine.replace("MergeTree", "MT")}
    </span>
  );
}

/* ================================================================
   Breadcrumb
   ================================================================ */

function Breadcrumb({
  cluster,
  database,
  table,
  onClickCluster,
  onClickDatabase,
}: {
  cluster: string | null;
  database: string | null;
  table: string | null;
  onClickCluster: () => void;
  onClickDatabase: () => void;
}) {
  return (
    <nav className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-4 min-h-[24px]">
      <span className="text-gray-400 dark:text-gray-500">Explorer</span>
      {cluster && (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <button onClick={onClickCluster} className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            {cluster}
          </button>
        </>
      )}
      {database && (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <button onClick={onClickDatabase} className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            {database}
          </button>
        </>
      )}
      {table && (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <span className="text-gray-900 dark:text-gray-100 font-medium">{table}</span>
        </>
      )}
    </nav>
  );
}

/* ================================================================
   Inspector Tabs
   ================================================================ */

function ColumnsTab({ columns }: { columns: ColumnRich[] }) {
  if (columns.length === 0) return <p className="text-sm text-gray-400 py-4">No columns found.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b dark:border-gray-700">
            <th className="text-left py-2 px-2 font-semibold text-gray-500 dark:text-gray-400">Name</th>
            <th className="text-left py-2 px-2 font-semibold text-gray-500 dark:text-gray-400">Type</th>
            <th className="text-left py-2 px-2 font-semibold text-gray-500 dark:text-gray-400">Key</th>
            <th className="text-left py-2 px-2 font-semibold text-gray-500 dark:text-gray-400">Default</th>
            <th className="text-left py-2 px-2 font-semibold text-gray-500 dark:text-gray-400">Codec</th>
            <th className="py-2 px-2 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {columns.map((c) => (
            <tr key={c.name} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td className="py-1.5 px-2 font-medium text-gray-900 dark:text-gray-100 font-mono">
                {c.name}
                {c.comment && (
                  <span className="ml-1 text-gray-400 dark:text-gray-500 font-sans" title={c.comment}>
                    <svg className="inline w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </span>
                )}
              </td>
              <td className="py-1.5 px-2 text-gray-600 dark:text-gray-400 font-mono">
                {c.type.startsWith("Nullable") ? (
                  <span>{c.type} <span className="text-amber-500 text-[9px]">NULL</span></span>
                ) : c.type}
              </td>
              <td className="py-1.5 px-2">
                {c.is_in_primary_key && (
                  <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-medium mr-1" title="Primary Key">
                    PK
                  </span>
                )}
                {c.is_in_sorting_key && !c.is_in_primary_key && (
                  <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-medium" title="Sorting Key">
                    SK
                  </span>
                )}
              </td>
              <td className="py-1.5 px-2 text-gray-500 dark:text-gray-500 font-mono text-[10px] max-w-[120px] truncate" title={c.default_expression}>
                {c.default_kind ? `${c.default_kind}: ${c.default_expression}` : "—"}
              </td>
              <td className="py-1.5 px-2 text-gray-500 dark:text-gray-500 font-mono text-[10px]">
                {c.codec || "—"}
              </td>
              <td className="py-1.5 px-2">
                <button
                  onClick={() => copyToClipboard(c.name)}
                  className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="Copy column name"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DDLTab({ ddl }: { ddl: string }) {
  if (!ddl) return <p className="text-sm text-gray-400 py-4">DDL not available.</p>;
  return (
    <div>
      <div className="flex justify-end mb-2">
        <CopyButton text={ddl} label="Copy DDL" />
      </div>
      <pre className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 text-xs font-mono text-gray-800 dark:text-gray-200 overflow-x-auto max-h-[60vh] whitespace-pre-wrap leading-relaxed">
        {ddl}
      </pre>
    </div>
  );
}

function MetadataTab({ meta }: { meta: TableMeta }) {
  const items: [string, string][] = [
    ["Engine", meta.engine],
    ["Engine (full)", meta.engine_full],
    ["Partition Key", meta.partition_key || "—"],
    ["Sorting Key", meta.sorting_key || "—"],
    ["Primary Key", meta.primary_key || "—"],
    ["Sampling Key", meta.sampling_key || "—"],
    ["Rows (approx)", meta.total_rows != null ? formatRows(meta.total_rows) : "—"],
    ["Size", formatBytes(meta.total_bytes)],
    ["Lifetime Rows", meta.lifetime_rows != null ? formatRows(meta.lifetime_rows) : "—"],
    ["Lifetime Size", formatBytes(meta.lifetime_bytes)],
    ["Last Modified", meta.last_modified || "—"],
    ["Comment", meta.comment || "—"],
  ];
  return (
    <div>
      <div className="flex justify-end mb-2">
        <CopyButton text={JSON.stringify(meta, null, 2)} label="Copy JSON" />
      </div>
      <dl className="space-y-2">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-start gap-3 text-sm">
            <dt className="w-36 flex-shrink-0 text-gray-500 dark:text-gray-400 font-medium">{label}</dt>
            <dd className="text-gray-900 dark:text-gray-100 font-mono text-xs break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SampleTab({
  detail,
  clusterId,
  onLoadSample,
  loadingSample,
}: {
  detail: TableDetailData;
  clusterId: number;
  onLoadSample: () => void;
  loadingSample: boolean;
}) {
  const sample = detail.sample;

  if (!sample) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Sample data is not loaded yet. Click below to preview up to 20 rows.
        </p>
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 mb-4 max-w-md mx-auto">
          Read-only preview. No data will be modified.
        </div>
        <button
          onClick={onLoadSample}
          disabled={loadingSample}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
        >
          {loadingSample ? <><Spinner /> Loading...</> : "Load Sample Data"}
        </button>
      </div>
    );
  }

  if (sample.error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        <p className="text-sm text-red-700 dark:text-red-300">{sample.error}</p>
      </div>
    );
  }

  if (sample.rows.length === 0) {
    return <p className="text-sm text-gray-400 py-4">Table is empty.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Showing {sample.rows.length} row{sample.rows.length !== 1 ? "s" : ""} &middot; {sample.elapsed_ms}ms
        </p>
        <CopyButton text={JSON.stringify(sample.rows, null, 2)} label="Copy JSON" />
      </div>
      <div className="overflow-x-auto rounded-lg border dark:border-gray-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
              {sample.columns.map((c) => (
                <th key={c.name} className="text-left py-2 px-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sample.rows.map((row, i) => (
              <tr key={i} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                {sample.columns.map((c) => (
                  <td key={c.name} className="py-1.5 px-3 text-gray-700 dark:text-gray-300 font-mono whitespace-nowrap max-w-[200px] truncate" title={row[c.name] != null ? String(row[c.name]) : ""}>
                    {row[c.name] != null ? String(row[c.name]) : <span className="text-gray-400 italic">null</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================================================================
   Main Explorer Component
   ================================================================ */

export default function Explorer() {
  // ── State ──
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [databases, setDatabases] = useState<Database[]>([]);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [tables, setTables] = useState<TableEntry[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [detail, setDetail] = useState<TableDetailData | null>(null);
  const [activeTab, setActiveTab] = useState<InspectorTab>("columns");

  // Loading states
  const [loadingDbs, setLoadingDbs] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);

  // Search
  const [dbSearch, setDbSearch] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [showSystemDbs, setShowSystemDbs] = useState(false);

  // Errors
  const [error, setError] = useState("");

  // Refs for keyboard navigation
  const dbListRef = useRef<HTMLDivElement>(null);
  const tableListRef = useRef<HTMLDivElement>(null);

  // ── Derived ──
  const selectedCluster = clusters.find((c) => c.id === selectedClusterId);

  const filteredDbs = databases.filter((d) => {
    if (!showSystemDbs && d.is_system) return false;
    if (dbSearch && !d.name.toLowerCase().includes(dbSearch.toLowerCase())) return false;
    return true;
  });

  const filteredTables = tables.filter((t) => {
    if (tableSearch && !t.name.toLowerCase().includes(tableSearch.toLowerCase())) return false;
    return true;
  });

  // ── Loaders ──
  useEffect(() => {
    getClusters()
      .then((r) => setClusters(r.data))
      .catch(() => setError("Failed to load clusters"));
  }, []);

  const handleSelectCluster = useCallback(async (id: number) => {
    setSelectedClusterId(id);
    setSelectedDb(null);
    setSelectedTable(null);
    setTables([]);
    setDetail(null);
    setError("");
    setDbSearch("");
    setTableSearch("");
    setLoadingDbs(true);
    try {
      const res = await getDatabases(id);
      setDatabases(res.data);
    } catch (e: unknown) {
      const axErr = e as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to load databases");
    } finally {
      setLoadingDbs(false);
    }
  }, []);

  const handleSelectDb = useCallback(async (dbName: string) => {
    if (!selectedClusterId) return;
    setSelectedDb(dbName);
    setSelectedTable(null);
    setDetail(null);
    setError("");
    setTableSearch("");
    setLoadingTables(true);
    try {
      const res = await getTables(selectedClusterId, dbName);
      setTables(res.data);
    } catch (e: unknown) {
      const axErr = e as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to load tables");
    } finally {
      setLoadingTables(false);
    }
  }, [selectedClusterId]);

  const handleSelectTable = useCallback(async (tableName: string) => {
    if (!selectedClusterId || !selectedDb) return;
    setSelectedTable(tableName);
    setActiveTab("columns");
    setError("");
    setLoadingDetail(true);
    try {
      const res = await getTableDetail(selectedClusterId, selectedDb, tableName, false);
      setDetail(res.data);
    } catch (e: unknown) {
      const axErr = e as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to load table details");
    } finally {
      setLoadingDetail(false);
    }
  }, [selectedClusterId, selectedDb]);

  const handleLoadSample = useCallback(async () => {
    if (!selectedClusterId || !selectedDb || !selectedTable) return;
    setLoadingSample(true);
    try {
      const res = await getTableDetail(selectedClusterId, selectedDb, selectedTable, true);
      setDetail(res.data);
    } catch {
      // keep existing detail
    } finally {
      setLoadingSample(false);
    }
  }, [selectedClusterId, selectedDb, selectedTable]);

  // ── Render ──
  const tabs: { id: InspectorTab; label: string }[] = [
    { id: "columns", label: "Columns" },
    { id: "ddl", label: "DDL" },
    { id: "metadata", label: "Metadata" },
    { id: "sample", label: "Sample Data" },
  ];

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header + breadcrumb */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Explorer</h1>
        </div>
        <Breadcrumb
          cluster={selectedCluster?.name || null}
          database={selectedDb}
          table={selectedTable}
          onClickCluster={() => {
            setSelectedDb(null);
            setSelectedTable(null);
            setTables([]);
            setDetail(null);
          }}
          onClickDatabase={() => {
            setSelectedTable(null);
            setDetail(null);
          }}
        />
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-2.5 rounded-lg mb-3 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="text-red-400 hover:text-red-600 ml-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* Main 3-pane layout */}
      <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">

        {/* ── LEFT: Cluster + Database sidebar ── */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-3 min-h-0">
          {/* Cluster selector */}
          <div className="bg-white dark:bg-gray-900 shadow dark:shadow-gray-900/50 rounded-xl p-3 flex-shrink-0">
            <h2 className="font-semibold text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Cluster</h2>
            <select
              value={selectedClusterId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v) handleSelectCluster(Number(v));
              }}
              className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select cluster...</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Database list */}
          <div className="bg-white dark:bg-gray-900 shadow dark:shadow-gray-900/50 rounded-xl p-3 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Databases</h2>
              {databases.some((d) => d.is_system) && (
                <label className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showSystemDbs}
                    onChange={() => setShowSystemDbs(!showSystemDbs)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-500 w-3 h-3"
                  />
                  System
                </label>
              )}
            </div>
            <SearchInput value={dbSearch} onChange={setDbSearch} placeholder="Search databases..." />
            <div ref={dbListRef} className="flex-1 overflow-y-auto mt-2 -mx-1">
              {loadingDbs ? (
                <div className="space-y-1.5 px-1">
                  {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
                </div>
              ) : !selectedClusterId ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 px-2 py-4 text-center">Select a cluster to browse databases</p>
              ) : filteredDbs.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 px-2 py-4 text-center">No databases found</p>
              ) : (
                <ul className="space-y-0.5">
                  {filteredDbs.map((d) => (
                    <li key={d.name}>
                      <button
                        onClick={() => handleSelectDb(d.name)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between group ${
                          selectedDb === d.name
                            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium"
                            : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
                          <span className="truncate">{d.name}</span>
                          {d.is_system && <span className="text-[9px] text-gray-400 dark:text-gray-600">sys</span>}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-600 ml-1 flex-shrink-0">
                          {d.table_count}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* ── MIDDLE: Tables list ── */}
        <div className="w-72 flex-shrink-0 bg-white dark:bg-gray-900 shadow dark:shadow-gray-900/50 rounded-xl p-3 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Tables</h2>
            {tables.length > 0 && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">{filteredTables.length}</span>
            )}
          </div>
          <SearchInput value={tableSearch} onChange={setTableSearch} placeholder="Search tables..." />
          <div ref={tableListRef} className="flex-1 overflow-y-auto mt-2 -mx-1">
            {loadingTables ? (
              <div className="space-y-1.5 px-1">
                {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : !selectedDb ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 px-2 py-8 text-center">Select a database to browse tables</p>
            ) : filteredTables.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 px-2 py-8 text-center">
                {tableSearch ? "No tables match your search" : "No tables found"}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filteredTables.map((t) => (
                  <li key={t.name}>
                    <button
                      onClick={() => handleSelectTable(t.name)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors group ${
                        selectedTable === t.name
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                          : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`truncate ${selectedTable === t.name ? "font-medium" : ""}`}>
                          {t.name}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); copyToClipboard(t.name); }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity"
                          title="Copy table name"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <EngineBadge engine={t.engine} />
                        {t.total_rows != null && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatRows(t.total_rows)} rows</span>
                        )}
                        {t.total_bytes != null && t.total_bytes > 0 && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatBytes(t.total_bytes)}</span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── RIGHT: Table Inspector ── */}
        <div className="flex-1 bg-white dark:bg-gray-900 shadow dark:shadow-gray-900/50 rounded-xl flex flex-col min-h-0 min-w-0">
          {!selectedTable ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-16 h-16 text-gray-200 dark:text-gray-700 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm text-gray-400 dark:text-gray-500">Select a table to inspect</p>
                <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">View columns, DDL, metadata, and sample data</p>
              </div>
            </div>
          ) : loadingDetail ? (
            <div className="flex-1 flex flex-col">
              <div className="p-4 border-b dark:border-gray-700">
                <Skeleton className="h-5 w-48 mb-2" />
                <div className="flex gap-4">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-20" />)}
                </div>
              </div>
              <div className="p-4 space-y-3">
                {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            </div>
          ) : detail ? (
            <div className="flex flex-col min-h-0 flex-1">
              {/* Inspector header */}
              <div className="flex-shrink-0 px-4 pt-4 pb-0">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {detail.table}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {detail.database} &middot; {detail.metadata.engine || "Unknown engine"}
                      {detail.columns.length > 0 && ` \u00B7 ${detail.columns.length} columns`}
                      {detail.metadata.total_rows != null && ` \u00B7 ${formatRows(detail.metadata.total_rows)} rows`}
                    </p>
                  </div>
                  <CopyButton text={`${detail.database}.${detail.table}`} label="Copy path" />
                </div>

                {/* Tabs */}
                <div className="flex gap-0 border-b dark:border-gray-700 -mx-4 px-4">
                  {tabs.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id)}
                      className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                        activeTab === t.id
                          ? "border-blue-500 text-blue-600 dark:text-blue-400"
                          : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                      }`}
                    >
                      {t.label}
                      {t.id === "columns" && detail.columns.length > 0 && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                          {detail.columns.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-4">
                {activeTab === "columns" && <ColumnsTab columns={detail.columns} />}
                {activeTab === "ddl" && <DDLTab ddl={detail.ddl} />}
                {activeTab === "metadata" && <MetadataTab meta={detail.metadata} />}
                {activeTab === "sample" && (
                  <SampleTab
                    detail={detail}
                    clusterId={selectedClusterId!}
                    onLoadSample={handleLoadSample}
                    loadingSample={loadingSample}
                  />
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
