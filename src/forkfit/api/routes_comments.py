from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from forkfit.api.deps import current_user, get_comment_store, optional_current_user
from forkfit.auth.models import CurrentUser
from forkfit.stores.comments import CommentStore

router = APIRouter(prefix="/posts/{post_id}/comments", tags=["comments"])


class CreateCommentRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class CommentResponse(BaseModel):
    id: str
    post_id: str
    user_id: str
    username: str
    display_name: str
    avatar_url: str | None
    content: str
    created_at: str
    can_delete: bool = False


def _comment_response(comment, current_user_id: str | None = None) -> CommentResponse:
    return CommentResponse(
        id=comment.id,
        post_id=comment.post_id,
        user_id=comment.user_id,
        username=comment.username,
        display_name=comment.display_name,
        avatar_url=comment.avatar_url,
        content=comment.content,
        created_at=comment.created_at.isoformat(),
        can_delete=comment.user_id == current_user_id,
    )


@router.get("")
def list_comments(
    post_id: str,
    limit: int = 50,
    offset: int = 0,
    user: CurrentUser | None = Depends(optional_current_user),
    store: CommentStore = Depends(get_comment_store),
) -> dict:
    comments, total = store.list_comments(post_id, limit=limit, offset=offset)
    uid = user.id if user else None
    return {
        "comments": [_comment_response(c, uid) for c in comments],
        "total": total,
    }


@router.post("")
def create_comment(
    post_id: str,
    body: CreateCommentRequest,
    user: CurrentUser = Depends(current_user),
    store: CommentStore = Depends(get_comment_store),
) -> CommentResponse:
    comment = store.create_comment(
        post_id=post_id,
        user_id=user.id,
        username=user.username,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        content=body.content,
    )
    return _comment_response(comment, user.id)


@router.delete("/{comment_id}")
def delete_comment(
    post_id: str,
    comment_id: str,
    user: CurrentUser = Depends(current_user),
    store: CommentStore = Depends(get_comment_store),
) -> dict:
    if user.role == "admin":
        deleted = store.admin_delete_comment(comment_id)
    else:
        deleted = store.delete_comment(comment_id, user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Comment not found")
    return {"detail": "Comment deleted"}
