from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import LoginAttempt

User = get_user_model()


@api_view(["GET"])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf(request):
    return Response({"csrfToken": get_token(request)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response({"username": request.user.username})


@api_view(["POST"])
@permission_classes([AllowAny])
def login_api(request):
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""
    user = authenticate(request, username=username, password=password)
    if user is not None:
        with transaction.atomic():
            LoginAttempt.objects.create(username=username, success=True)
            login(request, user)
        return Response({"username": user.username})
    LoginAttempt.objects.create(username=username if username else "—", success=False)
    return Response(
        {"detail": "Invalid username or password."},
        status=status.HTTP_400_BAD_REQUEST,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def register_api(request):
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""

    if not username:
        return Response(
            {"detail": "Username is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if User.objects.filter(username__iexact=username).exists():
        return Response(
            {"detail": "That username is already taken."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        validate_password(password, user=User(username=username))
    except ValidationError as exc:
        return Response(
            {"detail": " ".join(exc.messages)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.create_user(username=username, password=password)
    except IntegrityError:
        return Response(
            {"detail": "That username is already taken."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        LoginAttempt.objects.create(username=username, success=True)
        login(request, user)
    return Response({"username": user.username}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_api(request):
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def attempts_api(request):
    attempts = LoginAttempt.objects.all()
    return Response(
        [
            {
                "timestamp": attempt.timestamp.isoformat(),
                "username": attempt.username,
                "success": attempt.success,
            }
            for attempt in attempts
        ]
    )
