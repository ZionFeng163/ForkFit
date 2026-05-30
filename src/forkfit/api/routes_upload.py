from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile

from forkfit.api.deps import current_user
from forkfit.auth.models import CurrentUser

router = APIRouter(prefix="/upload", tags=["upload"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_SIZE = 5 * 1024 * 1024  # 5MB


def _get_upload_dir() -> Path:
    d = Path(os.getenv("UPLOAD_DIR", "uploads"))
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.post("/image")
async def upload_image(
    file: UploadFile,
    _user: CurrentUser = Depends(current_user),
) -> dict:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg"
    filename = f"{uuid.uuid4().hex[:12]}.{ext}"

    upload_dir = _get_upload_dir()
    (upload_dir / filename).write_bytes(data)

    return {"url": f"/api/backend/uploads/{filename}"}
