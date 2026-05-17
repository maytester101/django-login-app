from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from accounts.models import AgentBugReport
from accounts.services import DEFAULT_AGENT_BUG_REPORT_SLUG


class Command(BaseCommand):
    help = "Sync qa/agents/bug-report.md into the database-backed agent bug report."

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            default=str(settings.BASE_DIR / "qa" / "agents" / "bug-report.md"),
            help="Markdown file to sync into the database.",
        )

    def handle(self, *args, **options):
        report_path = Path(options["file"])
        if not report_path.exists():
            raise CommandError(f"Report file does not exist: {report_path}")

        markdown = report_path.read_text(encoding="utf-8")
        report, created = AgentBugReport.objects.update_or_create(
            slug=DEFAULT_AGENT_BUG_REPORT_SLUG,
            defaults={
                "title": "Agent Bug Report",
                "markdown": markdown,
            },
        )
        action = "created" if created else "updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"{action} {report.slug} from {report_path} ({len(markdown)} chars)"
            )
        )
