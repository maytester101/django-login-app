from pathlib import Path

from django.db import migrations, models


DEFAULT_REPORT = """# Agent Bug Report

Shared bug log for findings reported by the persistent QA agents `C-API` and
`C-UI`.

## C-API Findings

No C-API findings logged yet.

## C-UI Findings

No C-UI findings logged yet.
"""


def seed_agent_bug_report(apps, schema_editor):
    agent_bug_report = apps.get_model("accounts", "AgentBugReport")
    report_path = Path(__file__).resolve().parents[2] / "qa" / "agents" / "bug-report.md"
    try:
        markdown = report_path.read_text(encoding="utf-8")
    except OSError:
        markdown = DEFAULT_REPORT
    agent_bug_report.objects.get_or_create(
        slug="agent-bug-report",
        defaults={
            "title": "Agent Bug Report",
            "markdown": markdown,
        },
    )


def remove_seeded_agent_bug_report(apps, schema_editor):
    agent_bug_report = apps.get_model("accounts", "AgentBugReport")
    agent_bug_report.objects.filter(slug="agent-bug-report").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="AgentBugReport",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "slug",
                    models.SlugField(
                        default="agent-bug-report",
                        max_length=80,
                        unique=True,
                    ),
                ),
                (
                    "title",
                    models.CharField(default="Agent Bug Report", max_length=160),
                ),
                ("markdown", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["slug"],
            },
        ),
        migrations.RunPython(
            seed_agent_bug_report,
            reverse_code=remove_seeded_agent_bug_report,
        ),
    ]
