from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Cluster
from ..schemas import DatabaseOut, TableOut, ColumnOut
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


@router.get("/{cluster_id}/databases", response_model=List[DatabaseOut])
async def list_databases(
    cluster_id: int,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    client = _get_client(cluster)
    try:
        databases = await client.get_databases()
        return [DatabaseOut(name=d) for d in databases]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ClickHouse error: {str(e)}")


@router.get("/{cluster_id}/tables", response_model=List[TableOut])
async def list_tables(
    cluster_id: int,
    db_name: str = Query(..., alias="db"),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    client = _get_client(cluster)
    try:
        tables = await client.get_tables(db_name)
        return [TableOut(**t) for t in tables]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ClickHouse error: {str(e)}")


@router.get("/{cluster_id}/columns", response_model=List[ColumnOut])
async def list_columns(
    cluster_id: int,
    db_name: str = Query(..., alias="db"),
    table: str = Query(...),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    client = _get_client(cluster)
    try:
        columns = await client.get_columns(db_name, table)
        return [ColumnOut(**c) for c in columns]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ClickHouse error: {str(e)}")
