from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main
from main import app

FIXTURES = Path(__file__).resolve().parent.parent.parent.parent / "tests"
PDF = FIXTURES / "1000020842.pdf"
JPG = FIXTURES / "1000020842.jpg"

_needs_fixtures = pytest.mark.skipif(
    not (PDF.exists() and JPG.exists()),
    reason="fixtures tests/1000020842.{pdf,jpg} absents (dev-only, non versionnés)",
)


@pytest.fixture(autouse=True)
def _setup_env(monkeypatch):
    monkeypatch.setattr(main, "INTERNAL_TOKEN", "test-token")
    monkeypatch.setattr(main, "OCR_LANGS", "eng")


@pytest.fixture
def client():
    return TestClient(app)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["version"]


def test_convert_missing_auth(client):
    r = client.post(
        "/api/convert",
        files={"file": ("x.pdf", b"%PDF-1.4\n", "application/pdf")},
    )
    assert r.status_code == 401


def test_convert_wrong_auth(client):
    r = client.post(
        "/api/convert",
        headers={"X-Internal-Token": "wrong"},
        files={"file": ("x.pdf", b"%PDF-1.4\n", "application/pdf")},
    )
    assert r.status_code == 401


@_needs_fixtures
def test_convert_pdf(client):
    with PDF.open("rb") as f:
        r = client.post(
            "/api/convert",
            headers={"X-Internal-Token": "test-token"},
            files={"file": (PDF.name, f, "application/pdf")},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ext"] == ".pdf"
    assert isinstance(body["markdown"], str)
    assert body["char_count"] == len(body["markdown"])
    assert body["source"] in ("text", "ocr")
    assert body["char_count"] > 50, f"expected real content, got {body['char_count']} chars"


@_needs_fixtures
def test_convert_image(client):
    with JPG.open("rb") as f:
        r = client.post(
            "/api/convert",
            headers={"X-Internal-Token": "test-token"},
            files={"file": (JPG.name, f, "image/jpeg")},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ext"] == ".jpg"
    assert body["source"] == "ocr"
    assert body["char_count"] > 50, f"expected OCR text, got {body['char_count']} chars"


def test_convert_unsupported_ext(client):
    r = client.post(
        "/api/convert",
        headers={"X-Internal-Token": "test-token"},
        files={"file": ("foo.txt", b"hello world", "text/plain")},
    )
    assert r.status_code == 415


def test_convert_too_large(client, monkeypatch):
    monkeypatch.setattr(main, "MAX_UPLOAD_MB", 1)
    big = b"x" * (2 * 1024 * 1024)
    r = client.post(
        "/api/convert",
        headers={"X-Internal-Token": "test-token"},
        files={"file": ("big.pdf", big, "application/pdf")},
    )
    assert r.status_code == 413
