from django.contrib.auth import logout
from django.core.exceptions import ValidationError
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from . import services


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
    username = request.data.get("username") or ""
    password = request.data.get("password") or ""
    user = services.authenticate_user(request, username, password)
    if user is None:
        return Response(
            {"detail": "Invalid username or password."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response({"username": user.username})


@api_view(["POST"])
@permission_classes([AllowAny])
def register_api(request):
    username = request.data.get("username") or ""
    password = request.data.get("password") or ""
    try:
        user = services.register_user(request, username, password)
    except ValidationError as exc:
        return Response(
            {"detail": " ".join(exc.messages)},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response({"username": user.username}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_api(request):
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def attempts_api(request):
    return Response(services.serialize_attempts(request.user))


@api_view(["GET"])
@permission_classes([AllowAny])
def agent_bug_report_api(request):
    return Response(services.serialize_agent_bug_report(services.get_agent_bug_report()))
