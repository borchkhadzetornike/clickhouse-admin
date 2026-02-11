import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  getClusters,
  createCluster,
  updateCluster,
  deleteCluster,
  validateConnection,
  testClusterConnection,
  getClusterDiagnostics,
} from "../api/governance";

/* ────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────── */

interface Cluster {
  id: number;
  name: string;
  host: string;
  port: number;
  protocol: string;
  username: string;
  database: string | null;
  created_by: number;
  status: string;
  last_tested_at: string | null;
  latency_ms: number | null;
  server_version: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string | null;
}

interface ValidationResult {
  ok: boolean;
  error_code?: string;
  message: string;
  suggestions?: string[];
  latency_ms?: number;
  server_version?: string;
  current_user?: string;
  raw_error?: string;
}

interface DiagnosticsData {
  id: number;
  name: string;
  host: string;
  port: number;
  protocol: string;
  username: string;
  database: string | null;
  status: string;
  last_tested_at: string | null;
  latency_ms: number | null;
  server_version: string | null;
  current_user_detected: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string | null;
  dependency_count: number;
}

interface FormData {
  name: string;
  host: string;
  port: string;
  protocol: string;
  username: string;
  password: string;
  database: string;
}

const INITIAL_FORM: FormData = {
  name: "",
  host: "",
  port: "8123",
  protocol: "http",
  username: "default",
  password: "",
  database: "",
};

/* ────────────────────────────────────────────────────────
   Utility helpers
   ──────────────────────────────────────────────────────── */

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function utcTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().replace("T", " ").replace(/\.\d+Z/, " UTC");
}

/* ────────────────────────────────────────────────────────
   Status Badge
   ──────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    healthy: {
      bg: "bg-emerald-100 dark:bg-emerald-900/40",
      text: "text-emerald-700 dark:text-emerald-300",
      label: "Healthy",
    },
    failed: {
      bg: "bg-red-100 dark:bg-red-900/40",
      text: "text-red-700 dark:text-red-300",
      label: "Failed",
    },
    never_tested: {
      bg: "bg-gray-100 dark:bg-gray-700",
      text: "text-gray-600 dark:text-gray-400",
      label: "Never tested",
    },
  };
  const s = map[status] || map.never_tested;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}
    >
      {status === "healthy" && (
        <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-emerald-500 animate-pulse" />
      )}
      {status === "failed" && (
        <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-red-500" />
      )}
      {s.label}
    </span>
  );
}

/* ────────────────────────────────────────────────────────
   Spinner
   ──────────────────────────────────────────────────────── */

