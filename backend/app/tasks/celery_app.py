"""Celery application configuration."""

from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

_settings = get_settings()

celery = Celery(
    "efilo",
    broker=_settings.redis_url,
    backend=_settings.redis_url,
)

celery.conf.update(
    # Serialisation
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    # Reliability
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    # Concurrency
    worker_concurrency=4,
    # Timeouts
    task_soft_time_limit=600,  # 10 min soft
    task_time_limit=660,  # 11 min hard
    # Result expiry
    result_expires=3600,
    # Timezone
    timezone="UTC",
    enable_utc=True,
)

# Explicitly import task modules so they register with celery
import app.tasks.document_ingestion  # noqa: F401, E402
import app.tasks.rfi_aging  # noqa: F401, E402
import app.tasks.compliance_crons  # noqa: F401, E402

# Beat schedule (periodic tasks)
celery.conf.beat_schedule = {
    "rfi-aging-daily": {
        "task": "rfi.aging",
        "schedule": crontab(hour=8, minute=0),  # 8 AM daily
    },
    "compliance-severity-hourly": {
        "task": "compliance.severity_cron",
        "schedule": crontab(minute=0),  # Every hour on the hour
    },
    "compliance-daily-snapshot": {
        "task": "compliance.daily_snapshot",
        "schedule": crontab(hour=2, minute=0),  # 2 AM daily
    },
    "compliance-weekly-summary": {
        "task": "compliance.weekly_summary",
        "schedule": crontab(hour=8, minute=0, day_of_week=1),  # Monday 8 AM
    },
}
