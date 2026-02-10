"""SQL template generation for each ClickHouse RBAC operation.

Every statement is built from validated parameters — never raw SQL.
Each builder returns (forward_sql, compensation_sql | None).
"""

from .safety import (
    quote_identifier,
    escape_string,
    quote_scope,
    validate_identifier,
    validate_privilege,
    validate_interval,
)


class TemplateError(Exception):
    """Raised when params fail validation."""


def _require(params: dict, *keys: str):
    for k in keys:
        if k not in params or params[k] is None or params[k] == "":
            raise TemplateError(f"Missing required parameter: {k}")


# ───────── Users ──────────────────────────────────────────────

def create_user(params: dict) -> tuple[str, str | None]:
    _require(params, "username", "password")
    user = quote_identifier(params["username"])
    pwd = escape_string(params["password"])
    sql = f"CREATE USER {user} IDENTIFIED WITH sha256_password BY '{pwd}'"

    # Optional host restriction
    host_ips = params.get("host_ip") or []
    if host_ips:
        hosts = ", ".join(f"'{escape_string(h)}'" for h in host_ips)
        sql += f" HOST IP {hosts}"

    # Optional default roles
    default_roles = params.get("default_roles") or []
    if default_roles:
        roles_str = ", ".join(quote_identifier(r) for r in default_roles)
        sql += f" DEFAULT ROLE {roles_str}"

    comp = f"DROP USER IF EXISTS {user}"
    return sql, comp


def alter_user_password(params: dict) -> tuple[str, str | None]:
    _require(params, "username", "password")
    user = quote_identifier(params["username"])
    pwd = escape_string(params["password"])
    sql = f"ALTER USER {user} IDENTIFIED WITH sha256_password BY '{pwd}'"
    return sql, None  # Can't reverse a password change


def drop_user(params: dict) -> tuple[str, str | None]:
    _require(params, "username")
    user = quote_identifier(params["username"])
    sql = f"DROP USER IF EXISTS {user}"
    return sql, None  # Can't restore without original password


# ───────── Roles ──────────────────────────────────────────────

def create_role(params: dict) -> tuple[str, str | None]:
    _require(params, "role_name")
    role = quote_identifier(params["role_name"])
    return f"CREATE ROLE {role}", f"DROP ROLE IF EXISTS {role}"


def drop_role(params: dict) -> tuple[str, str | None]:
    _require(params, "role_name")
    role = quote_identifier(params["role_name"])
    return f"DROP ROLE IF EXISTS {role}", None


def grant_role(params: dict) -> tuple[str, str | None]:
    _require(params, "role_name", "target_type", "target_name")
    role = quote_identifier(params["role_name"])
    target = quote_identifier(params["target_name"])
    sql = f"GRANT {role} TO {target}"
    comp = f"REVOKE {role} FROM {target}"
    return sql, comp


def revoke_role(params: dict) -> tuple[str, str | None]:
    _require(params, "role_name", "target_type", "target_name")
    role = quote_identifier(params["role_name"])
    target = quote_identifier(params["target_name"])
    sql = f"REVOKE {role} FROM {target}"
    comp = f"GRANT {role} TO {target}"
    return sql, comp


def set_default_roles(params: dict) -> tuple[str, str | None]:
    _require(params, "username", "roles")
    user = quote_identifier(params["username"])
    roles = params["roles"]
    if isinstance(roles, list) and roles:
        roles_str = ", ".join(quote_identifier(r) for r in roles)
    elif roles == "ALL":
        roles_str = "ALL"
    elif roles == "NONE" or not roles:
        roles_str = "NONE"
    else:
        roles_str = "NONE"
    sql = f"SET DEFAULT ROLE {roles_str} TO {user}"
    return sql, None


# ───────── Privileges ─────────────────────────────────────────

def grant_privilege(params: dict) -> tuple[str, str | None]:
    _require(params, "privilege", "target_type", "target_name")
    priv = params["privilege"].upper()
    if not validate_privilege(priv):
        raise TemplateError(f"Privilege not in allow-list: {priv}")

    scope = quote_scope(params.get("database"), params.get("table"))
    target = quote_identifier(params["target_name"])

    sql = f"GRANT {priv} ON {scope} TO {target}"
    comp = f"REVOKE {priv} ON {scope} FROM {target}"
    return sql, comp


def revoke_privilege(params: dict) -> tuple[str, str | None]:
    _require(params, "privilege", "target_type", "target_name")
    priv = params["privilege"].upper()
    if not validate_privilege(priv):
        raise TemplateError(f"Privilege not in allow-list: {priv}")

    scope = quote_scope(params.get("database"), params.get("table"))
    target = quote_identifier(params["target_name"])

    sql = f"REVOKE {priv} ON {scope} FROM {target}"
    comp = f"GRANT {priv} ON {scope} TO {target}"
    return sql, comp


