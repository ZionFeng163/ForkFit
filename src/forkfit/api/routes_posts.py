from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

import logging

from forkfit.api.deps import current_user, get_post_extraction_llm, get_post_store
from forkfit.api.schemas import CreatePostRequest, PostResponse, UpdatePostRequest
from forkfit.auth.models import CurrentUser
from forkfit.llm import LLMClient
from forkfit.post_extraction import extract_post_details
from forkfit.stores import PostgresPostStore, PostRecord

router = APIRouter(prefix="/posts", tags=["posts"])
logger = logging.getLogger(__name__)


@router.get("", response_model=list[PostResponse])
async def list_posts(
    store: PostgresPostStore = Depends(get_post_store),
) -> list[PostResponse]:
    return [_post_response(post) for post in store.list_posts()]


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


@router.get("/{post_id}", response_model=PostResponse)
async def get_post(
    post_id: str,
    store: PostgresPostStore = Depends(get_post_store),
) -> PostResponse:
    post = store.get_post(post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found.")
    return _post_response(post)


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


def _post_response(post: PostRecord) -> PostResponse:
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
        saves=post.saves,
        forks=post.forks,
        created_at=post.created_at.isoformat(),
    )
