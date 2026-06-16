from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile

from forkfit.api.deps import current_user
from forkfit.api.rate_limit import enforce_rate_limit
from forkfit.auth.models import CurrentUser
from forkfit.config import get_settings

router = APIRouter(prefix="/upload", tags=["upload"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_SIZE = 5 * 1024 * 1024  # fallback only; settings owns the runtime limit
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


def _image_dimensions(data: bytes, content_type: str) -> tuple[int, int] | None:
    if content_type == "image/png" and len(data) >= 24:
        return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
    if content_type == "image/gif" and len(data) >= 10:
        return int.from_bytes(data[6:8], "little"), int.from_bytes(data[8:10], "little")
    if content_type == "image/webp" and len(data) >= 30:
        chunk = data[12:16]
        if chunk == b"VP8X" and len(data) >= 30:
            width = int.from_bytes(data[24:27], "little") + 1
            height = int.from_bytes(data[27:30], "little") + 1
            return width, height
        if chunk == b"VP8 " and len(data) >= 30:
            return int.from_bytes(data[26:28], "little") & 0x3FFF, int.from_bytes(data[28:30], "little") & 0x3FFF
        if chunk == b"VP8L" and len(data) >= 25:
            b0, b1, b2, b3 = data[21:25]
            width = 1 + (((b1 & 0x3F) << 8) | b0)
            height = 1 + (((b3 & 0xF) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6))
            return width, height
    if content_type == "image/jpeg":
        index = 2
        while index + 9 < len(data):
            if data[index] != 0xFF:
                index += 1
                continue
            marker = data[index + 1]
            index += 2
            if marker in {0xD8, 0xD9, 0x01} or 0xD0 <= marker <= 0xD7:
                continue
            if index + 2 > len(data):
                return None
            length = int.from_bytes(data[index:index + 2], "big")
            if length < 2 or index + length > len(data):
                return None
            if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
                height = int.from_bytes(data[index + 3:index + 5], "big")
                width = int.from_bytes(data[index + 5:index + 7], "big")
                return width, height
            index += length
    return None


def _stored_bytes(upload_dir: Path) -> int:
    return sum(path.stat().st_size for path in upload_dir.glob("*") if path.is_file())


@router.post("/image")
async def upload_image(
    file: UploadFile,
    user: CurrentUser = Depends(current_user),
) -> dict:
    settings = get_settings()
    enforce_rate_limit(
        f"upload:{user.id}",
        max_requests=20,
        window_seconds=3600,
        detail="Too many uploads. Please wait before uploading more images.",
    )

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="unsupported_image_type")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="invalid_image_content")
    if len(data) > settings.upload_max_bytes:
        raise HTTPException(status_code=400, detail="file_too_large")

    detected_type = _detect_image_type(data)
    if detected_type is None or detected_type != file.content_type:
        raise HTTPException(status_code=400, detail="invalid_image_content")

    dimensions = _image_dimensions(data, detected_type)
    if not dimensions:
        raise HTTPException(status_code=400, detail="invalid_image_content")
    width, height = dimensions
    if width <= 0 or height <= 0 or width * height > settings.upload_max_pixels:
        raise HTTPException(status_code=400, detail="image_dimensions_too_large")

    ext = IMAGE_EXTENSIONS[detected_type]
    filename = f"{uuid.uuid4().hex[:12]}.{ext}"

    upload_dir = _get_upload_dir()
    if _stored_bytes(upload_dir) + len(data) > settings.upload_storage_quota_bytes:
        raise HTTPException(status_code=400, detail="upload_storage_quota_exceeded")
    (upload_dir / filename).write_bytes(data)

    return {"url": f"/api/backend/uploads/{filename}"}