# ───────── Settings Profiles ──────────────────────────────────

def _settings_clause(settings: dict) -> str:
    parts = []
    for k, v in settings.items():
        if not validate_identifier(k):
            raise TemplateError(f"Invalid setting name: {k!r}")
        # Values can be numeric or string
        if isinstance(v, (int, float)):
            parts.append(f"{k} = {v}")
        else:
            parts.append(f"{k} = '{escape_string(str(v))}'")
    return ", ".join(parts)


def create_settings_profile(params: dict) -> tuple[str, str | None]:
    _require(params, "name", "settings")
    name = quote_identifier(params["name"])
    clause = _settings_clause(params["settings"])
    sql = f"CREATE SETTINGS PROFILE {name} SETTINGS {clause}"
    comp = f"DROP SETTINGS PROFILE IF EXISTS {name}"
    return sql, comp


def alter_settings_profile(params: dict) -> tuple[str, str | None]:
    _require(params, "name", "settings")
    name = quote_identifier(params["name"])
    clause = _settings_clause(params["settings"])
    sql = f"ALTER SETTINGS PROFILE {name} SETTINGS {clause}"
    return sql, None


def drop_settings_profile(params: dict) -> tuple[str, str | None]:
    _require(params, "name")
    name = quote_identifier(params["name"])
    return f"DROP SETTINGS PROFILE IF EXISTS {name}", None


def assign_settings_profile(params: dict) -> tuple[str, str | None]:
    _require(params, "target_name", "profile_name")
    target = quote_identifier(params["target_name"])
    profile = quote_identifier(params["profile_name"])
    sql = f"ALTER USER {target} SETTINGS PROFILE {profile}"
    return sql, None


# ───────── Quotas ─────────────────────────────────────────────

def _quota_clause(intervals: list[dict]) -> str:
    parts = []
    for iv in intervals:
        duration = iv.get("duration", "1 hour")
        if not validate_interval(duration):
            raise TemplateError(f"Invalid quota interval: {duration!r}")
        limits = iv.get("limits", {})
        limit_parts = []
        for k, v in limits.items():
            if not validate_identifier(k):
                raise TemplateError(f"Invalid quota limit name: {k!r}")
            limit_parts.append(f"{k} = {int(v)}")
        parts.append(f"FOR INTERVAL {duration} MAX {', '.join(limit_parts)}")
    return " ".join(parts)


def create_quota(params: dict) -> tuple[str, str | None]:
    _require(params, "name", "intervals")
    name = quote_identifier(params["name"])
    clause = _quota_clause(params["intervals"])
    sql = f"CREATE QUOTA {name} {clause}"
    comp = f"DROP QUOTA IF EXISTS {name}"
    return sql, comp


def alter_quota(params: dict) -> tuple[str, str | None]:
    _require(params, "name", "intervals")
    name = quote_identifier(params["name"])
    clause = _quota_clause(params["intervals"])
    sql = f"ALTER QUOTA {name} {clause}"
    return sql, None


def drop_quota(params: dict) -> tuple[str, str | None]:
    _require(params, "name")
    name = quote_identifier(params["name"])
    return f"DROP QUOTA IF EXISTS {name}", None


def assign_quota(params: dict) -> tuple[str, str | None]:
    _require(params, "target_name", "quota_name")
    target = quote_identifier(params["target_name"])
    quota = quote_identifier(params["quota_name"])
    sql = f"ALTER USER {target} QUOTA {quota}"
    return sql, None


# ───────── Registry ───────────────────────────────────────────

BUILDERS: dict[str, callable] = {
    "create_user": create_user,
    "alter_user_password": alter_user_password,
    "drop_user": drop_user,
    "create_role": create_role,
    "drop_role": drop_role,
    "grant_role": grant_role,
    "revoke_role": revoke_role,
    "set_default_roles": set_default_roles,
    "grant_privilege": grant_privilege,
    "revoke_privilege": revoke_privilege,
    "create_settings_profile": create_settings_profile,
    "alter_settings_profile": alter_settings_profile,
    "drop_settings_profile": drop_settings_profile,
    "assign_settings_profile": assign_settings_profile,
    "create_quota": create_quota,
    "alter_quota": alter_quota,
    "drop_quota": drop_quota,
    "assign_quota": assign_quota,
}


def build_sql(operation_type: str, params: dict) -> tuple[str, str | None]:
    """Build (forward_sql, compensation_sql) for an operation."""
    builder = BUILDERS.get(operation_type)
    if builder is None:
        raise TemplateError(f"Unknown operation type: {operation_type}")
    return builder(params)
