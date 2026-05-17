from django.db import models


class LoginAttempt(models.Model):
    username = models.CharField(max_length=150)
    success = models.BooleanField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]

    def __str__(self) -> str:
        status = "ok" if self.success else "fail"
        return f"{self.username} @ {self.timestamp} ({status})"


class AgentBugReport(models.Model):
    slug = models.SlugField(max_length=80, unique=True, default="agent-bug-report")
    title = models.CharField(max_length=160, default="Agent Bug Report")
    markdown = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["slug"]

    def __str__(self) -> str:
        return self.title
