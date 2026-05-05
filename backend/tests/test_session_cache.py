from server import (
    _get_cached_session,
    _invalidate_cached_session_by_id,
    _put_cached_session,
)


def test_can_invalidate_cached_session_by_session_id():
    token = "test-token-for-session-id-invalidation"
    session = {
        "id": "session-cache-test-id",
        "user_id": "session-cache-test-user",
        "expires_at": "2099-01-01T00:00:00+00:00",
        "is_revoked": 0,
        "geo_granted_until": None,
    }
    user = {"id": session["user_id"], "role": "temporary"}

    _put_cached_session(token, user, session)
    assert _get_cached_session(token) is not None

    _invalidate_cached_session_by_id(session["id"])

    assert _get_cached_session(token) is None
