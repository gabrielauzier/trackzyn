from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "launchkit",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

# Periodic tasks run by `celery beat`. Add entries as you need them.
celery_app.conf.beat_schedule = {
    "report-user-count-hourly": {
        "task": "app.tasks.example_tasks.report_user_count",
        "schedule": 60 * 60,
    },
}

celery_app.conf.include = [
    "app.tasks.example_tasks",
]
