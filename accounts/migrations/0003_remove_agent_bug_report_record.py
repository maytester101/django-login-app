from django.db import migrations


def remove_agent_bug_report(apps, schema_editor):
    agent_bug_report = apps.get_model("accounts", "AgentBugReport")
    agent_bug_report.objects.filter(slug="agent-bug-report").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_agentbugreport"),
    ]

    operations = [
        migrations.RunPython(remove_agent_bug_report, reverse_code=migrations.RunPython.noop),
    ]
