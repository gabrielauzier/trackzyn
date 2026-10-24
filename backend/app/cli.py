"""CLI commands for managing the application.

    python -m app.cli create-user <email> <password>
    python -m app.cli create-admin <email> <password>
"""
import asyncio
import sys
import uuid

from sqlalchemy import select

from app.core.database import async_session_maker
from app.models.user import User


async def create_user(email: str, password: str, *, superuser: bool = False) -> None:
    """Create a user (and their Personal workspace) with the given credentials."""
    from pwdlib import PasswordHash

    from app.services.workspace_service import create_personal_workspace_for_user

    hasher = PasswordHash.recommended()

    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.email == email))
        if result.scalar_one_or_none():
            print(f"Error: User with email '{email}' already exists.")
            sys.exit(1)

        user = User(
            id=uuid.uuid4(),
            email=email,
            hashed_password=hasher.hash(password),
            is_active=True,
            is_superuser=superuser,
            is_verified=True,
            preferences={"language": "en", "date_format": "MM/DD/YYYY"},
        )
        session.add(user)
        await session.flush()
        await create_personal_workspace_for_user(session, user)
        await session.commit()
        kind = "Admin" if superuser else "User"
        print(f"{kind} created successfully: {email}")


COMMANDS = {
    "create-user": lambda email, password: create_user(email, password),
    "create-admin": lambda email, password: create_user(email, password, superuser=True),
}


def main() -> None:
    if len(sys.argv) != 4 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        sys.exit(1)
    command, email, password = sys.argv[1:]
    asyncio.run(COMMANDS[command](email, password))


if __name__ == "__main__":
    main()
