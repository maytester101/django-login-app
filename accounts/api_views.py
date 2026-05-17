from django.contrib.auth import logout
from django.core.exceptions import ValidationError
from django.http import Http404, HttpResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from . import services
from .models import TestRunReport


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
    report = services.get_agent_bug_report()
    if report is None:
        return Response(
            {"detail": "Agent bug report has been removed."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(services.serialize_agent_bug_report(report))


@api_view(["GET", "POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def test_run_reports_api(request):
    if request.method == "GET":
        environment = request.query_params.get("environment") or None
        reports = services.list_test_run_reports(environment=environment)[:100]
        return Response(
            [
                services.serialize_test_run_report(report)
                for report in reports
            ]
        )

    agent = str(request.data.get("agent") or "").strip()
    environment = str(request.data.get("environment") or "").strip()
    model = str(request.data.get("model") or "").strip()
    report_status = str(request.data.get("status") or "").strip().upper()
    output = str(request.data.get("output") or "")

    if agent not in {"C-API", "C-UI"}:
        return Response({"detail": "Unknown testing agent."}, status=status.HTTP_400_BAD_REQUEST)
    if environment not in {"local", "production"}:
        return Response({"detail": "Unknown testing environment."}, status=status.HTTP_400_BAD_REQUEST)
    if report_status not in {"PASS", "FAIL", "ERROR"}:
        return Response({"detail": "Unknown testing status."}, status=status.HTTP_400_BAD_REQUEST)
    if not output:
        return Response({"detail": "Report output is required."}, status=status.HTTP_400_BAD_REQUEST)

    report = services.create_test_run_report(
        agent=agent,
        environment=environment,
        model=model,
        status=report_status,
        output=output,
    )
    return Response(
        services.serialize_test_run_report(report),
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def test_run_report_download_api(request, report_id: int):
    try:
        report = TestRunReport.objects.get(pk=report_id)
    except TestRunReport.DoesNotExist as exc:
        raise Http404 from exc

    created = report.created_at.strftime("%Y-%m-%d-%H-%M-%S")
    filename = f"{report.agent}-{report.environment}-{created}.txt"
    content = "\n".join(
        [
            f"Agent: {report.agent}",
            f"Environment: {report.environment}",
            f"Model: {report.model}",
            f"Status: {report.status}",
            f"Created: {report.created_at.isoformat()}",
            "",
            report.output,
            "",
        ]
    )
    response = HttpResponse(content, content_type="text/plain; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
