from django.contrib import messages
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.shortcuts import redirect, render
from django.views.decorators.http import require_http_methods

from .models import LoginAttempt

User = get_user_model()


@require_http_methods(["GET", "POST"])
def login_view(request):
    if request.user.is_authenticated:
        return redirect("attempts")

    if request.method == "POST":
        username = request.POST.get("username", "").strip()
        password = request.POST.get("password", "")
        user = authenticate(request, username=username, password=password)
        if user is not None:
            with transaction.atomic():
                LoginAttempt.objects.create(username=username, success=True)
                login(request, user)
            return redirect("attempts")
        LoginAttempt.objects.create(username=username if username else "—", success=False)
        messages.error(request, "Invalid username or password.")

    return render(request, "accounts/login.html")


@require_http_methods(["GET", "POST"])
def register_view(request):
    if request.user.is_authenticated:
        return redirect("attempts")

    username = ""
    if request.method == "POST":
        username = request.POST.get("username", "").strip()
        password = request.POST.get("password", "")

        if not username:
            messages.error(request, "Username is required.")
        elif User.objects.filter(username__iexact=username).exists():
            messages.error(request, "That username is already taken.")
        else:
            try:
                validate_password(password, user=User(username=username))
            except ValidationError as exc:
                messages.error(request, " ".join(exc.messages))
            else:
                try:
                    user = User.objects.create_user(username=username, password=password)
                except IntegrityError:
                    messages.error(request, "That username is already taken.")
                else:
                    messages.success(request, "Account created. You are signed in.")
                    with transaction.atomic():
                        LoginAttempt.objects.create(username=username, success=True)
                        login(request, user)
                    return redirect("attempts")

    return render(request, "accounts/register.html", {"username": username})


@login_required
def attempts_view(request):
    attempts = LoginAttempt.objects.all()
    return render(
        request,
        "accounts/attempts.html",
        {"attempts": attempts, "user": request.user},
    )


@require_http_methods(["GET", "POST"])
def logout_view(request):
    logout(request)
    return redirect("login")
