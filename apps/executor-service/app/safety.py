"""Identifier validation and SQL injection prevention."""

import re

# Strict regex: letters, digits, underscore only; 1-64 chars
_SAFE_IDENT = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]{0,63}$")


def validate_identifier(name: str) -> bool:
    """Return True if name is a safe ClickHouse identifier."""
    return bool(_SAFE_IDENT.match(name))


def quote_identifier(name: str) -> str:
    """Safely quote a ClickHouse identifier with backticks.

    Raises ValueError if the name contains unsafe characters.
    """
    if not name or not validate_identifier(name):
        raise ValueError(f"Invalid identifier: {name!r}")
    return f"`{name}`"


def escape_string(value: str) -> str:
    """Escape a string value for use in single-quoted SQL literals."""
    return value.replace("\\", "\\\\").replace("'", "\\'")


def quote_scope(database: str | None, table: str | None) -> str:
    """Build a safe scope expression like `db`.`table` or `db`.*."""
    if not database or database == "*":
        return "*.*"
    db = quote_identifier(database)
    if not table or table == "*":
        return f"{db}.*"
    return f"{db}.{quote_identifier(table)}"


# ── Privilege allow-list ────────────────────────────────

ALLOWED_PRIVILEGES = frozenset({
    "SELECT", "INSERT", "ALTER", "CREATE", "DROP",
    "SHOW", "SHOW DATABASES", "SHOW TABLES", "SHOW COLUMNS",
    "CREATE TABLE", "CREATE VIEW", "CREATE DICTIONARY",
    "CREATE TEMPORARY TABLE", "CREATE FUNCTION",
    "ALTER TABLE", "ALTER VIEW",
    "TRUNCATE", "OPTIMIZE", "KILL QUERY",
    "dictGet", "INTROSPECTION",
    "SYSTEM", "SOURCES", "CLUSTER",
})


def validate_privilege(priv: str) -> bool:
    return priv.upper() in {p.upper() for p in ALLOWED_PRIVILEGES}


# ── Guardrail: broad privilege warning ──────────────────

BROAD_PRIVILEGES = frozenset({
    "ALL", "ALL PRIVILEGES", "GRANT OPTION",
    "CREATE", "DROP", "ALTER", "SYSTEM",
})


def is_broad_privilege(priv: str) -> bool:
    return priv.upper() in {p.upper() for p in BROAD_PRIVILEGES}


# ── Validate quota intervals ───────────────────────────

VALID_INTERVALS = frozenset({
    "1 second", "1 minute", "5 minutes", "15 minutes",
    "1 hour", "1 day", "1 week", "1 month", "1 quarter", "1 year",
})


def validate_interval(interval: str) -> bool:
    return interval.lower() in {v.lower() for v in VALID_INTERVALS}
