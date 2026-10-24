"""SQLite must preserve PostgreSQL-model UUIDs instead of coercing them to numbers."""

from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.dialects import postgresql

from app.models.stored_file import StoredFileRecord
from app.models.workspace import Workspace


async def test_uuid_identity_survives_sqlite_roundtrip_and_foreign_key_lookup(
    session, test_user, test_workspace
):
    ids = [
        UUID("50109654-5514-4562-8123-456789012345"),
        UUID("50109654-5514-4562-8123-456789012346"),  # Same float, distinct UUID.
        UUID("00000000-0000-4000-8000-000000000001"),
        UUID("12345678-1234-4123-8123-123456789e10"),
        UUID("abcdefab-cdef-4abc-8def-abcdefabcdef"),
    ]
    for value in ids:
        session.add(Workspace(id=value, name=str(value), created_by_user_id=test_user.id))
        await session.flush()
        record = StoredFileRecord(
            id=value,
            workspace_id=value,
            uploaded_by_user_id=test_user.id,
            filename="roundtrip.pdf",
            storage_key=f"{value}/roundtrip.pdf",
            content_type="application/pdf",
            size=1,
        )
        session.add(record)
        await session.commit()
        await session.refresh(record)
        assert record.id == value
        assert record.workspace_id == value

        result = await session.execute(
            select(StoredFileRecord.id, StoredFileRecord.workspace_id, Workspace.id)
            .join(Workspace, StoredFileRecord.workspace_id == Workspace.id)
            .where(StoredFileRecord.id == value)
        )
        assert result.one() == (value, value, value)

    stored = await session.execute(text(
        "SELECT id, workspace_id, typeof(id), typeof(workspace_id) "
        "FROM files ORDER BY id"
    ))
    assert stored.all() == sorted((value.hex, value.hex, "text", "text") for value in ids)


def test_postgresql_uuid_columns_keep_native_ddl():
    for table in (StoredFileRecord.__table__, Workspace.__table__):
        for column in table.columns:
            if isinstance(column.type, postgresql.UUID):
                assert column.type.compile(dialect=postgresql.dialect()) == "UUID"
