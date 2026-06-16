from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from forkfit.api.deps import current_user, get_comment_store, get_post_store, get_user_store, optional_current_user
from forkfit.auth.models import CurrentUser

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me/extracted-preferences")
def get_my_extracted_preferences(
    user: CurrentUser = Depends(current_user),
) -> dict:
    store = get_user_store()
    prefs = store.get_extracted_preferences(user.id)
    return {"preferences": prefs}


class ExtractPreferencesRequest(BaseModel):
    locale: str = "en"


@router.post("/me/extract-preferences")
def extract_my_preferences(
    body: ExtractPreferencesRequest | None = None,
    user: CurrentUser = Depends(current_user),
) -> dict:
    locale = (body.locale if body else "en")
    from forkfit.agents import UserPreferenceExtractor
    from forkfit.llm import BailianLLMClient
    from forkfit.tools.db_query import DBQueryTool
    from forkfit.config import get_settings

    settings = get_settings()
    llm = BailianLLMClient()
    post_store = get_post_store()
    db_query_tool = DBQueryTool(post_store)
    extractor = UserPreferenceExtractor(llm, db_query_tool=db_query_tool)

    result = extractor.run(user.id, locale=locale)

    # Save to database
    user_store = get_user_store()
    user_store.save_extracted_preferences(user.id, result)

    return {"preferences": result}


@router.get("/me/profile")
def get_my_profile(
    user: CurrentUser = Depends(current_user),
) -> dict:
    store = get_user_store()
    profile = store.get_profile(user.id)
    return {"profile": profile}


@router.post("/me/profile")
def save_my_profile(
    body: dict,
    user: CurrentUser = Depends(current_user),
) -> dict:
    store = get_user_store()
    store.save_profile(user.id, body)
    return {"ok": True}


@router.put("/me")
def update_me(
    body: dict,
    user: CurrentUser = Depends(current_user),
) -> dict:
    store = get_user_store()
    updates = {}
    if "display_name" in body:
        updates["display_name"] = body["display_name"]
    if "avatar_url" in body:
        updates["avatar_url"] = body["avatar_url"]
    if "bio" in body:
        updates["bio"] = body["bio"]
    if "location" in body:
        updates["location"] = body["location"]
    if updates:
        updated = store.update_user(user.id, **updates)
        if updated:
            return {
                "id": updated.id,
                "username": updated.username,
                "display_name": updated.display_name,
                "avatar_url": updated.avatar_url,
                "bio": updated.bio,
                "location": updated.location,
            }
    return {"ok": True}


@router.get("/{user_id}")
def get_user_profile(
    user_id: str,
    user: CurrentUser | None = Depends(optional_current_user),
) -> dict:
    store = get_user_store()
    user = store.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    post_store = get_post_store()
    can_view_all = bool(user and (user.id == user_id or user.role == "admin"))
    _, post_count = post_store.list_posts_by_user(
        user_id,
        limit=1,
        offset=0,
        public_only=not can_view_all,
    )
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "bio": user.bio,
        "location": user.location,
        "post_count": post_count,
        "created_at": user.created_at.isoformat(),
    }


@router.get("/{user_id}/posts")
def get_user_posts(
    user_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: CurrentUser | None = Depends(optional_current_user),
) -> dict:
    user_store = get_user_store()
    profile_user = user_store.get_user_by_id(user_id)
    if not profile_user:
        raise HTTPException(status_code=404, detail="User not found")

    post_store = get_post_store()
    can_view_all = bool(user and (user.id == user_id or user.role == "admin"))
    posts, total = post_store.list_posts_by_user(
        user_id,
        limit=limit,
        offset=offset,
        public_only=not can_view_all,
    )

    interactions = {}
    if user:
        interactions = post_store.get_user_interactions(user.id, [p.id for p in posts])

    return {
        "posts": [
            {
                "id": p.id,
                "user_id": p.user_id,
                "author": p.author,
                "title": p.title,
                "theme": p.theme,
                "location": p.location,
                "image_urls": p.image_urls,
                "description": p.description,
                "recipe": {
                    "id": p.recipe.id,
                    "day": p.recipe.day,
                    "name": p.recipe.name,
                    "ingredients": p.recipe.ingredients,
                    "equipment": p.recipe.equipment,
                    "cook_time_minutes": p.recipe.cook_time_minutes,
                    "estimated_cost": p.recipe.estimated_cost,
                    "tags": p.recipe.tags,
                    "notes": p.recipe.notes,
                    "steps": p.recipe.steps,
                },
                "saves": p.saves,
                "likes": p.likes,
                "forks": p.forks,
                "status": p.status,
                "source_name": p.source_name,
                "source_url": p.source_url,
                "created_at": p.created_at.isoformat(),
                "liked": interactions.get(p.id, (False, False))[0],
                "saved": interactions.get(p.id, (False, False))[1],
            }
            for p in posts
        ],
        "total": total,
    }


@router.get("/me/comments")
def list_my_comments(
    limit: int = 50,
    offset: int = 0,
    user: CurrentUser = Depends(current_user),
) -> dict:
    store = get_comment_store()
    comments, total = store.list_comments_by_user(user.id, limit=limit, offset=offset)
    return {
        "comments": [
            {
                "id": c.id,
                "post_id": c.post_id,
                "content": c.content,
                "created_at": c.created_at.isoformat(),
            }
            for c in comments
        ],
        "total": total,
    }


# ── Follow / Unfollow ──


@router.post("/{user_id}/follow")
def follow_user(
    user_id: str,
    user: CurrentUser = Depends(current_user),
) -> dict:
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="不能关注自己")
    store = get_user_store()
    if not store.get_user_by_id(user_id):
        raise HTTPException(status_code=404, detail="用户不存在")
    store.follow(user.id, user_id)
    return {"following": True}


@router.delete("/{user_id}/follow")
def unfollow_user(
    user_id: str,
    user: CurrentUser = Depends(current_user),
) -> dict:
    store = get_user_store()
    store.unfollow(user.id, user_id)
    return {"following": False}


@router.get("/{user_id}/followers")
def list_followers(
    user_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict:
    store = get_user_store()
    users, total = store.list_followers(user_id, limit=limit, offset=offset)
    return {
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "display_name": u.display_name,
                "avatar_url": u.avatar_url,
            }
            for u in users
        ],
        "total": total,
    }


@router.get("/{user_id}/following")
def list_following(
    user_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict:
    store = get_user_store()
    users, total = store.list_following(user_id, limit=limit, offset=offset)
    return {
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "display_name": u.display_name,
                "avatar_url": u.avatar_url,
            }
            for u in users
        ],
        "total": total,
    }


@router.get("/me/follow-stats")
def get_my_follow_stats(
    user: CurrentUser = Depends(current_user),
) -> dict:
    store = get_user_store()
    follower_count = store.count_followers(user.id)
    following_count = store.count_following(user.id)
    return {"followers": follower_count, "following": following_count}
