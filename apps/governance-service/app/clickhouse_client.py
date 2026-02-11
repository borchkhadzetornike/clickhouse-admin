"""Thin async wrapper around the ClickHouse HTTP interface with rich diagnostics."""

import json
import logging
import time
from dataclasses import dataclass, field, asdict
from typing import Optional

import httpx

from .encryption import decrypt

logger = logging.getLogger(__name__)

# ── Error classification ─────────────────────────────────

ERROR_CODES = {
    "AUTH_FAILED": "Authentication failed — check username and password.",
    "DNS_ERROR": "Could not resolve host — verify the hostname is correct.",
    "CONNECTION_REFUSED": "Connection refused — ensure ClickHouse is running and the port is correct.",
    "TIMEOUT": "Connection timed out — the server may be unreachable or the timeout is too low.",
    "TLS_ERROR": "TLS/SSL handshake failed — verify the protocol and that the server supports TLS.",
    "PERMISSION_DENIED": "Permission denied — the user does not have access to the requested resource.",
    "UNKNOWN": "An unexpected error occurred.",
}

SUGGESTIONS: dict[str, list[str]] = {
    "AUTH_FAILED": [
        "Verify the ClickHouse username and password are correct.",
        "Check that the user exists in system.users.",
        "Ensure the user is not restricted by host IP.",
    ],
    "DNS_ERROR": [
        "Double-check the hostname for typos.",
        "Ensure the host is reachable from this network.",
        "Try using an IP address instead of a hostname.",
    ],
    "CONNECTION_REFUSED": [
        "Confirm ClickHouse is running on the specified host and port.",
        "Check firewall rules allow access to the port.",
        "Verify the protocol matches the server configuration (HTTP vs HTTPS).",
    ],
    "TIMEOUT": [
        "Increase the connection timeout in advanced settings.",
        "Check network connectivity to the host.",
        "Verify there are no firewalls dropping packets.",
    ],
    "TLS_ERROR": [
        "Switch protocol to HTTPS if the server requires TLS.",
        "Switch protocol to HTTP if the server does not support TLS.",
        "Verify the server's TLS certificate is valid.",
    ],
    "PERMISSION_DENIED": [
        "Check GRANT statements for this user.",
        "Ensure the user has at least SELECT permission on system tables.",
    ],
    "UNKNOWN": [
        "Check ClickHouse server logs for more details.",
        "Verify the connection parameters are correct.",
    ],
}


def _classify_error(exc: Exception) -> tuple[str, str]:
    """Return (error_code, readable_message) for common ClickHouse/network errors."""
    msg = str(exc).lower()
    exc_type = type(exc).__name__.lower()

    # DNS resolution failures
    if any(k in msg for k in ("name or service not known", "nodename nor servname",
                               "getaddrinfo failed", "no address associated")):
        return "DNS_ERROR", ERROR_CODES["DNS_ERROR"]

    # Connection refused
    if "connection refused" in msg or "connect call failed" in msg:
        return "CONNECTION_REFUSED", ERROR_CODES["CONNECTION_REFUSED"]

    # Timeouts
    if any(k in msg for k in ("timed out", "timeout", "connecttimeout")):
        return "TIMEOUT", ERROR_CODES["TIMEOUT"]

    # TLS errors
    if any(k in msg for k in ("ssl", "tls", "certificate", "handshake")):
        return "TLS_ERROR", ERROR_CODES["TLS_ERROR"]

    # HTTP status-based classification
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        body = exc.response.text.lower()
        if code == 401 or code == 403 or "authentication" in body or "wrong password" in body:
            return "AUTH_FAILED", ERROR_CODES["AUTH_FAILED"]
        if "access denied" in body or "not enough privileges" in body:
            return "PERMISSION_DENIED", ERROR_CODES["PERMISSION_DENIED"]

    # Auth strings in generic errors
    if any(k in msg for k in ("authentication", "wrong password", "incorrect user")):
        return "AUTH_FAILED", ERROR_CODES["AUTH_FAILED"]

    if "access denied" in msg or "not enough privileges" in msg:
        return "PERMISSION_DENIED", ERROR_CODES["PERMISSION_DENIED"]

    return "UNKNOWN", ERROR_CODES["UNKNOWN"]


@dataclass
class ConnectionTestResult:
    """Structured result from a connection validation/test."""
    ok: bool
    error_code: Optional[str] = None
    message: str = ""
    suggestions: list[str] = field(default_factory=list)
    latency_ms: Optional[int] = None
    server_version: Optional[str] = None
    current_user: Optional[str] = None
    raw_error: Optional[str] = None

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


