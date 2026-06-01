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


@router.get("/{user_id}")
def get_user_profile(user_id: str) -> dict:
    store = get_user_store()
    user = store.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    post_store = get_post_store()
    _, post_count = post_store.list_posts_by_user(user_id, limit=1, offset=0)
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "post_count": post_count,
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
    posts, total = post_store.list_posts_by_user(user_id, limit=limit, offset=offset)

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
                "forks": p.forks,
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
