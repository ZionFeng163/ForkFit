from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from forkfit.api.deps import get_post_store, get_run_store, get_user_store, require_admin
from forkfit.auth.models import CurrentUser

router = APIRouter(prefix="/admin", tags=["admin"])


# --- Response models ---

class AdminStats(BaseModel):
    user_count: int
    post_count: int
    active_runs: int
    total_runs: int
    today_new_posts: int
    today_runs: int


class AdminUserInfo(BaseModel):
    id: str
    username: str
    display_name: str
    avatar_url: str | None
    role: str
    created_at: str


class AdminPostInfo(BaseModel):
    id: str
    title: str
    author: str
    user_id: str
    created_at: str


class AdminRunInfo(BaseModel):
    id: str
    user_id: str
    status: str
    created_at: str


class UpdateUserRequest(BaseModel):
    display_name: str | None = None
    avatar_url: str | None = None
    role: str | None = None


class BatchDeleteRequest(BaseModel):
    ids: list[str]


# --- Endpoints ---

@router.get("/stats", response_model=AdminStats)
def admin_stats(_admin: CurrentUser = Depends(require_admin)) -> AdminStats:
    user_store = get_user_store()
    post_store = get_post_store()
    run_store = get_run_store()
    _, post_total = post_store.list_posts(limit=1, offset=0)

    # Today's counts
    from datetime import datetime, timezone, timedelta
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_new_posts = post_store.count_posts_since(today_start) if hasattr(post_store, 'count_posts_since') else 0
    today_runs = run_store.count_runs_since(today_start) if hasattr(run_store, 'count_runs_since') else 0
    total_runs = run_store.count_all_runs() if hasattr(run_store, 'count_all_runs') else 0

    return AdminStats(
        user_count=user_store.get_user_count(),
        post_count=post_total,
        active_runs=run_store.count_global_active_runs(),
        total_runs=total_runs,
        today_new_posts=today_new_posts,
        today_runs=today_runs,
    )


@router.get("/users")
def admin_list_users(
    limit: int = 50,
    offset: int = 0,
    _admin: CurrentUser = Depends(require_admin),
) -> dict:
    store = get_user_store()
    users, total = store.list_users(limit=limit, offset=offset)
    return {
        "users": [
            {"id": u.id, "username": u.username, "display_name": u.display_name,
             "avatar_url": u.avatar_url, "role": u.role, "created_at": u.created_at.isoformat()}
            for u in users
        ],
        "total": total,
    }


@router.get("/users/{user_id}")
def admin_get_user(user_id: str, _admin: CurrentUser = Depends(require_admin)) -> dict:
    store = get_user_store()
    user = store.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user.id, "username": user.username, "display_name": user.display_name,
            "avatar_url": user.avatar_url, "role": user.role, "created_at": user.created_at.isoformat()}


@router.patch("/users/{user_id}")
def admin_update_user(
    user_id: str,
    body: UpdateUserRequest,
    _admin: CurrentUser = Depends(require_admin),
) -> dict:
    store = get_user_store()
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    user = store.update_user(user_id, **fields)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user.id, "username": user.username, "display_name": user.display_name,
            "avatar_url": user.avatar_url, "role": user.role}


