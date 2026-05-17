from django.contrib.auth import authenticate, get_user_model, login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from typing import Optional

from .models import AgentBugReport, LoginAttempt, TestRunReport

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


DEFAULT_AGENT_BUG_REPORT_SLUG = "agent-bug-report"


def count_open_findings(markdown: str) -> int:
    return sum(
        1
        for line in markdown.splitlines()
        if line.strip().lower() == "- **status:** open"
    )


def get_agent_bug_report() -> Optional[AgentBugReport]:
    return AgentBugReport.objects.filter(slug=DEFAULT_AGENT_BUG_REPORT_SLUG).first()


def serialize_agent_bug_report(report: AgentBugReport) -> dict:
    return {
        "slug": report.slug,
        "title": report.title,
        "markdown": report.markdown,
        "updatedAt": report.updated_at.isoformat(),
        "openCount": count_open_findings(report.markdown),
    }


def create_test_run_report(
    *,
    agent: str,
    environment: str,
    model: str,
    status: str,
    output: str,
) -> TestRunReport:
    return TestRunReport.objects.create(
        agent=agent,
        environment=environment,
        model=model,
        status=status,
        output=output,
    )


def serialize_test_run_report(report: TestRunReport, *, include_output: bool = False) -> dict:
    data = {
        "id": report.id,
        "agent": report.agent,
        "environment": report.environment,
        "model": report.model,
        "status": report.status,
        "createdAt": report.created_at.isoformat(),
    }
    if include_output:
        data["output"] = report.output
    return data


def list_test_run_reports(environment: Optional[str] = None):
    reports = TestRunReport.objects.all()
    if environment:
        reports = reports.filter(environment=environment)
    return reports
