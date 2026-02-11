import { useState, useEffect } from "react";
import {
  getClusters,
  getDatabases,
  getTables,
  getColumns,
} from "../api/governance";

interface Cluster {
  id: number;
  name: string;
}
interface Database {
  name: string;
}
interface Table {
  name: string;
}
interface Column {
  name: string;
  type: string;
}

export default function Explorer() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [databases, setDatabases] = useState<Database[]>([]);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getClusters()
      .then((r) => setClusters(r.data))
      .catch(() => setError("Failed to load clusters"));
  }, []);

  const handleSelectCluster = async (id: number) => {
    setSelectedCluster(id);
    setSelectedDb(null);
    setSelectedTable(null);
    setTables([]);
    setColumns([]);
    setError("");
    setLoading(true);
    try {
      const res = await getDatabases(id);
      setDatabases(res.data);
    } catch (e: unknown) {
      const axErr = e as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to load databases");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDb = async (dbName: string) => {
    if (!selectedCluster) return;
    setSelectedDb(dbName);
    setSelectedTable(null);
    setColumns([]);
    setError("");
    setLoading(true);
    try {
      const res = await getTables(selectedCluster, dbName);
      setTables(res.data);
    } catch (e: unknown) {
      const axErr = e as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to load tables");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTable = async (tableName: string) => {
    if (!selectedCluster || !selectedDb) return;
    setSelectedTable(tableName);
    setError("");
    setLoading(true);
    try {
      const res = await getColumns(selectedCluster, selectedDb, tableName);
      setColumns(res.data);
    } catch (e: unknown) {
      const axErr = e as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to load columns");
    } finally {
      setLoading(false);
    }
  };

  const Panel = ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <div className="bg-white dark:bg-gray-900 shadow dark:shadow-gray-900/50 rounded-xl p-4 min-h-[300px]">
      <h2 className="font-semibold text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
        {title}
      </h2>
      {children}
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Explorer</h1>
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Panel title="Clusters">
          <ul className="space-y-0.5">
            {clusters.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => handleSelectCluster(c.id)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    selectedCluster === c.id
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {c.name}
                </button>
              </li>
            ))}
            {clusters.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 px-2">No clusters</p>
            )}
          </ul>
        </Panel>

        <Panel title="Databases">
          {loading && databases.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 px-2">Loading...</p>
          ) : (
            <ul className="space-y-0.5">
              {databases.map((d) => (
                <li key={d.name}>
                  <button
                    onClick={() => handleSelectDb(d.name)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      selectedDb === d.name
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium"
                        : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {d.name}
                  </button>
                </li>
              ))}
              {!selectedCluster && (
                <p className="text-sm text-gray-400 dark:text-gray-500 px-2">
                  Select a cluster
                </p>
              )}
            </ul>
          )}
        </Panel>

        <Panel title="Tables">
          <ul className="space-y-0.5">
            {tables.map((t) => (
              <li key={t.name}>
                <button
                  onClick={() => handleSelectTable(t.name)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      selectedTable === t.name
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium"
                        : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                    }`}
                >
                  {t.name}
                </button>
              </li>
            ))}
            {!selectedDb && (
              <p className="text-sm text-gray-400 dark:text-gray-500 px-2">Select a database</p>
            )}
          </ul>
        </Panel>

        <Panel title="Columns">
          {columns.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-gray-700">
                  <th className="text-left py-1.5 text-gray-500 dark:text-gray-400 font-medium">
                    Name
                  </th>
                  <th className="text-left py-1.5 text-gray-500 dark:text-gray-400 font-medium">
                    Type
                  </th>
                </tr>
              </thead>
              <tbody>
                {columns.map((c) => (
                  <tr key={c.name} className="border-b dark:border-gray-700 last:border-0">
                    <td className="py-1.5 font-medium text-gray-900 dark:text-gray-100">{c.name}</td>
                    <td className="py-1.5 text-gray-500 dark:text-gray-400 font-mono text-xs">
                      {c.type}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 px-2">
              {selectedTable ? "No columns" : "Select a table"}
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
