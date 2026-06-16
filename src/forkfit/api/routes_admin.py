from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from forkfit.api.deps import get_post_store, get_run_store, get_user_store, require_admin
from forkfit.auth.models import CurrentUser
from forkfit.api.health import HealthReport, build_health_report
from forkfit.api.schemas import PostStatus
from forkfit.db.models import AdminAuditLogRow
from forkfit.db.session import make_session_factory
from forkfit.config import get_settings

router = APIRouter(prefix="/admin", tags=["admin"])


# --- Response models ---

class AdminStats(BaseModel):
    user_count: int
    post_count: int
    published_posts: int
    hidden_posts: int
    draft_posts: int
    active_runs: int
    total_runs: int
    ai_succeeded_runs: int
    ai_failed_runs: int
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
    status: PostStatus
    source_name: str
    source_url: str
    quality: str
    has_image: bool
    has_steps: bool
    created_at: str


class AdminRunInfo(BaseModel):
    id: str
    user_id: str
    status: str
    created_at: str


class AdminRunFeedbackInfo(BaseModel):
    id: int
    run_id: str
    user_id: str
    rating: str
    reason: str
    created_at: str


class UpdateUserRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    avatar_url: str | None = Field(default=None, max_length=500)
    role: Literal["user", "admin"] | None = None


class BatchDeleteRequest(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=100)
    confirm: bool = False


class UpdatePostStatusRequest(BaseModel):
    status: PostStatus


# --- Endpoints ---

@router.get("/stats", response_model=AdminStats)
def admin_stats(_admin: CurrentUser = Depends(require_admin)) -> AdminStats:
    user_store = get_user_store()
    post_store = get_post_store()
    run_store = get_run_store()
    _, post_total = post_store.list_admin_posts(limit=1, offset=0, status="all", quality="all")

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_new_posts = post_store.count_posts_since(today_start)
    today_runs = run_store.count_runs_since(today_start)
    total_runs = run_store.count_all_runs()
    count_runs_by_status = getattr(run_store, "count_runs_by_status", None)
    ai_succeeded_runs = count_runs_by_status("succeeded") if count_runs_by_status else 0
    ai_failed_runs = count_runs_by_status("failed") if count_runs_by_status else 0

    return AdminStats(
        user_count=user_store.get_user_count(),
        post_count=post_total,
        published_posts=post_store.count_posts_by_status("published"),
        hidden_posts=post_store.count_posts_by_status("hidden"),
        draft_posts=post_store.count_posts_by_status("draft"),
        active_runs=run_store.count_global_active_runs(),
        total_runs=total_runs,
        ai_succeeded_runs=ai_succeeded_runs,
        ai_failed_runs=ai_failed_runs,
        today_new_posts=today_new_posts,
        today_runs=today_runs,
    )


@router.get("/users")
def admin_list_users(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    q: str = Query(default="", max_length=120),
    _admin: CurrentUser = Depends(require_admin),
) -> dict:
    store = get_user_store()
    users, total = store.list_users(limit=limit, offset=offset, search=q)
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
    if user_id == _admin.id and body.role and body.role != "admin":
        raise HTTPException(status_code=400, detail="You cannot remove your own admin role")

    store = get_user_store()
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    user = store.update_user(user_id, **fields)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user.id, "username": user.username, "display_name": user.display_name,
            "avatar_url": user.avatar_url, "role": user.role,
            "created_at": user.created_at.isoformat()}


