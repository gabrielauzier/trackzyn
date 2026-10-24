"""The test database must hand UUIDs back as UUIDs, whatever digits they hold.

SQLite gives a column declared as ``UUID`` NUMERIC affinity, so a hex string
that happens to parse as a number is stored as a float. ``uuid4`` produces
one such string roughly once in a million draws, which across a full run was
about one failure in ten, always on an unrelated test. These ids fail
deterministically without the ``CHAR(32)`` compile hook in conftest.
"""

import uuid

import pytest
from sqlalchemy import select

from app.models.stored_file import StoredFileRecord

# All digits, and digits with one "e" in a spot SQLite reads as an exponent.
NUMERIC_LOOKING_IDS = [
    uuid.UUID("12345678-1234-4678-9234-567812345678"),
    uuid.UUID("67787761-9470-4156-e000-000000000016"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("file_id", NUMERIC_LOOKING_IDS, ids=["digits", "digits-with-e"])
async def test_numeric_looking_uuid_round_trips(session, test_user, test_workspace, file_id):
    session.add(
        StoredFileRecord(
            id=file_id,
            workspace_id=test_workspace.id,
            uploaded_by_user_id=test_user.id,
            filename="numeric.pdf",
            storage_key=f"{file_id}/numeric.pdf",
            content_type="application/pdf",
            size=1,
        )
    )
    await session.commit()

    loaded = await session.scalar(select(StoredFileRecord).where(StoredFileRecord.id == file_id))

    assert loaded is not None
    assert loaded.id == file_id
    assert isinstance(loaded.id, uuid.UUID)
