from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, func, update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_jwt_strategy, get_user_manager, UserManager
from app.core.auth_policy import require_local_auth_enabled
from app.core.database import get_async_session
from app.models.user import User

router = APIRouter(prefix="/api/setup", tags=["setup"])


class SetupStatus(BaseModel):
    has_users: bool


class CreateAdminRequest(BaseModel):
    email: EmailStr
    password: str
    name: str = ""
    language: str = "en"


@router.get("/status", response_model=SetupStatus)
async def get_setup_status(session: AsyncSession = Depends(get_async_session)):
    result = await session.execute(select(func.count(User.id)))
    count = result.scalar() or 0
    return SetupStatus(has_users=count > 0)


@router.post("/create-admin", dependencies=[Depends(require_local_auth_enabled)])
async def create_admin(
    body: CreateAdminRequest,
    session: AsyncSession = Depends(get_async_session),
    user_manager: UserManager = Depends(get_user_manager),
):
    """First-run bootstrap: create the instance administrator.

    Only works while the users table is empty; afterwards it returns 403.
    """
    result = await session.execute(select(func.count(User.id)))
    count = result.scalar() or 0
    if count > 0:
        raise HTTPException(status_code=403, detail="Setup already completed")

    from fastapi_users import schemas

    user_create = schemas.BaseUserCreate(
        email=body.email,
        password=body.password,
        is_superuser=True,
    )
    user = await user_manager.create(user_create)

    prefs = {"language": body.language, "onboarding_completed": False}
    if body.name:
        prefs["display_name"] = body.name

    # Use direct SQL update to avoid session expiry issues after user_manager.create() commits
    db_session = user_manager.user_db.session
    await db_session.execute(
        sql_update(User).where(User.id == user.id).values(preferences=prefs)
    )

    # The setup endpoint runs programmatically, so the registration hook's
    # `request is None` early exit fires; bootstrap the workspace here.
    from app.services.workspace_service import create_personal_workspace_for_user

    await db_session.refresh(user)
    await create_personal_workspace_for_user(db_session, user)
    await db_session.commit()

    # Refresh user to get updated preferences for token generation
    await db_session.refresh(user)

    strategy = get_jwt_strategy()
    token = await strategy.write_token(user)

    return {"access_token": token, "token_type": "bearer"}
