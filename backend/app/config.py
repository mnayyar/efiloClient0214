"""Application configuration via environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env.local",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    environment: str = "development"
    app_url: str = "http://localhost:5173"
    backend_port: int = 8000

    # Database
    database_url: str

    # Auth (WorkOS)
    workos_api_key: str = ""
    workos_client_id: str = ""
    workos_redirect_uri: str = ""
    workos_webhook_secret: str = ""
    workos_organization_id: str = ""

    # AI — Anthropic
    anthropic_api_key: str = ""

    # AI — OpenAI (embeddings only)
    openai_api_key: str = ""

    # File Storage (Cloudflare R2)
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = ""
    r2_public_url: str = ""

    # Email (SMTP)
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_from: str = "noreply@efilo.ai"

    # Background Jobs (Celery + Redis)
    redis_url: str = "redis://localhost:6379/0"

    @property
    def is_development(self) -> bool:
        return self.environment == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