class ClickHouseClient:
    def __init__(
        self,
        host: str,
        port: int,
        protocol: str,
        username: str,
        password_encrypted: str,
        database: str | None = None,
        timeout: float = 15.0,
    ):
        self.host = host
        self.port = port
        self.protocol = protocol
        self.username = username
        self.password = decrypt(password_encrypted)
        self.database = database
        self.timeout = timeout
        self.base_url = f"{protocol}://{host}:{port}"

    def _params(self, query: str, db: str | None = None) -> dict:
        params: dict[str, str] = {
            "user": self.username,
            "password": self.password,
            "query": query,
        }
        effective_db = db or self.database
        if effective_db:
            params["database"] = effective_db
        return params

    async def execute(self, query: str, db: str | None = None) -> str:
        async with httpx.AsyncClient(timeout=self.timeout, verify=False) as client:
            resp = await client.get(self.base_url, params=self._params(query, db))
            resp.raise_for_status()
            return resp.text.strip()

    async def execute_json(self, query: str, db: str | None = None) -> list[dict]:
        """Execute query and return rows as a list of dicts (JSONEachRow)."""
        raw = await self.execute(query + " FORMAT JSONEachRow", db)
        if not raw:
            return []
        return [json.loads(line) for line in raw.split("\n") if line.strip()]

    async def test_connection(self) -> ConnectionTestResult:
        """Quick connectivity check — returns structured result."""
        return await self.validate_connection()

    async def validate_connection(self) -> ConnectionTestResult:
        """Full connection validation with latency, version, and current user detection."""
        start = time.monotonic()
        try:
            await self.execute("SELECT 1")
            latency = int((time.monotonic() - start) * 1000)

            # Fetch server version
            version = None
            try:
                version = await self.execute("SELECT version()")
            except Exception:
                pass

            # Fetch current user
            current_user = None
            try:
                current_user = await self.execute("SELECT currentUser()")
            except Exception:
                pass

            return ConnectionTestResult(
                ok=True,
                message="Connection successful",
                latency_ms=latency,
                server_version=version,
                current_user=current_user,
            )
        except Exception as e:
            latency = int((time.monotonic() - start) * 1000)
            error_code, readable_msg = _classify_error(e)
            logger.error(
                f"Connection validation failed for {self.host}:{self.port}: {e}"
            )
            return ConnectionTestResult(
                ok=False,
                error_code=error_code,
                message=readable_msg,
                suggestions=SUGGESTIONS.get(error_code, []),
                latency_ms=latency,
                raw_error=str(e),
            )

    # ── Explorer queries ────────────────────────────────────

    async def get_databases(self) -> list[str]:
        result = await self.execute("SHOW DATABASES")
        return [line for line in result.split("\n") if line.strip()]

    async def get_databases_with_counts(self) -> list[dict]:
        """Return databases with table counts."""
        try:
            rows = await self.execute_json(
                "SELECT database AS name, count() AS table_count "
                "FROM system.tables WHERE database NOT IN ('system','INFORMATION_SCHEMA','information_schema') "
                "GROUP BY database ORDER BY database"
            )
            # Also include system databases, marked separately
            sys_rows = await self.execute_json(
                "SELECT database AS name, count() AS table_count "
                "FROM system.tables WHERE database IN ('system','INFORMATION_SCHEMA','information_schema') "
                "GROUP BY database ORDER BY database"
            )
            result = []
            for r in rows:
                result.append({
                    "name": r["name"],
                    "table_count": int(r["table_count"]),
                    "is_system": False,
                })
            for r in sys_rows:
                result.append({
                    "name": r["name"],
                    "table_count": int(r["table_count"]),
                    "is_system": True,
                })
            return result
        except Exception:
            # Fallback to simple list
            dbs = await self.get_databases()
            return [{"name": d, "table_count": 0, "is_system": d in ("system", "INFORMATION_SCHEMA", "information_schema")} for d in dbs]

    async def get_tables(self, db: str) -> list[dict]:
        result = await self.execute(f"SHOW TABLES FROM `{db}`")
        tables = []
        for line in result.split("\n"):
            if line.strip():
                tables.append({"name": line.strip()})
        return tables

    async def get_tables_with_metadata(self, db: str) -> list[dict]:
        """Return tables with engine, row count estimate, and size info."""
        try:
            rows = await self.execute_json(
                "SELECT name, engine, total_rows, total_bytes, "
                "metadata_modification_time "
                f"FROM system.tables WHERE database = '{db}' "
                "ORDER BY name"
            )
            result = []
            for r in rows:
                result.append({
                    "name": r.get("name", ""),
                    "engine": r.get("engine", ""),
                    "total_rows": int(r["total_rows"]) if r.get("total_rows") else None,
                    "total_bytes": int(r["total_bytes"]) if r.get("total_bytes") else None,
                    "last_modified": r.get("metadata_modification_time"),
                })
            return result
        except Exception:
            return await self.get_tables(db)

    async def get_columns(self, db: str, table: str) -> list[dict]:
        result = await self.execute(f"DESCRIBE TABLE `{db}`.`{table}`")
        columns = []
        for line in result.split("\n"):
            if line.strip():
                parts = line.split("\t")
                columns.append(
                    {
                        "name": parts[0] if len(parts) > 0 else "",
                        "type": parts[1] if len(parts) > 1 else "",
                    }
                )
        return columns

    async def get_columns_rich(self, db: str, table: str) -> list[dict]:
        """Return full column details including defaults, codecs, PK info."""
        try:
            rows = await self.execute_json(
                "SELECT name, type, default_kind, default_expression, "
                "comment, is_in_primary_key, is_in_sorting_key, "
                "compression_codec "
                f"FROM system.columns WHERE database = '{db}' AND table = '{table}' "
                "ORDER BY position"
            )
            return [{
                "name": r.get("name", ""),
                "type": r.get("type", ""),
                "default_kind": r.get("default_kind", ""),
                "default_expression": r.get("default_expression", ""),
                "comment": r.get("comment", ""),
                "is_in_primary_key": str(r.get("is_in_primary_key", "0")) == "1",
                "is_in_sorting_key": str(r.get("is_in_sorting_key", "0")) == "1",
                "codec": r.get("compression_codec", ""),
            } for r in rows]
        except Exception:
            # Fallback
            cols = await self.get_columns(db, table)
            return [{**c, "default_kind": "", "default_expression": "",
                     "comment": "", "is_in_primary_key": False,
                     "is_in_sorting_key": False, "codec": ""} for c in cols]

    async def get_table_ddl(self, db: str, table: str) -> str:
        """Return SHOW CREATE TABLE output."""
        result = await self.execute(f"SHOW CREATE TABLE `{db}`.`{table}`")
        return result

    async def get_table_metadata(self, db: str, table: str) -> dict:
        """Return rich table metadata from system.tables."""
        try:
            rows = await self.execute_json(
                "SELECT engine, engine_full, partition_key, sorting_key, "
                "primary_key, sampling_key, total_rows, total_bytes, "
                "lifetime_rows, lifetime_bytes, "
                "metadata_modification_time, create_table_query, comment "
                f"FROM system.tables WHERE database = '{db}' AND name = '{table}'"
            )
            if rows:
                r = rows[0]
                return {
                    "engine": r.get("engine", ""),
                    "engine_full": r.get("engine_full", ""),
                    "partition_key": r.get("partition_key", ""),
                    "sorting_key": r.get("sorting_key", ""),
                    "primary_key": r.get("primary_key", ""),
                    "sampling_key": r.get("sampling_key", ""),
                    "total_rows": int(r["total_rows"]) if r.get("total_rows") else None,
                    "total_bytes": int(r["total_bytes"]) if r.get("total_bytes") else None,
                    "lifetime_rows": int(r["lifetime_rows"]) if r.get("lifetime_rows") else None,
                    "lifetime_bytes": int(r["lifetime_bytes"]) if r.get("lifetime_bytes") else None,
                    "last_modified": r.get("metadata_modification_time"),
                    "comment": r.get("comment", ""),
                }
            return {}
        except Exception as e:
            logger.warning(f"Failed to get metadata for {db}.{table}: {e}")
            return {}

    async def get_table_sample(self, db: str, table: str, limit: int = 20) -> dict:
        """Return sample rows with column names. Safe, read-only, limited."""
        try:
            raw = await self.execute(
                f"SELECT * FROM `{db}`.`{table}` LIMIT {limit} FORMAT JSON"
            )
            data = json.loads(raw)
            return {
                "columns": [
                    {"name": m["name"], "type": m["type"]}
                    for m in data.get("meta", [])
                ],
                "rows": data.get("data", []),
                "rows_read": data.get("statistics", {}).get("rows_read", 0),
                "elapsed_ms": int(data.get("statistics", {}).get("elapsed", 0) * 1000),
            }
        except Exception as e:
            logger.warning(f"Failed to get sample for {db}.{table}: {e}")
            return {"columns": [], "rows": [], "error": str(e)}
