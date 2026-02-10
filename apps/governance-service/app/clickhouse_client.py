"""Thin async wrapper around the ClickHouse HTTP interface."""

import json
import logging

import httpx

from .encryption import decrypt

logger = logging.getLogger(__name__)


class ClickHouseClient:
    def __init__(
        self,
        host: str,
        port: int,
        protocol: str,
        username: str,
        password_encrypted: str,
        database: str | None = None,
    ):
        self.host = host
        self.port = port
        self.protocol = protocol
        self.username = username
        self.password = decrypt(password_encrypted)
        self.database = database
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
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            resp = await client.get(self.base_url, params=self._params(query, db))
            resp.raise_for_status()
            return resp.text.strip()

    async def execute_json(self, query: str, db: str | None = None) -> list[dict]:
        """Execute query and return rows as a list of dicts (JSONEachRow)."""
        raw = await self.execute(query + " FORMAT JSONEachRow", db)
        if not raw:
            return []
        return [json.loads(line) for line in raw.split("\n") if line.strip()]

    async def test_connection(self) -> tuple[bool, str]:
        try:
            result = await self.execute("SELECT 1")
            return True, f"Connection successful (result: {result})"
        except Exception as e:
            logger.error(f"Connection test failed for {self.host}:{self.port}: {e}")
            return False, f"Connection failed: {str(e)}"

    async def get_databases(self) -> list[str]:
        result = await self.execute("SHOW DATABASES")
        return [line for line in result.split("\n") if line.strip()]

    async def get_tables(self, db: str) -> list[dict]:
        result = await self.execute(f"SHOW TABLES FROM `{db}`")
        tables = []
        for line in result.split("\n"):
            if line.strip():
                tables.append({"name": line.strip()})
        return tables

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