@router.delete("/users/{user_id}")
def admin_delete_user(user_id: str, _admin: CurrentUser = Depends(require_admin)) -> dict:
    store = get_user_store()
    if not store.delete_user(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return {"detail": "User deleted"}


@router.post("/users/batch-delete")
def admin_batch_delete_users(body: BatchDeleteRequest, _admin: CurrentUser = Depends(require_admin)) -> dict:
    store = get_user_store()
    deleted = 0
    for uid in body.ids:
        if store.delete_user(uid):
            deleted += 1
    return {"deleted": deleted}


@router.get("/posts")
def admin_list_posts(
    limit: int = 50,
    offset: int = 0,
    _admin: CurrentUser = Depends(require_admin),
) -> dict:
    store = get_post_store()
    posts, total = store.list_posts(limit=limit, offset=offset)
    return {
        "posts": [
            {"id": p.id, "title": p.title, "author": p.author,
             "user_id": p.user_id, "created_at": p.created_at.isoformat()}
            for p in posts
        ],
        "total": total,
    }


@router.delete("/posts/{post_id}")
def admin_delete_post(post_id: str, _admin: CurrentUser = Depends(require_admin)) -> dict:
    store = get_post_store()
    store.delete_post(post_id)
    return {"detail": "Post deleted"}


@router.post("/posts/batch-delete")
def admin_batch_delete_posts(body: BatchDeleteRequest, _admin: CurrentUser = Depends(require_admin)) -> dict:
    store = get_post_store()
    deleted = 0
    for pid in body.ids:
        try:
            store.delete_post(pid)
            deleted += 1
        except Exception:
            pass
    return {"deleted": deleted}


@router.get("/runs")
def admin_list_runs(
    limit: int = 50,
    offset: int = 0,
    _admin: CurrentUser = Depends(require_admin),
) -> dict:
    store = get_run_store()
    runs = store.list_all_runs(limit=limit, offset=offset) if hasattr(store, 'list_all_runs') else []
    return {"runs": [
        {"id": r.id, "user_id": r.user_id, "status": r.status, "created_at": r.created_at.isoformat()}
        for r in runs
    ], "total": len(runs)}


# --- Health check ---

class ServiceHealth(BaseModel):
    name: str
    status: str  # "ok" | "warn" | "error"
    latency_ms: float
    details: str = ""


class AdminHealthResponse(BaseModel):
    services: list[ServiceHealth]


@router.get("/health", response_model=AdminHealthResponse)
def admin_health(_admin: CurrentUser = Depends(require_admin)) -> AdminHealthResponse:
    services = []

    # PostgreSQL
    pg_ok, pg_latency, pg_detail = _check_postgres()
    services.append(ServiceHealth(name="PostgreSQL", status="ok" if pg_ok else "error", latency_ms=pg_latency, details=pg_detail))

    # Redis
    redis_ok, redis_latency, redis_detail = _check_redis()
    services.append(ServiceHealth(name="Redis", status="ok" if redis_ok else "error", latency_ms=redis_latency, details=redis_detail))

    # Kafka
    kafka_ok, kafka_latency, kafka_detail = _check_kafka()
    services.append(ServiceHealth(name="Kafka", status="ok" if kafka_ok else "warn", latency_ms=kafka_latency, details=kafka_detail))

    # Bailian API
    llm_ok, llm_latency, llm_detail = _check_bailian()
    services.append(ServiceHealth(name="Bailian API", status="ok" if llm_ok else "warn", latency_ms=llm_latency, details=llm_detail))

    return AdminHealthResponse(services=services)


def _check_postgres() -> tuple[bool, float, str]:
    try:
        from forkfit.config import get_settings
        from forkfit.db.session import make_session_factory
        settings = get_settings()
        factory = make_session_factory(settings.database_url)
        started = time.perf_counter()
        with factory() as session:
            session.execute(__import__('sqlalchemy').text("SELECT 1"))
        latency = round((time.perf_counter() - started) * 1000, 1)
        return True, latency, "Connected"
    except Exception as e:
        return False, 0, str(e)[:100]


def _check_redis() -> tuple[bool, float, str]:
    try:
        from forkfit.config import get_settings
        import redis as redis_lib
        settings = get_settings()
        client = redis_lib.from_url(settings.redis_url, socket_timeout=3)
        started = time.perf_counter()
        client.ping()
        latency = round((time.perf_counter() - started) * 1000, 1)
        info = client.info("memory")
        used_mb = round(info.get("used_memory", 0) / 1024 / 1024, 1)
        return True, latency, f"{used_mb}MB used"
    except Exception as e:
        return False, 0, str(e)[:100]


def _check_kafka() -> tuple[bool, float, str]:
    try:
        from forkfit.config import get_settings
        from forkfit.kafka_utils import get_producer
        settings = get_settings()
        started = time.perf_counter()
        producer = get_producer(bootstrap_servers=settings.kafka_bootstrap_servers)
        producer.flush(timeout=3)
        latency = round((time.perf_counter() - started) * 1000, 1)
        return True, latency, "Connected"
    except Exception as e:
        return False, 0, str(e)[:100]


def _check_bailian() -> tuple[bool, float, str]:
    try:
        from forkfit.config import get_settings
        settings = get_settings()
        if not settings.langsmith_api_key and not __import__('os').getenv('BAILIAN_API_KEY'):
            return False, 0, "No API key configured"
        # Just check if the client can be initialized
        from forkfit.llm import BailianLLMClient
        started = time.perf_counter()
        client = BailianLLMClient()
        latency = round((time.perf_counter() - started) * 1000, 1)
        return True, latency, f"Model: {client.model}"
    except Exception as e:
        return False, 0, str(e)[:100]


# --- Activity feed ---

class ActivityItem(BaseModel):
    type: str  # "post" | "run" | "system"
    text: str
    time: str
    color: str  # "green" | "blue" | "orange" | "red"


class AdminActivityResponse(BaseModel):
    activities: list[ActivityItem]


@router.get("/activity", response_model=AdminActivityResponse)
def admin_activity(_admin: CurrentUser = Depends(require_admin)) -> AdminActivityResponse:
    activities = []

    # Recent posts
    post_store = get_post_store()
    posts, _ = post_store.list_posts(limit=5, offset=0)
    for p in posts:
        activities.append(ActivityItem(
            type="post",
            text=f"用户「{p.author}」发布了新菜谱「{p.title}」",
            time=_relative_time(p.created_at),
            color="green",
        ))

    # Recent runs
    run_store = get_run_store()
    runs = run_store.list_all_runs(limit=5) if hasattr(run_store, 'list_all_runs') else []
    for r in runs:
        status_text = {"succeeded": "完成", "failed": "失败", "running": "正在运行"}.get(r.status, r.status)
        activities.append(ActivityItem(
            type="run",
            text=f"AI 定制任务 {status_text}：{r.id[:16]}...",
            time=_relative_time(r.created_at),
            color="blue" if r.status == "succeeded" else "orange" if r.status == "running" else "red",
        ))

    # Sort by time (most recent first) and limit
    # Activities are already sorted by created_at desc from the queries
    return AdminActivityResponse(activities=activities[:10])


def _relative_time(dt) -> str:
    """Convert datetime to relative time string in Chinese."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    diff = now - dt
    seconds = int(diff.total_seconds())
    if seconds < 60:
        return "刚刚"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} 分钟前"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} 小时前"
    days = hours // 24
    if days < 30:
        return f"{days} 天前"
    return dt.strftime("%Y-%m-%d")
