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
