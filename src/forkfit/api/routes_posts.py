from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from forkfit.api.deps import current_user, get_post_store
from forkfit.api.schemas import CreatePostRequest, PostResponse
from forkfit.auth.models import CurrentUser
from forkfit.stores import PostgresPostStore, PostRecord

router = APIRouter(prefix="/posts", tags=["posts"])


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
) -> PostResponse:
    post = store.create_post(
        user_id=user.id,
        author=user.display_name,
        request=request,
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
