import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.core.workspace_context import (
    WorkspaceContext,
    current_workspace,
    current_writable_workspace,
)
from app.schemas.stored_file import StoredFileRead, StoredFileRename
from app.services import file_service

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("", response_model=list[StoredFileRead])
async def list_files(
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    return await file_service.list_files(session, ctx.workspace.id)


@router.post("", response_model=StoredFileRead, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile,
    ctx: WorkspaceContext = Depends(current_writable_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    data = await file.read()
    try:
        return await file_service.upload_file(
            session=session,
            workspace_id=ctx.workspace.id,
            user_id=ctx.user_id,
            filename=file.filename or "unnamed",
            content_type=file.content_type or "application/octet-stream",
            data=data,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{file_id}/download")
async def download_file(
    file_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    try:
        record, data = await file_service.download_file(session, file_id, ctx.workspace.id)
    except (LookupError, FileNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return Response(
        content=data,
        media_type=record.content_type,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(record.filename)}",
        },
    )


@router.patch("/{file_id}", response_model=StoredFileRead)
async def rename_file(
    file_id: uuid.UUID,
    body: StoredFileRename,
    ctx: WorkspaceContext = Depends(current_writable_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    try:
        return await file_service.rename_file(session, file_id, ctx.workspace.id, body.filename)
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(current_writable_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    try:
        await file_service.delete_file(session, file_id, ctx.workspace.id)
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
