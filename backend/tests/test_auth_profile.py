from datetime import timedelta

import pytest
from sqlalchemy import select, update

from app.db.base import utcnow
from app.modules.auth.models import AuthSession
from app.modules.profile.domains import classify_domain
from tests.conftest import SIGNUP

pytestmark = pytest.mark.integration


async def signup(api, **overrides):
    return await api.post("/api/auth/register", json={**SIGNUP, **overrides})


async def test_register_sets_httponly_cookie_and_returns_profile(api):
    r = await signup(api)
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["email"] == "ada@example.com"  # normalized
    assert body["user"]["displayName"] == "Ada Student"
    p = body["profile"]
    assert (p["fieldOfStudy"], p["domainType"], p["timeZone"], p["targetRole"], p["showStreaks"]) == (
        "Data Science", "code-based", "Africa/Tunis", "ML Engineer", True)
    cookie = r.headers["set-cookie"]
    assert "studymate_session=" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert "password" not in r.text


async def test_session_survives_refresh_and_logout_ends_it(api):
    await signup(api)
    me = await api.get("/api/profile")  # what the frontend calls on page load
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "ada@example.com"
    assert me.json()["email"] == "ada@example.com"

    assert (await api.post("/api/auth/logout")).status_code == 204
    r = await api.get("/api/profile")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


async def test_duplicate_email_conflicts(api):
    await signup(api)
    r = await signup(api, email="ADA@example.com")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "conflict"


async def test_register_validation(api):
    r = await signup(api, password="short", email="not-an-email", timeZone="Mars/Olympus")
    assert r.status_code == 422
    fields = {d["field"] for d in r.json()["error"]["details"]}
    assert {"password", "email", "timeZone"} <= fields


async def test_single_invalid_field_gets_specific_message(api):
    r = await signup(api, email="someone@example.test")  # reserved TLD
    assert r.status_code == 422
    assert r.json()["error"]["message"].startswith("Email: ")
    r = await signup(api, timeZone="Mars/Olympus")
    assert r.json()["error"]["message"] == "Time zone: Unknown time zone"


async def test_login_success_and_wrong_password(api):
    await signup(api)
    api.cookies.clear()
    bad = await api.post("/api/auth/login", json={"email": "ada@example.com", "password": "wrong-password"})
    assert bad.status_code == 401
    assert bad.json()["error"]["message"] == "Email or password is incorrect."
    unknown = await api.post("/api/auth/login", json={"email": "nobody@example.com", "password": "whatever1"})
    assert unknown.status_code == 401  # same answer: no account enumeration

    ok = await api.post("/api/auth/login", json={"email": " ADA@example.com ", "password": SIGNUP["password"]})
    assert ok.status_code == 200
    assert ok.json()["profile"]["level"] == "Master's"
    assert (await api.get("/api/profile")).status_code == 200


async def test_login_rate_limited(api):
    await signup(api)
    api.cookies.clear()
    for _ in range(10):
        await api.post("/api/auth/login", json={"email": "ada@example.com", "password": "nope-nope"})
    r = await api.post("/api/auth/login", json={"email": "ada@example.com", "password": SIGNUP["password"]})
    assert r.status_code == 429


async def test_expired_session_is_rejected(api, db_ready):
    await signup(api)
    async with db_ready() as db:
        await db.execute(update(AuthSession).values(expires_at=utcnow() - timedelta(seconds=1)))
        await db.commit()
    assert (await api.get("/api/profile")).status_code == 401


async def test_session_token_stored_hashed(api, db_ready):
    r = await signup(api)
    token = r.cookies["studymate_session"]
    async with db_ready() as db:
        stored = (await db.execute(select(AuthSession.token_hash))).scalar_one()
    assert stored != token and len(stored) == 64


async def test_patch_profile_reclassifies_domain(api):
    await signup(api)
    r = await api.patch("/api/profile", json={"domain": "Business", "specialization": "Finance",
                                               "fieldOfStudy": "Finance", "level": "PhD"})
    assert r.status_code == 200
    p = r.json()
    assert (p["fieldOfStudy"], p["domainType"], p["level"], p["targetRole"]) == (
        "Finance", "quantitative", "PhD", "ML Engineer")  # untouched fields kept

    r = await api.patch("/api/profile", json={"targetRole": "  "})
    assert r.json()["targetRole"] is None


async def test_preferences_roundtrip(api):
    await signup(api)
    r = await api.get("/api/preferences")
    assert r.json() == {"hideStreaks": False, "sessionLength": "30 minutes", "weeklyGoal": 4, "reminderTime": "18:00"}

    new = {"hideStreaks": True, "sessionLength": "45 minutes", "weeklyGoal": 5, "reminderTime": "07:30"}
    assert (await api.put("/api/preferences", json=new)).json() == new
    assert (await api.get("/api/preferences")).json() == new
    assert (await api.get("/api/profile")).json()["showStreaks"] is False

    bad = await api.put("/api/preferences", json={**new, "reminderTime": "25:00", "sessionLength": "2 hours"})
    assert bad.status_code == 422


async def test_users_are_isolated(api):
    await signup(api)
    api.cookies.clear()
    await signup(api, email="bob@example.com", name="Bob", specialization="History", domain="Humanities")
    me = (await api.get("/api/profile")).json()
    assert me["email"] == "bob@example.com" and me["domainType"] == "conceptual"


async def test_protected_routes_require_login(api):
    for method, path in [("GET", "/api/profile"), ("PATCH", "/api/profile"), ("GET", "/api/preferences")]:
        r = await api.request(method, path, json={} if method == "PATCH" else None)
        assert r.status_code == 401, path


@pytest.mark.parametrize(("texts", "expected"), [
    (("Data Science", "Computer Science & IT"), "code-based"),
    (("Electrical", "Engineering"), "quantitative"),
    (("Medicine", "Health & Medicine"), "conceptual"),
    (("Philosophy",), "argumentative"),
    (("Comparative literature",), "argumentative"),
    (("French language",), "language"),
    (("Maintenance management",), "conceptual"),  # "ai" must not match inside words
    ((None, "", "Unknown field"), "conceptual"),
])
def test_classify_domain(texts, expected):
    assert classify_domain(*texts) == expected
