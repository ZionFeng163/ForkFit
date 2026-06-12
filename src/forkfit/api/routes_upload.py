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
IMAGE_SIGNATURES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/gif": (b"GIF87a", b"GIF89a"),
}
IMAGE_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}


def _get_upload_dir() -> Path:
    d = Path(os.getenv("UPLOAD_DIR", "uploads"))
    d.mkdir(parents=True, exist_ok=True)
    return d


def _detect_image_type(data: bytes) -> str | None:
    if data.startswith(IMAGE_SIGNATURES["image/jpeg"]) and data.endswith(b"\xff\xd9"):
        return "image/jpeg"
    if (
        data.startswith(IMAGE_SIGNATURES["image/png"])
        and len(data) >= 24
        and b"IEND" in data[-16:]
    ):
        return "image/png"
    if (
        any(data.startswith(signature) for signature in IMAGE_SIGNATURES["image/gif"])
        and data.endswith(b";")
    ):
        return "image/gif"
    if (
        len(data) >= 12
        and data.startswith(b"RIFF")
        and data[8:12] == b"WEBP"
        and int.from_bytes(data[4:8], "little") + 8 == len(data)
    ):
        return "image/webp"
    return None


@router.post("/image")
async def upload_image(
    file: UploadFile,
    _user: CurrentUser = Depends(current_user),
) -> dict:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    detected_type = _detect_image_type(data)
    if detected_type is None or detected_type != file.content_type:
        raise HTTPException(status_code=400, detail="File content is not a valid image")

    ext = IMAGE_EXTENSIONS[detected_type]
    filename = f"{uuid.uuid4().hex[:12]}.{ext}"

    upload_dir = _get_upload_dir()
    (upload_dir / filename).write_bytes(data)

    return {"url": f"/api/backend/uploads/{filename}"}
