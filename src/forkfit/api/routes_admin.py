from __future__ import annotations

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
    return AdminStats(
        user_count=user_store.get_user_count(),
        post_count=post_total,
        active_runs=run_store.count_global_active_runs(),
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
