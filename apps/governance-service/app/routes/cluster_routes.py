import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Cluster, AuditEvent
from ..schemas import ClusterCreate, ClusterOut, TestConnectionResponse
from ..auth import get_current_user, require_role, CurrentUser
from ..encryption import encrypt
from ..clickhouse_client import ClickHouseClient

router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.get("", response_model=List[ClusterOut])
def list_clusters(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(Cluster).order_by(Cluster.id).all()


@router.post("", response_model=ClusterOut, status_code=201)
def create_cluster(
    req: ClusterCreate,
    user: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    existing = db.query(Cluster).filter(Cluster.name == req.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Cluster name already exists")
    cluster = Cluster(
        name=req.name,
        host=req.host,
        port=req.port,
        protocol=req.protocol,
        username=req.username,
        password_encrypted=encrypt(req.password),
        database=req.database,
        created_by=user.id,
    )
    db.add(cluster)
    db.flush()
    db.add(
        AuditEvent(
            actor_user_id=user.id,
            action="cluster_created",
            entity_type="cluster",
            entity_id=cluster.id,
            metadata_json=json.dumps({"name": req.name, "host": req.host}),
        )
    )
    db.commit()
    db.refresh(cluster)
    return cluster


@router.post("/{cluster_id}/test-connection", response_model=TestConnectionResponse)
async def test_connection(
    cluster_id: int,
    user: CurrentUser = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    client = ClickHouseClient(
        host=cluster.host,
        port=cluster.port,
        protocol=cluster.protocol,
        username=cluster.username,
        password_encrypted=cluster.password_encrypted,
        database=cluster.database,
    )
    success, message = await client.test_connection()
    return TestConnectionResponse(success=success, message=message)
