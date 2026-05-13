from django.contrib import admin

from .models import LoginAttempt


@admin.register(LoginAttempt)
class LoginAttemptAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "username", "success")
    list_filter = ("success",)
    search_fields = ("username",)