@router.delete("/users/{user_id}")
def admin_delete_user(user_id: str, _admin: CurrentUser = Depends(require_admin)) -> dict:
    if user_id == _admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    store = get_user_store()
    if not store.delete_user(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    _audit(_admin.id, "delete_user", "user", user_id, {})
    return {"detail": "User deleted"}


@router.post("/users/batch-delete")
def admin_batch_delete_users(body: BatchDeleteRequest, _admin: CurrentUser = Depends(require_admin)) -> dict:
    if not body.confirm:
        raise HTTPException(status_code=400, detail="Confirmation is required")
    if _admin.id in body.ids:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    store = get_user_store()
    deleted = 0
    for uid in body.ids:
        if store.delete_user(uid):
            deleted += 1
            _audit(_admin.id, "batch_delete_user", "user", uid, {})
    return {"deleted": deleted}


@router.get("/posts")
def admin_list_posts(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    q: str = Query(default="", max_length=160),
    status: str = Query(default="all", max_length=20),
    tag: str = Query(default="", max_length=100),
    quality: str = Query(default="", max_length=20),
    _admin: CurrentUser = Depends(require_admin),
) -> dict:
    store = get_post_store()
    posts, total = store.list_admin_posts(
        limit=limit,
        offset=offset,
        search=q,
        tag=tag,
        status=status,
        quality=quality,
    )
    return {
        "posts": [
            {"id": p.id, "title": p.title, "author": p.author,
             "user_id": p.user_id, "status": p.status,
             "source_name": p.source_name, "source_url": p.source_url,
             "quality": p.quality, "has_image": p.has_image,
             "has_steps": p.has_steps, "created_at": p.created_at.isoformat()}
            for p in posts
        ],
        "total": total,
    }


@router.patch("/posts/{post_id}/status", response_model=AdminPostInfo)
def admin_update_post_status(
    post_id: str,
    body: UpdatePostStatusRequest,
    _admin: CurrentUser = Depends(require_admin),
) -> AdminPostInfo:
    store = get_post_store()
    try:
        post = store.update_post_status(post_id, body.status)
    except KeyError:
        raise HTTPException(status_code=404, detail="Post not found") from None
    _audit(_admin.id, "update_post_status", "post", post_id, {"status": body.status})
    return AdminPostInfo(
        id=post.id,
        title=post.title,
        author=post.author,
        user_id=post.user_id,
        status=post.status,
        source_name=post.source_name,
        source_url=post.source_url,
        quality=post.quality,
        has_image=post.has_image,
        has_steps=post.has_steps,
        created_at=post.created_at.isoformat(),
    )


@router.delete("/posts/{post_id}")
def admin_delete_post(post_id: str, _admin: CurrentUser = Depends(require_admin)) -> dict:
    store = get_post_store()
    try:
        store.delete_post(post_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Post not found") from None
    _audit(_admin.id, "delete_post", "post", post_id, {})
    return {"detail": "Post deleted"}


@router.post("/posts/batch-delete")
def admin_batch_delete_posts(body: BatchDeleteRequest, _admin: CurrentUser = Depends(require_admin)) -> dict:
    if not body.confirm:
        raise HTTPException(status_code=400, detail="Confirmation is required")
    store = get_post_store()
    deleted = 0
    for pid in body.ids:
        try:
            store.delete_post(pid)
            deleted += 1
            _audit(_admin.id, "batch_delete_post", "post", pid, {})
        except KeyError:
            pass
    return {"deleted": deleted}


@router.get("/runs")
def admin_list_runs(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _admin: CurrentUser = Depends(require_admin),
) -> dict:
    store = get_run_store()
    runs = store.list_all_runs(limit=limit, offset=offset)
    return {"runs": [
        {"id": r.id, "user_id": r.user_id, "status": r.status, "created_at": r.created_at.isoformat()}
        for r in runs
    ], "total": store.count_all_runs()}


@router.get("/runs/failed")
def admin_failed_runs(
    limit: int = Query(default=20, ge=1, le=50),
    _admin: CurrentUser = Depends(require_admin),
) -> dict:
    store = get_run_store()
    list_failed_runs = getattr(store, "list_failed_runs", None)
    runs = list_failed_runs(limit=limit) if list_failed_runs is not None else []
    return {"runs": [
        {
            "id": r.id,
            "user_id": r.user_id,
            "status": r.status,
            "created_at": r.created_at.isoformat(),
            "error": r.error.message if r.error else "",
        }
        for r in runs
    ]}


@router.get("/runs/feedback")
def admin_run_feedback(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _admin: CurrentUser = Depends(require_admin),
) -> dict:
    store = get_run_store()
    list_feedback = getattr(store, "list_feedback", None)
    feedback, total = list_feedback(limit=limit, offset=offset) if list_feedback else ([], 0)
    return {
        "feedback": [
            {
                "id": item.id,
                "run_id": item.run_id,
                "user_id": item.user_id,
                "rating": item.rating,
                "reason": item.reason,
                "created_at": item.created_at.isoformat(),
            }
            for item in feedback
        ],
        "total": total,
    }


# --- Health check ---

@router.get("/health", response_model=HealthReport)
def admin_health(_admin: CurrentUser = Depends(require_admin)) -> HealthReport:
    return build_health_report()


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
    activities: list[tuple[datetime, ActivityItem]] = []

    # Recent posts
    post_store = get_post_store()
    posts, _ = post_store.list_posts(limit=5, offset=0)
    for p in posts:
        activities.append((
            p.created_at,
            ActivityItem(
                type="post",
                text=f"用户「{p.author}」发布了新菜谱「{p.title}」",
                time=_relative_time(p.created_at),
                color="green",
            ),
        ))

    # Recent runs
    run_store = get_run_store()
    runs = run_store.list_all_runs(limit=5)
    for r in runs:
        status_text = {"succeeded": "完成", "failed": "失败", "running": "正在运行"}.get(r.status, r.status)
        activities.append((
            r.created_at,
            ActivityItem(
                type="run",
                text=f"AI 定制任务 {status_text}：{r.id[:16]}...",
                time=_relative_time(r.created_at),
                color="blue" if r.status == "succeeded" else "orange" if r.status == "running" else "red",
            ),
        ))

    activities.sort(
        key=lambda item: (
            item[0].replace(tzinfo=timezone.utc)
            if item[0].tzinfo is None
            else item[0]
        ),
        reverse=True,
    )
    return AdminActivityResponse(activities=[item for _, item in activities[:10]])


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


def _audit(admin_user_id: str, action: str, target_type: str, target_id: str, payload: dict) -> None:
    try:
        factory = make_session_factory(get_settings().database_url)
        with factory() as session:
            session.add(AdminAuditLogRow(
                admin_user_id=admin_user_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                payload=payload,
            ))
            session.commit()
    except Exception:
        pass
