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


def register_user(request, username: str, password: str):
    username = username.strip()
    if not username:
        raise ValidationError("Username is required.")
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


def serialize_attempts():
    return [
        {
            "timestamp": attempt.timestamp.isoformat(),
            "username": attempt.username,
            "success": attempt.success,
        }
        for attempt in LoginAttempt.objects.all()
    ]
