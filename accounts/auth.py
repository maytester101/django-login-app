"""
Custom DRF authentication classes for the accounts app.

The reason this file exists: DRF's stock `SessionAuthentication` only calls
`enforce_csrf()` after `authenticate()` successfully resolves a user.
Combined with `@permission_classes([AllowAny])` on `login_api` and
`register_api`, that means the CSRF check is effectively never run on
those endpoints — a cross-origin POST with no token of any kind succeeds.

That was BUG-API-001 / BUG-SEC-002 (verified live: a request from any
origin with no cookie, no `X-CSRFToken` header, and no `Origin`/`Referer`
header returned 200 with a fresh `sessionid`).

`CsrfEnforcingSessionAuthentication` calls `enforce_csrf()` unconditionally
on every request, regardless of whether the request has a session or
whether the view's permission class is `AllowAny`. That makes the
`/api/csrf/` round-trip the UI already performs actually load-bearing.
"""

from rest_framework.authentication import SessionAuthentication


class CsrfEnforcingSessionAuthentication(SessionAuthentication):
    """SessionAuthentication that enforces CSRF on every request.

    Stock DRF only runs the CSRF check after a session is resolved
    (so `AllowAny` views are effectively csrf_exempt). This subclass
    runs it first, on every call, regardless of auth outcome.
    """

    def authenticate(self, request):
        self.enforce_csrf(request)
        return super().authenticate(request)
