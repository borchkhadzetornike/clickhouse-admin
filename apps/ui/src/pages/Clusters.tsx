import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  getClusters,
  createCluster,
  testConnection,
} from "../api/governance";

interface Cluster {
  id: number;
  name: string;
  host: string;
  port: number;
  protocol: string;
  username: string;
  database: string | null;
  created_at: string;
}

const INITIAL_FORM = {
  name: "",
  host: "",
  port: "8123",
  protocol: "http",
  username: "default",
  password: "",
  database: "",
};

export default function Clusters() {
  const { user } = useAuth();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState("");
  const [testResults, setTestResults] = useState<
    Record<number, { success: boolean; message: string }>
  >({});
  const [testing, setTesting] = useState<Record<number, boolean>>({});

  useEffect(() => {
    loadClusters();
  }, []);

  const loadClusters = async () => {
    try {
      const res = await getClusters();
      setClusters(res.data);
    } catch {
      setError("Failed to load clusters");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await createCluster({
        ...form,
        port: parseInt(form.port),
        database: form.database || undefined,
      });
      setShowForm(false);
      setForm(INITIAL_FORM);
      loadClusters();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setError(axErr.response?.data?.detail || "Failed to create cluster");
    }
  };

  const handleTest = async (id: number) => {
    setTesting((p) => ({ ...p, [id]: true }));
    try {
      const res = await testConnection(id);
      setTestResults((p) => ({ ...p, [id]: res.data }));
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setTestResults((p) => ({
        ...p,
        [id]: {
          success: false,
          message: axErr.response?.data?.detail || "Test failed",
        },
      }));
    } finally {
      setTesting((p) => ({ ...p, [id]: false }));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Clusters</h1>
        {user?.role === "admin" && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            {showForm ? "Cancel" : "Add Cluster"}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white shadow rounded-xl p-6 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="production-ch"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Host</label>
            <input
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="clickhouse.example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Port</label>
            <input
              value={form.port}
              onChange={(e) => setForm({ ...form, port: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Protocol</label>
            <select
              value={form.protocol}
              onChange={(e) => setForm({ ...form, protocol: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              CH Username
            </label>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              CH Password
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Database (optional)
            </label>
            <input
              value={form.database}
              onChange={(e) => setForm({ ...form, database: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="default"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Create Cluster
            </button>
          </div>
        </form>
      )}

      <div className="bg-white shadow rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">
                Name
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">
                Host
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">
                Port
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">
                Protocol
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {clusters.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-gray-600">{c.host}</td>
                <td className="px-4 py-3 text-gray-600">{c.port}</td>
                <td className="px-4 py-3 text-gray-600">{c.protocol}</td>
                <td className="px-4 py-3">
                  {user?.role === "admin" && (
                    <button
                      onClick={() => handleTest(c.id)}
                      disabled={testing[c.id]}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50"
                    >
                      {testing[c.id] ? "Testing..." : "Test Connection"}
                    </button>
                  )}
                  {testResults[c.id] && (
                    <span
                      className={`ml-3 text-xs font-medium ${
                        testResults[c.id].success
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {testResults[c.id].message}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {clusters.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  No clusters configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
