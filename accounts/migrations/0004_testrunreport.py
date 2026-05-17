from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_remove_agent_bug_report_record"),
    ]

    operations = [
        migrations.CreateModel(
            name="TestRunReport",
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
                ("agent", models.CharField(max_length=20)),
                (
                    "environment",
                    models.CharField(
                        choices=[("local", "Local"), ("production", "Production")],
                        max_length=20,
                    ),
                ),
                ("model", models.CharField(blank=True, max_length=80)),
                (
                    "status",
                    models.CharField(
                        choices=[("PASS", "Pass"), ("FAIL", "Fail"), ("ERROR", "Error")],
                        max_length=10,
                    ),
                ),
                ("output", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
