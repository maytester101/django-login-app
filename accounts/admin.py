from django.contrib import admin

from .models import AgentBugReport, LoginAttempt


@admin.register(LoginAttempt)
class LoginAttemptAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "username", "success")
    list_filter = ("success",)
    search_fields = ("username",)


@admin.register(AgentBugReport)
class AgentBugReportAdmin(admin.ModelAdmin):
    list_display = ("title", "slug", "updated_at")
    readonly_fields = ("created_at", "updated_at")
    search_fields = ("title", "slug", "markdown")
