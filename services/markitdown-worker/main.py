import asyncio
import logging
import os
import tempfile
from pathlib import Path

import pytesseract
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from markitdown import MarkItDown
from pdf2image import convert_from_path
from PIL import Image

INTERNAL_TOKEN = (
    os.environ.get("MARKITDOWN_INTERNAL_TOKEN")
    or os.environ.get("INTERNAL_TOKEN")
    or ""
)
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "20"))
CONVERT_TIMEOUT_S = int(os.environ.get("CONVERT_TIMEOUT_S", "60"))
OCR_ENABLED = os.environ.get("OCR_ENABLED", "1") == "1"
OCR_LANGS = os.environ.get("OCR_LANGS", "fra+eng")
PDF_OCR_MIN_CHARS = int(os.environ.get("PDF_OCR_MIN_CHARS", "20"))
PDF_OCR_DPI = int(os.environ.get("PDF_OCR_DPI", "200"))
VERSION = "0.1.0"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
OFFICE_EXTS = {".docx", ".pptx", ".xlsx"}
PDF_EXT = ".pdf"
ALLOWED_EXTS = IMAGE_EXTS | OFFICE_EXTS | {PDF_EXT}

app = FastAPI(title="Buck MarkItDown Worker", version=VERSION)
md = MarkItDown(enable_plugins=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("markitdown_worker")


def _check_auth(token: str | None) -> None:
    if not INTERNAL_TOKEN:
        raise HTTPException(status_code=500, detail={"error": "INTERNAL_TOKEN not configured"})
    if token != INTERNAL_TOKEN:
        raise HTTPException(status_code=401, detail={"error": "unauthorized"})


def _ocr_image(path: str) -> str:
    if not OCR_ENABLED:
        return ""
    with Image.open(path) as img:
        img.load()
        return pytesseract.image_to_string(img, lang=OCR_LANGS) or ""


def _convert_pdf(path: str) -> tuple[str, str]:
    """Return (markdown, source) where source ∈ {'text', 'ocr'}."""
    result = md.convert(path)
    text = (result.text_content or "").strip()
    if len(text) >= PDF_OCR_MIN_CHARS or not OCR_ENABLED:
        return result.text_content or "", "text"

    pages = convert_from_path(path, dpi=PDF_OCR_DPI)
    chunks: list[str] = []
    for idx, page in enumerate(pages, start=1):
        page_text = pytesseract.image_to_string(page, lang=OCR_LANGS) or ""
        if page_text.strip():
            chunks.append(f"<!-- page {idx} -->\n{page_text.strip()}")
    return "\n\n".join(chunks), "ocr"


def _convert_sync(path: str, ext: str) -> tuple[str, str]:
    if ext in IMAGE_EXTS:
        return _ocr_image(path), "ocr"
    if ext == PDF_EXT:
        return _convert_pdf(path)
    # Office
    result = md.convert(path)
    return result.text_content or "", "native"


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "version": VERSION,
        "ocr_enabled": OCR_ENABLED,
        "ocr_langs": OCR_LANGS,
        "max_upload_mb": MAX_UPLOAD_MB,
        "convert_timeout_s": CONVERT_TIMEOUT_S,
    }


@app.post("/api/convert")
async def convert(
    file: UploadFile = File(...),
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> dict:
    _check_auth(x_internal_token)

    limit_bytes = MAX_UPLOAD_MB * 1024 * 1024
    content = await file.read(limit_bytes + 1)
    if len(content) > limit_bytes:
        raise HTTPException(
            status_code=413,
            detail={"error": f"file too large (>{MAX_UPLOAD_MB}MB)"},
        )

    filename = file.filename or "upload.bin"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(
            status_code=415,
            detail={"error": f"unsupported extension {ext!r}"},
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        try:
            markdown, source = await asyncio.wait_for(
                asyncio.to_thread(_convert_sync, tmp_path, ext),
                timeout=CONVERT_TIMEOUT_S,
            )
        except asyncio.TimeoutError as exc:
            raise HTTPException(
                status_code=504,
                detail={"error": f"conversion timeout (>{CONVERT_TIMEOUT_S}s)"},
            ) from exc

        markdown = markdown or ""
        logger.info(
            "converted filename=%s ext=%s size=%d chars=%d source=%s",
            filename,
            ext,
            len(content),
            len(markdown),
            source,
        )
        return {
            "markdown": markdown,
            "char_count": len(markdown),
            "filename": filename,
            "ext": ext,
            "source": source,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("conversion failed for filename=%s", filename)
        raise HTTPException(
            status_code=500,
            detail={"error": "conversion failed", "reason": str(exc)[:500]},
        ) from exc
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
