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
    <div className="bg-white shadow rounded-xl p-4 min-h-[300px]">
      <h2 className="font-semibold text-xs text-gray-400 uppercase tracking-wider mb-3">
        {title}
      </h2>
      {children}
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Explorer</h1>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
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
                      ? "bg-blue-100 text-blue-700 font-medium"
                      : "hover:bg-gray-100 text-gray-700"
                  }`}
                >
                  {c.name}
                </button>
              </li>
            ))}
            {clusters.length === 0 && (
              <p className="text-sm text-gray-400 px-2">No clusters</p>
            )}
          </ul>
        </Panel>

        <Panel title="Databases">
          {loading && databases.length === 0 ? (
            <p className="text-sm text-gray-400 px-2">Loading...</p>
          ) : (
            <ul className="space-y-0.5">
              {databases.map((d) => (
                <li key={d.name}>
                  <button
                    onClick={() => handleSelectDb(d.name)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      selectedDb === d.name
                        ? "bg-blue-100 text-blue-700 font-medium"
                        : "hover:bg-gray-100 text-gray-700"
                    }`}
                  >
                    {d.name}
                  </button>
                </li>
              ))}
              {!selectedCluster && (
                <p className="text-sm text-gray-400 px-2">
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
                      ? "bg-blue-100 text-blue-700 font-medium"
                      : "hover:bg-gray-100 text-gray-700"
                  }`}
                >
                  {t.name}
                </button>
              </li>
            ))}
            {!selectedDb && (
              <p className="text-sm text-gray-400 px-2">Select a database</p>
            )}
          </ul>
        </Panel>

        <Panel title="Columns">
          {columns.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1.5 text-gray-500 font-medium">
                    Name
                  </th>
                  <th className="text-left py-1.5 text-gray-500 font-medium">
                    Type
                  </th>
                </tr>
              </thead>
              <tbody>
                {columns.map((c) => (
                  <tr key={c.name} className="border-b last:border-0">
                    <td className="py-1.5 font-medium">{c.name}</td>
                    <td className="py-1.5 text-gray-500 font-mono text-xs">
                      {c.type}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-400 px-2">
              {selectedTable ? "No columns" : "Select a table"}
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
