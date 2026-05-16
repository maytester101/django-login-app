from django.contrib.auth import authenticate, get_user_model, login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from .models import LoginAttempt

User = get_user_model()


def authenticate_user(request, username: str, password: str):
    username = username.strip()
    user = authenticate(request, username=username, password=password)
    if user is None:
        LoginAttempt.objects.create(username=username if username else "—", success=False)
        return None
    with transaction.atomic():
        LoginAttempt.objects.create(username=username, success=True)
        login(request, user)
    return user


# Matches AbstractUser.username max_length. If Django ever raises this
# default we should bump it too.
USERNAME_MAX_LENGTH = 150


def register_user(request, username: str, password: str):
    username = username.strip()
    if not username:
        raise ValidationError("Username is required.")
    # Fail fast as a JSON 400 before hitting the DB layer, which would
    # otherwise raise DataError (length) or ValueError (NUL byte) and
    # bubble up as an HTML 500. See BUG-API-003.
    if len(username) > USERNAME_MAX_LENGTH:
        raise ValidationError(
            f"Username must be {USERNAME_MAX_LENGTH} characters or fewer."
        )
    if "\x00" in username:
        raise ValidationError("Username contains invalid characters.")
    if User.objects.filter(username__iexact=username).exists():
        raise ValidationError("That username is already taken.")
    validate_password(password, user=User(username=username))
    try:
        user = User.objects.create_user(username=username, password=password)
    except IntegrityError as exc:
        raise ValidationError("That username is already taken.") from exc
    with transaction.atomic():
        LoginAttempt.objects.create(username=username, success=True)
        login(request, user)
    return user


def serialize_attempts(user):
    """Return this user's own login attempts.

    Scoped by case-insensitive username match because:
      - `LoginAttempt.username` is a CharField, not a FK to User
        (failed logins for unknown usernames need to be recordable).
      - Registration is case-insensitive on uniqueness
        (`username__iexact`), so a single owner may have rows stored
        under different casings if they ever logged in with mixed case.
    """
    return [
        {
            "timestamp": attempt.timestamp.isoformat(),
            "username": attempt.username,
            "success": attempt.success,
        }
        for attempt in LoginAttempt.objects.filter(
            username__iexact=user.username
        )
    ]
