from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response

import logging

from forkfit.api.deps import current_user, get_comment_store, get_post_extraction_llm, get_post_store, optional_current_user
from forkfit.api.schemas import CreatePostRequest, PostResponse, UpdatePostRequest
from forkfit.auth.models import CurrentUser
from forkfit.llm import LLMClient
from forkfit.post_extraction import extract_post_details
from forkfit.stores import PostgresPostStore, PostRecord
from forkfit.stores.posts import is_public_record

router = APIRouter(prefix="/posts", tags=["posts"])
logger = logging.getLogger(__name__)


@router.get("", response_model=list[PostResponse])
async def list_posts(
    response: Response,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    q: str = Query(default="", max_length=200),
    tag: str = Query(default="", max_length=100),
    category: str = Query(default="", max_length=100),
    status: str = Query(default="", max_length=20),
    user: CurrentUser | None = Depends(optional_current_user),
    store: PostgresPostStore = Depends(get_post_store),
) -> list[PostResponse]:
    effective_status = status or "published"
    if status and (user is None or user.role != "admin"):
        raise HTTPException(status_code=403, detail="Only admins can filter post status.")
    posts, total = store.list_posts(
        limit=limit,
        offset=offset,
        search=q,
        tag=tag,
        category=category,
        status=effective_status,
        quality="complete",
        recommended=not q and not tag,
    )
    response.headers["X-Total-Count"] = str(total)
    interactions = _get_interactions(store, user, [p.id for p in posts])
    comment_store = get_comment_store()
    counts = comment_store.get_comment_counts([p.id for p in posts])
    return [_post_response(post, interactions.get(post.id), counts.get(post.id, 0)) for post in posts]


@router.get("/tags")
async def list_tags(store: PostgresPostStore = Depends(get_post_store)) -> list[str]:
    return store.list_tags()


@router.post("", response_model=PostResponse)
async def create_post(
    request: CreatePostRequest,
    user: CurrentUser = Depends(current_user),
    store: PostgresPostStore = Depends(get_post_store),
    llm: LLMClient = Depends(get_post_extraction_llm),
) -> PostResponse:
    enriched_request = request
    try:
        enriched_request = extract_post_details(request, llm=llm)
    except Exception as exc:
        logger.warning("Post detail extraction failed: %s", exc)

    post = store.create_post(
        user_id=user.id,
        author=user.display_name,
        request=enriched_request,
    )
    return _post_response(post)


@router.get("/liked/me")
async def list_liked_posts(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: CurrentUser = Depends(current_user),
    store: PostgresPostStore = Depends(get_post_store),
) -> list[PostResponse]:
    posts, _ = store.list_liked_posts(
        user.id, limit=limit, offset=offset, public_only=True
    )
    return [_post_response(post, (True, False)) for post in posts]


@router.get("/saved/me")
async def list_saved_posts(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: CurrentUser = Depends(current_user),
    store: PostgresPostStore = Depends(get_post_store),
) -> list[PostResponse]:
    posts, _ = store.list_saved_posts(
        user.id, limit=limit, offset=offset, public_only=True
    )
    return [_post_response(post, (False, True)) for post in posts]


@router.get("/{post_id}", response_model=PostResponse)
async def get_post(
    post_id: str,
    user: CurrentUser | None = Depends(optional_current_user),
    store: PostgresPostStore = Depends(get_post_store),
) -> PostResponse:
    post = store.get_post(post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found.")
    if not is_public_record(post) and (user is None or (user.id != post.user_id and user.role != "admin")):
        raise HTTPException(status_code=404, detail="Post not found.")
    interactions = _get_interactions(store, user, [post.id])
    comment_store = get_comment_store()
    count = comment_store.get_comment_count(post.id)
    return _post_response(post, interactions.get(post.id), count)


@router.patch("/{post_id}", response_model=PostResponse)
async def update_post(
    post_id: str,
    request: UpdatePostRequest,
    user: CurrentUser = Depends(current_user),
    store: PostgresPostStore = Depends(get_post_store),
) -> PostResponse:
    post = _require_owned_post(post_id, user=user, store=store)
    updated = store.update_post(post_id=post.id, request=request)
    return _post_response(updated)


@router.delete("/{post_id}", status_code=204)
async def delete_post(
    post_id: str,
    user: CurrentUser = Depends(current_user),
    store: PostgresPostStore = Depends(get_post_store),
) -> None:
    _require_owned_post(post_id, user=user, store=store)
    store.delete_post(post_id)


@router.post("/{post_id}/extract", response_model=PostResponse)
async def extract_post(
    post_id: str,
    user: CurrentUser = Depends(current_user),
    store: PostgresPostStore = Depends(get_post_store),
    llm: LLMClient = Depends(get_post_extraction_llm),
) -> PostResponse:
    post = _require_owned_post(post_id, user=user, store=store)
    request = UpdatePostRequest(
        title=post.title,
        theme=post.theme,
        location=post.location,
        image_urls=post.image_urls,
        description=post.description,
        recipe=post.recipe,
    )
    try:
        request = extract_post_details(request, llm=llm)
    except Exception as exc:
        logger.warning("Post detail extraction failed: %s", exc)
    updated = store.update_post(post_id=post.id, request=request)
    return _post_response(updated)


def _require_owned_post(
    post_id: str, *, user: CurrentUser, store: PostgresPostStore
) -> PostRecord:
    post = store.get_post(post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found.")
    if post.user_id != user.id:
        raise HTTPException(status_code=403, detail="Post is not editable.")
    return post


def _post_response(post: PostRecord, interaction: tuple[bool, bool] | None = None, comment_count: int = 0) -> PostResponse:
    liked, saved = interaction if interaction else (False, False)
    return PostResponse(
        id=post.id,
        user_id=post.user_id,
        author=post.author,
        title=post.title,
        theme=post.theme,
        location=post.location,
        image_urls=post.image_urls,
        description=post.description,
        recipe=post.recipe,
        status=post.status,
        source_name=post.source_name,
        source_url=post.source_url,
        saves=post.saves,
        likes=post.likes,
        forks=post.forks,
        created_at=post.created_at.isoformat(),
        liked=liked,
        saved=saved,
        comment_count=comment_count,
    )


def _get_interactions(
    store: PostgresPostStore, user: CurrentUser | None, post_ids: list[str]
) -> dict[str, tuple[bool, bool]]:
    if not user or not post_ids:
        return {}
    return store.get_user_interactions(user.id, post_ids)


@router.post("/{post_id}/like")
async def toggle_like(
    post_id: str,
    user: CurrentUser = Depends(current_user),
    store: PostgresPostStore = Depends(get_post_store),
) -> dict:
    try:
        liked, likes, saves = store.toggle_like(user.id, post_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Post not found.")
    return {"liked": liked, "likes": likes, "saves": saves}


@router.post("/{post_id}/save")
async def toggle_save(
    post_id: str,
    user: CurrentUser = Depends(current_user),
    store: PostgresPostStore = Depends(get_post_store),
) -> dict:
    try:
        saved, saves = store.toggle_save(user.id, post_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Post not found.")
    return {"saved": saved, "saves": saves}
