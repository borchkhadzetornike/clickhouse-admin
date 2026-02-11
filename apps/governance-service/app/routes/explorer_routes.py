from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Cluster
from ..schemas import (
    DatabaseOut,
    TableOut,
    ColumnOut,
    TableDetail,
    ColumnRich,
    TableMetadata,
    TableSample,
    SampleColumn,
)
from ..auth import get_current_user, CurrentUser
from ..clickhouse_client import ClickHouseClient

router = APIRouter(prefix="/clusters", tags=["explorer"])


def _get_client(cluster: Cluster) -> ClickHouseClient:
    return ClickHouseClient(
        host=cluster.host,
        port=cluster.port,
        protocol=cluster.protocol,
        username=cluster.username,
        password_encrypted=cluster.password_encrypted,
        database=cluster.database,
    )


def _get_active_cluster(db: Session, cluster_id: int) -> Cluster:
    cluster = (
        db.query(Cluster)
        .filter(Cluster.id == cluster_id, Cluster.is_deleted == False)
        .first()
    )
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    return cluster


# ── Databases ────────────────────────────────────────────

@router.get("/{cluster_id}/databases", response_model=List[DatabaseOut])
async def list_databases(
    cluster_id: int,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cluster = _get_active_cluster(db, cluster_id)
    client = _get_client(cluster)
    try:
        databases = await client.get_databases_with_counts()
        return [DatabaseOut(**d) for d in databases]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ClickHouse error: {str(e)}")


# ── Tables ───────────────────────────────────────────────

@router.get("/{cluster_id}/tables", response_model=List[TableOut])
async def list_tables(
    cluster_id: int,
    db_name: str = Query(..., alias="db"),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cluster = _get_active_cluster(db, cluster_id)
    client = _get_client(cluster)
    try:
        tables = await client.get_tables_with_metadata(db_name)
        return [TableOut(**t) for t in tables]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ClickHouse error: {str(e)}")


# ── Columns (basic — backward compat) ───────────────────

@router.get("/{cluster_id}/columns", response_model=List[ColumnOut])
async def list_columns(
    cluster_id: int,
    db_name: str = Query(..., alias="db"),
    table: str = Query(...),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cluster = _get_active_cluster(db, cluster_id)
    client = _get_client(cluster)
    try:
        columns = await client.get_columns(db_name, table)
        return [ColumnOut(**c) for c in columns]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ClickHouse error: {str(e)}")


# ── Table detail (rich inspector data) ──────────────────

@router.get("/{cluster_id}/table-detail", response_model=TableDetail)
async def get_table_detail(
    cluster_id: int,
    db_name: str = Query(..., alias="db"),
    table: str = Query(...),
    include_sample: bool = Query(False, alias="sample"),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cluster = _get_active_cluster(db, cluster_id)
    client = _get_client(cluster)

    try:
        columns = await client.get_columns_rich(db_name, table)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ClickHouse error loading columns: {str(e)}")

    # Fetch metadata and DDL concurrently-ish (sequential but fast)
    metadata = {}
    ddl = ""
    sample = None

    try:
        metadata = await client.get_table_metadata(db_name, table)
    except Exception:
        pass

    try:
        ddl = await client.get_table_ddl(db_name, table)
    except Exception:
        pass

    if include_sample:
        try:
            raw_sample = await client.get_table_sample(db_name, table, limit=20)
            sample = TableSample(
                columns=[SampleColumn(name=c["name"], type=c["type"]) for c in raw_sample.get("columns", [])],
                rows=raw_sample.get("rows", []),
                rows_read=raw_sample.get("rows_read", 0),
                elapsed_ms=raw_sample.get("elapsed_ms", 0),
                error=raw_sample.get("error"),
            )
        except Exception:
            pass

    return TableDetail(
        database=db_name,
        table=table,
        columns=[ColumnRich(**c) for c in columns],
        metadata=TableMetadata(**metadata) if metadata else TableMetadata(),
        ddl=ddl,
        sample=sample,
    )
