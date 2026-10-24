"""Example Celery tasks.

Copy this module as a starting point for background work. Tasks are plain
functions; async code runs through `asyncio.run` with its own DB session.
"""
import asyncio
import logging

from sqlalchemy import func, select

from app.worker import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.example_tasks.ping")
def ping() -> str:
    """Smallest possible task: proves the worker is consuming the queue."""
    return "pong"


async def _count_users() -> int:
    from app.core.database import async_session_maker
    from app.models.user import User

    async with async_session_maker() as session:
        return int(await session.scalar(select(func.count(User.id))) or 0)


@celery_app.task(name="app.tasks.example_tasks.report_user_count")
def report_user_count() -> int:
    """Example periodic task that talks to the database."""
    count = asyncio.run(_count_users())
    logger.info("There are %d users", count)
    return count
