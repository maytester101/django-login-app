from django.urls import path

from . import api_views

urlpatterns = [
    path("csrf/", api_views.csrf, name="api-csrf"),
    path("me/", api_views.me, name="api-me"),
    path("login/", api_views.login_api, name="api-login"),
    path("register/", api_views.register_api, name="api-register"),
    path("logout/", api_views.logout_api, name="api-logout"),
    path("attempts/", api_views.attempts_api, name="api-attempts"),
]
