import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routes.cluster_routes import router as cluster_router
from .routes.explorer_routes import router as explorer_router
from .routes.proposal_routes import router as proposal_router
from .routes.audit_routes import router as audit_router
from .routes.snapshot_routes import router as snapshot_router
from .routes.rbac_explorer_routes import router as rbac_explorer_router
from .routes.admin_routes import router as admin_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Governance service starting up — creating tables...")
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Governance Service", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cluster_router)
app.include_router(explorer_router)
app.include_router(proposal_router)
app.include_router(audit_router)
app.include_router(snapshot_router)
app.include_router(rbac_explorer_router)
app.include_router(admin_router)


@app.get("/health")
def health():
    return {"status": "ok"}
