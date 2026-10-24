from functools import lru_cache
from os import getenv
from pathlib import Path

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Use the same environment variable that systemd uses: https://systemd.io/CREDENTIALS/
# If not defined, defaults to docker secrets defaults (https://docs.docker.com/compose/how-tos/use-secrets/)
CREDENTIALS_DIRECTORY: list[Path] = [
    Path(p) for p in getenv("CREDENTIALS_DIRECTORY", "/run/secrets").split(":") if p
]


class Settings(BaseSettings):
    # App
    app_name: str = "launchkit"
    debug: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/launchkit"

    # Auth
    secret_key: SecretStr = SecretStr("change-me-in-production")
    local_auth_enabled: bool = True
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 24 hours

    # Frontend
    frontend_url: str = "http://localhost:5173"

    # WebAuthn / passkeys
    webauthn_rp_name: str = "launchkit"
    # Empty means the RP ID follows the domain the browser is on, which is what
    # most deployments want. Set it to pin passkeys to one domain (e.g.
    # app.example.com); requests from other origins are then rejected.
    webauthn_rp_id: str = ""
    # Empty means the expected origin follows the browser. Only set this when the
    # app is reached at exactly one origin and you want it enforced.
    webauthn_origin: str = ""
    webauthn_challenge_ttl_seconds: int = 300

    # Storage
    storage_provider: str = "local"  # "local" (implement "s3" in app/providers)
    storage_local_path: str = "./data/files"
    storage_max_file_size_mb: int = 10
    storage_allowed_extensions: str = "jpg,jpeg,png,webp,gif,heic,pdf"

    # S3 Storage (for future use)
    storage_s3_bucket: str = ""
    storage_s3_region: str = ""
    storage_s3_access_key: SecretStr = SecretStr("")
    storage_s3_secret_key: SecretStr = SecretStr("")
    storage_s3_endpoint_url: str = ""  # for S3-compatible services (MinIO, DigitalOcean Spaces)

    # Registration
    registration_enabled: bool = True

    # OIDC login (works with Authentik, Pocket ID, and other standard OIDC providers)
    oidc_enabled: bool = False
    oidc_provider_name: str = "OIDC"
    oidc_discovery_url: str = (
        ""  # e.g. https://auth.example.com/application/o/launchkit/.well-known/openid-configuration
    )
    oidc_client_id: str = ""
    oidc_client_secret: SecretStr = SecretStr("")
    oidc_redirect_uri: str = ""  # defaults to {FRONTEND_URL}/api/auth/oidc/callback
    oidc_scopes: str = "openid email profile"
    oidc_auto_register: bool = True
    oidc_existing_user_link_mode: str = "disabled"  # disabled|verified_email|email
    oidc_require_verified_email: bool = True
    oidc_sync_roles: bool = False
    oidc_roles_claim: str = "groups"
    oidc_admin_roles: str = ""  # comma-separated provider roles/groups that grant launchkit admin
    oidc_workspace_role_map: str = ""  # JSON: {"provider-role": "owner|editor|viewer"}
    # Comma-separated exact URLs the desktop app may ask the OIDC callback to
    # return to (e.g. launchkit://auth/callback). Empty means no desktop redirect.
    oidc_desktop_redirect: str = ""

    # Celery
    redis_url: str = "redis://localhost:6379/0"

    # Reverse-proxy trust for client-IP-based rate limiting. 0 (default) means
    # request.client.host is used as-is, which is only correct when nothing
    # sits between the client and this service. In the shipped docker-compose
    # topology the backend is reached through the bundled nginx frontend, so
    # request.client.host is always nginx's container address. Set this to the
    # number of trusted reverse proxies in front of the backend (usually 1) to
    # derive the client IP from X-Forwarded-For instead, trusting only that
    # many hops from the right; a chain shorter than expected is not trusted.
    trusted_proxy_hops: int = 0

    # "owner/repo" on GitHub whose latest release the frontend compares
    # against its own version to show an "update available" banner. Empty
    # disables the check entirely (no request to GitHub is made).
    update_check_repo: str = ""

    @property
    def oidc_desktop_redirects(self) -> list[str]:
        return [item.strip() for item in self.oidc_desktop_redirect.split(",") if item.strip()]

    @property
    def oidc_login_available(self) -> bool:
        return bool(self.oidc_enabled and self.oidc_client_id and self.oidc_discovery_url)

    @model_validator(mode="after")
    def validate_auth_settings(self) -> "Settings":
        if not self.local_auth_enabled and not self.oidc_login_available:
            missing = []
            if not self.oidc_enabled:
                missing.append("OIDC_ENABLED=true")
            if not self.oidc_client_id:
                missing.append("OIDC_CLIENT_ID")
            if not self.oidc_discovery_url:
                missing.append("OIDC_DISCOVERY_URL")
            raise ValueError(
                "LOCAL_AUTH_ENABLED=false requires a complete OIDC configuration; "
                f"missing: {', '.join(missing)}"
            )
        return self

    # The CWD-relative ".env" is kept for backward compatibility; the anchored
    # backend/.env guarantees the API and the Celery worker/beat resolve the
    # same file no matter which working directory each service is launched
    # from (a systemd unit without WorkingDirectory= used to leave the worker
    # with default settings).
    #
    # extra="ignore" because the same .env is shared with Docker Compose and with
    # the optional modules: it legitimately holds keys this model doesn't declare
    # (COMPOSE_PROFILES, FRONTEND_PORT, ...). Unknown keys coming from
    # the process environment are ignored by pydantic-settings anyway; without
    # this, the very same key written into the .env file aborted startup with
    # "Extra inputs are not permitted".
    model_config = SettingsConfigDict(
        env_file=(".env", Path(__file__).resolve().parents[2] / ".env"),
        secrets_dir=CREDENTIALS_DIRECTORY,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