function Spinner({ size = 4 }: { size?: number }) {
  return (
    <svg
      className={`animate-spin h-${size} w-${size} text-blue-500`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      style={{ height: `${size * 4}px`, width: `${size * 4}px` }}
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────
   Toast notification
   ──────────────────────────────────────────────────────── */

interface Toast {
  id: number;
  type: "success" | "error";
  message: string;
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 max-w-sm animate-[slideIn_0.3s_ease] ${
            t.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {t.type === "success" ? (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="ml-2 opacity-70 hover:opacity-100">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────
   Validation step result card
   ──────────────────────────────────────────────────────── */

function ValidationResultCard({ result }: { result: ValidationResult }) {
  const [showRaw, setShowRaw] = useState(false);
  if (result.ok) {
    return (
      <div className="mt-4 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">Connected</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {result.server_version && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Server version:</span>{" "}
              <span className="font-medium text-gray-900 dark:text-gray-100">{result.server_version}</span>
            </div>
          )}
          {result.current_user && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Current user:</span>{" "}
              <span className="font-medium text-gray-900 dark:text-gray-100">{result.current_user}</span>
            </div>
          )}
          {result.latency_ms != null && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Latency:</span>{" "}
              <span className="font-medium text-gray-900 dark:text-gray-100">{result.latency_ms}ms</span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-4 p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="font-semibold text-red-700 dark:text-red-300">Connection Failed</span>
        {result.error_code && (
          <span className="ml-2 px-2 py-0.5 rounded text-xs font-mono bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200">
            {result.error_code}
          </span>
        )}
      </div>
      <p className="text-sm text-red-700 dark:text-red-300 mb-2">{result.message}</p>
      {result.suggestions && result.suggestions.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1 uppercase tracking-wide">Suggestions</p>
          <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-400 space-y-0.5">
            {result.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {result.raw_error && (
        <div>
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="text-xs text-red-500 dark:text-red-400 underline hover:no-underline"
          >
            {showRaw ? "Hide raw error" : "Show raw error"}
          </button>
          {showRaw && (
            <pre className="mt-1 p-2 bg-red-100 dark:bg-red-900/40 rounded text-xs text-red-800 dark:text-red-200 overflow-x-auto max-h-40 whitespace-pre-wrap">
              {result.raw_error}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────
   Connection Wizard Modal
   ──────────────────────────────────────────────────────── */

function ConnectionWizard({
  editCluster,
  onClose,
  onSaved,
  addToast,
}: {
  editCluster?: Cluster | null;
  onClose: () => void;
  onSaved: () => void;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  const isEdit = !!editCluster;
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(() => {
    if (editCluster) {
      return {
        name: editCluster.name,
        host: editCluster.host,
        port: String(editCluster.port),
        protocol: editCluster.protocol,
        username: editCluster.username,
        password: "",
        database: editCluster.database || "",
      };
    }
    return { ...INITIAL_FORM };
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on outside click
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Name is required";
    if (!form.host.trim()) errors.host = "Host is required";
    if (!form.port.trim() || isNaN(Number(form.port)) || Number(form.port) < 1 || Number(form.port) > 65535)
      errors.port = "Valid port (1-65535) is required";
    if (!form.username.trim()) errors.username = "Username is required";
    if (!isEdit && !form.password) errors.password = "Password is required";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleGoToValidate = () => {
    if (validateForm()) {
      setStep(2);
      setValidationResult(null);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const pw = form.password || "PLACEHOLDER_UNCHANGED";
      const res = await validateConnection({
        host: form.host,
        port: Number(form.port),
        protocol: form.protocol,
        username: form.username,
        password: pw,
        database: form.database || undefined,
      });
      setValidationResult(res.data);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setValidationResult({
        ok: false,
        message: axErr.response?.data?.detail || "Validation request failed",
        error_code: "UNKNOWN",
      });
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isEdit && editCluster) {
        const payload: Record<string, unknown> = {};
        if (form.name !== editCluster.name) payload.name = form.name;
        if (form.host !== editCluster.host) payload.host = form.host;
        if (Number(form.port) !== editCluster.port) payload.port = Number(form.port);
        if (form.protocol !== editCluster.protocol) payload.protocol = form.protocol;
        if (form.username !== editCluster.username) payload.username = form.username;
        if (form.password) payload.password = form.password;
        if ((form.database || null) !== editCluster.database) payload.database = form.database || null;
        await updateCluster(editCluster.id, payload);
        addToast("success", `Connection '${form.name}' updated`);
      } else {
        await createCluster({
          name: form.name,
          host: form.host,
          port: Number(form.port),
          protocol: form.protocol,
          username: form.username,
          password: form.password,
          database: form.database || undefined,
        });
        addToast("success", `Connection '${form.name}' created`);
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      addToast("error", axErr.response?.data?.detail || "Failed to save connection");
    } finally {
      setSaving(false);
    }
  };

  const canSave = validationResult?.ok === true;

  const inputCls = (field: string) =>
    `w-full border rounded-lg px-3 py-2 text-sm transition-colors ${
      fieldErrors[field]
        ? "border-red-400 dark:border-red-600 focus:ring-red-500"
        : "border-gray-300 dark:border-gray-600 focus:ring-blue-500"
    } dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={handleBackdrop}
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {isEdit ? "Edit Connection" : "New Connection"}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Step {step} of 3 — {step === 1 ? "Connection Info" : step === 2 ? "Validate" : "Save"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-6 pt-4">
          <div className="flex items-center gap-1">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  s <= step ? "bg-blue-500" : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="px-6 py-5">
          {/* ── STEP 1: Form ─── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => {
                      setForm({ ...form, name: e.target.value });
                      setFieldErrors((p) => ({ ...p, name: "" }));
                    }}
                    className={inputCls("name")}
                    placeholder="production-ch"
                    autoFocus
                  />
                  {fieldErrors.name && <p className="text-xs text-red-500 mt-1">{fieldErrors.name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Host <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.host}
                    onChange={(e) => {
                      setForm({ ...form, host: e.target.value });
                      setFieldErrors((p) => ({ ...p, host: "" }));
                    }}
                    className={inputCls("host")}
                    placeholder="clickhouse.example.com"
                  />
                  {fieldErrors.host && <p className="text-xs text-red-500 mt-1">{fieldErrors.host}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Port <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.port}
                    onChange={(e) => {
                      setForm({ ...form, port: e.target.value });
                      setFieldErrors((p) => ({ ...p, port: "" }));
                    }}
                    className={inputCls("port")}
                    placeholder="8123"
                    type="number"
                    min={1}
                    max={65535}
                  />
                  {fieldErrors.port && <p className="text-xs text-red-500 mt-1">{fieldErrors.port}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Protocol</label>
                  <select
                    value={form.protocol}
                    onChange={(e) => setForm({ ...form, protocol: e.target.value })}
                    className={inputCls("")}
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.username}
                    onChange={(e) => {
                      setForm({ ...form, username: e.target.value });
                      setFieldErrors((p) => ({ ...p, username: "" }));
                    }}
                    className={inputCls("username")}
                    placeholder="default"
                  />
                  {fieldErrors.username && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.username}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Password {!isEdit && <span className="text-red-500">*</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => {
                        setForm({ ...form, password: e.target.value });
                        setFieldErrors((p) => ({ ...p, password: "" }));
                      }}
                      className={inputCls("password") + " pr-10"}
                      placeholder={isEdit ? "(unchanged)" : "Enter password"}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {fieldErrors.password && <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>}
                  {isEdit && (
                    <p className="text-xs text-gray-400 mt-1">Leave blank to keep current password</p>
                  )}
                </div>
              </div>

              {/* Advanced toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-90" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Advanced options
                </button>
                {showAdvanced && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                        Database (optional)
                      </label>
                      <input
                        value={form.database}
                        onChange={(e) => setForm({ ...form, database: e.target.value })}
                        className={inputCls("")}
                        placeholder="default"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                        TLS
                      </label>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Controlled via Protocol (HTTP/HTTPS). Use HTTPS for TLS connections.
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1 text-gray-500 dark:text-gray-500">
                        Custom headers (future)
                      </label>
                      <div className="p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-xs text-gray-400 dark:text-gray-500">
                        Custom HTTP headers support coming in a future release.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 2: Validate ─── */}
          {step === 2 && (
            <div>
              <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium text-gray-900 dark:text-gray-100">{form.host}</span>:{form.port} ({form.protocol}) as <span className="font-medium text-gray-900 dark:text-gray-100">{form.username}</span>
              </div>
              <button
                onClick={handleValidate}
                disabled={validating}
                className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {validating ? (
                  <>
                    <Spinner size={4} />
                    Validating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Validate Connection
                  </>
                )}
              </button>
              {validationResult && <ValidationResultCard result={validationResult} />}
            </div>
          )}

          {/* ── STEP 3: Save ─── */}
          {step === 3 && (
            <div>
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800 mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Connection Summary</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-gray-500 dark:text-gray-400">Name</dt>
                  <dd className="text-gray-900 dark:text-gray-100 font-medium">{form.name}</dd>
                  <dt className="text-gray-500 dark:text-gray-400">Host</dt>
                  <dd className="text-gray-900 dark:text-gray-100">{form.host}:{form.port}</dd>
                  <dt className="text-gray-500 dark:text-gray-400">Protocol</dt>
                  <dd className="text-gray-900 dark:text-gray-100">{form.protocol.toUpperCase()}</dd>
                  <dt className="text-gray-500 dark:text-gray-400">Username</dt>
                  <dd className="text-gray-900 dark:text-gray-100">{form.username}</dd>
                  {form.database && (
                    <>
                      <dt className="text-gray-500 dark:text-gray-400">Database</dt>
                      <dd className="text-gray-900 dark:text-gray-100">{form.database}</dd>
                    </>
                  )}
                  {validationResult?.server_version && (
                    <>
                      <dt className="text-gray-500 dark:text-gray-400">Server version</dt>
                      <dd className="text-gray-900 dark:text-gray-100">{validationResult.server_version}</dd>
                    </>
                  )}
                  {validationResult?.latency_ms != null && (
                    <>
                      <dt className="text-gray-500 dark:text-gray-400">Latency</dt>
                      <dd className="text-gray-900 dark:text-gray-100">{validationResult.latency_ms}ms</dd>
                    </>
                  )}
                </dl>
              </div>
              {!canSave && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300 mb-4">
                  Connection validation is required before saving. Go back and validate.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl">
          <div>
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            >
              Cancel
            </button>
            {step === 1 && (
              <button
                onClick={handleGoToValidate}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Next: Validate
              </button>
            )}
            {step === 2 && (
              <button
                onClick={() => setStep(3)}
                disabled={!canSave}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next: Review
              </button>
            )}
            {step === 3 && (
              <button
                onClick={handleSave}
                disabled={!canSave || saving}
                className="bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Spinner size={4} />
                    Saving...
                  </>
                ) : (
                  <>{isEdit ? "Update Connection" : "Save Connection"}</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────
   Delete Confirmation Modal
   ──────────────────────────────────────────────────────── */

function DeleteConfirmModal({
  cluster,
  onClose,
  onConfirm,
  deleting,
}: {
  cluster: Cluster;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md" role="dialog" aria-modal="true">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/40">
              <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Delete Connection</h3>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Are you sure you want to delete <span className="font-semibold text-gray-900 dark:text-gray-100">"{cluster.name}"</span>?
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
            This will soft-delete the connection. Existing proposals referencing this cluster will be preserved.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="bg-red-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {deleting ? (
              <>
                <Spinner size={4} />
                Deleting...
              </>
            ) : (
              "Delete Connection"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────
   Diagnostics Drawer
   ──────────────────────────────────────────────────────── */

function DiagnosticsDrawer({
  clusterId,
  onClose,
}: {
  clusterId: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await getClusterDiagnostics(clusterId);
        setData(res.data);
      } catch {
        setError("Failed to load diagnostics");
      } finally {
        setLoading(false);
      }
    })();
  }, [clusterId]);

  const handleCopy = () => {
    if (!data) return;
    const sanitized = { ...data };
    navigator.clipboard.writeText(JSON.stringify(sanitized, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Connection Diagnostics</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {loading && (
            <div className="flex justify-center py-12">
              <Spinner size={6} />
            </div>
          )}
          {error && (
            <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>
          )}
          {data && (
            <>
              {/* Basic info */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                  Basic Info
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Name</dt>
                    <dd className="text-gray-900 dark:text-gray-100 font-medium">{data.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Host</dt>
                    <dd className="text-gray-900 dark:text-gray-100 font-mono text-xs">{data.host}:{data.port}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Protocol</dt>
                    <dd className="text-gray-900 dark:text-gray-100">{data.protocol.toUpperCase()}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Username</dt>
                    <dd className="text-gray-900 dark:text-gray-100">{data.username}</dd>
                  </div>
                  {data.database && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-gray-400">Database</dt>
                      <dd className="text-gray-900 dark:text-gray-100">{data.database}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Dependencies</dt>
                    <dd className="text-gray-900 dark:text-gray-100">{data.dependency_count} proposal(s)</dd>
                  </div>
                </dl>
              </section>

              {/* Last validation result */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                  Last Validation Result
                </h3>
                <div className="flex items-center gap-3 mb-2">
                  <StatusBadge status={data.status} />
                  {data.last_tested_at && (
                    <span className="text-xs text-gray-500 dark:text-gray-400" title={utcTime(data.last_tested_at)}>
                      {relativeTime(data.last_tested_at)}
                    </span>
                  )}
                </div>
                <dl className="space-y-2 text-sm">
                  {data.server_version && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-gray-400">Server version</dt>
                      <dd className="text-gray-900 dark:text-gray-100 font-mono text-xs">{data.server_version}</dd>
                    </div>
                  )}
                  {data.current_user_detected && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-gray-400">Detected user</dt>
                      <dd className="text-gray-900 dark:text-gray-100">{data.current_user_detected}</dd>
                    </div>
                  )}
                  {data.latency_ms != null && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-gray-400">Latency</dt>
                      <dd className="text-gray-900 dark:text-gray-100">{data.latency_ms}ms</dd>
                    </div>
                  )}
                </dl>
              </section>

              {/* Error history */}
              {data.error_code && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-red-500 dark:text-red-400 mb-3">
                    Error Details
                  </h3>
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded text-xs font-mono bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200">
                        {data.error_code}
                      </span>
                    </div>
                    <p className="text-sm text-red-700 dark:text-red-300">{data.error_message}</p>
                  </div>
                </section>
              )}

              {/* Raw diagnostic JSON */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Raw Diagnostics
                  </h3>
                  <button
                    onClick={handleCopy}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    {copied ? (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy JSON
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-xs text-gray-800 dark:text-gray-200 overflow-x-auto max-h-60 font-mono">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────────────
   Loading Skeleton
   ──────────────────────────────────────────────────────── */

function TableSkeleton() {
  return (
    <div className="animate-pulse">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-4 border-b dark:border-gray-700">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded flex-1" />
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────
   Main Component
   ──────────────────────────────────────────────────────── */

export default function Clusters() {
  const { user } = useAuth();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [editTarget, setEditTarget] = useState<Cluster | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Cluster | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [diagnosticsId, setDiagnosticsId] = useState<number | null>(null);
  const [testingIds, setTestingIds] = useState<Set<number>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(false);
  const nextToastId = useRef(0);

  const addToast = useCallback((type: "success" | "error", message: string) => {
    const id = nextToastId.current++;
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((p) => p.filter((t) => t.id !== id));
  }, []);

  const loadClusters = useCallback(async () => {
    try {
      const res = await getClusters();
      setClusters(res.data);
    } catch {
      addToast("error", "Failed to load connections");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadClusters();
  }, [loadClusters]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadClusters, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadClusters]);

  const handleTest = async (id: number) => {
    setTestingIds((p) => new Set(p).add(id));
    try {
      const res = await testClusterConnection(id);
      if (res.data.ok) {
        addToast("success", `Connection healthy (${res.data.latency_ms}ms)`);
      } else {
        addToast("error", res.data.message || "Connection failed");
      }
      loadClusters();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      addToast("error", axErr.response?.data?.detail || "Test failed");
    } finally {
      setTestingIds((p) => {
        const next = new Set(p);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCluster(deleteTarget.id);
      addToast("success", `Connection '${deleteTarget.name}' deleted`);
      setDeleteTarget(null);
      loadClusters();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      addToast("error", axErr.response?.data?.detail || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const handleEdit = (c: Cluster) => {
    setEditTarget(c);
    setShowWizard(true);
  };

  const isAdmin = user?.role === "admin";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Connections</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage ClickHouse cluster connections
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Auto-refresh toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
            <div className="relative">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={() => setAutoRefresh(!autoRefresh)}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-gray-300 dark:bg-gray-600 rounded-full peer-checked:bg-blue-500 transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform" />
            </div>
            Auto-refresh
          </label>
          {/* Refresh button */}
          <button
            onClick={() => loadClusters()}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Refresh"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {isAdmin && (
            <button
              onClick={() => {
                setEditTarget(null);
                setShowWizard(true);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Connection
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 shadow dark:shadow-gray-900/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Host</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Protocol</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Last Tested</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Latency</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Version</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>
                    <TableSkeleton />
                  </td>
                </tr>
              ) : clusters.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-12 h-12 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                      </svg>
                      <p className="text-gray-400 dark:text-gray-500 text-sm">No connections configured yet.</p>
                      {isAdmin && (
                        <button
                          onClick={() => {
                            setEditTarget(null);
                            setShowWizard(true);
                          }}
                          className="text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline"
                        >
                          Add your first connection
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                clusters.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900 dark:text-gray-100">{c.name}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs">
                      {c.host}:{c.port}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        {c.protocol.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                      {c.error_code && (
                        <span
                          className="ml-1.5 text-xs text-red-500 dark:text-red-400 cursor-help"
                          title={c.error_message || c.error_code}
                        >
                          ({c.error_code})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs" title={utcTime(c.last_tested_at)}>
                      {relativeTime(c.last_tested_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">
                      {c.latency_ms != null ? `${c.latency_ms}ms` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs font-mono">
                      {c.server_version || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* Test */}
                        {isAdmin && (
                          <button
                            onClick={() => handleTest(c.id)}
                            disabled={testingIds.has(c.id)}
                            className="p-1.5 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-50 transition-colors"
                            title="Test connection"
                          >
                            {testingIds.has(c.id) ? (
                              <Spinner size={4} />
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                            )}
                          </button>
                        )}
                        {/* Diagnostics */}
                        <button
                          onClick={() => setDiagnosticsId(c.id)}
                          className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                          title="View diagnostics"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        {/* Edit */}
                        {isAdmin && (
                          <button
                            onClick={() => handleEdit(c)}
                            className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            title="Edit connection"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                        {/* Delete */}
                        {isAdmin && (
                          <button
                            onClick={() => setDeleteTarget(c)}
                            className="p-1.5 rounded-lg text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                            title="Delete connection"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Wizard modal */}
      {showWizard && (
        <ConnectionWizard
          editCluster={editTarget}
          onClose={() => {
            setShowWizard(false);
            setEditTarget(null);
          }}
          onSaved={loadClusters}
          addToast={addToast}
        />
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          cluster={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}

      {/* Diagnostics drawer */}
      {diagnosticsId != null && (
        <DiagnosticsDrawer
          clusterId={diagnosticsId}
          onClose={() => setDiagnosticsId(null)}
        />
      )}

      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
