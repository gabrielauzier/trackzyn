"""Pluggable infrastructure providers.

Today only file storage lives here. Add other adapters (email, payments,
external APIs, ...) as sibling modules with the same pattern: an abstract
base class plus a factory that picks the implementation from settings.
"""
from app.providers.storage import StorageProvider, StoredFile

_storage_provider: StorageProvider | None = None


def get_storage_provider() -> StorageProvider:
    """Get the configured storage provider (singleton)."""
    global _storage_provider
    if _storage_provider is None:
        from app.core.config import get_settings

        settings = get_settings()
        if settings.storage_provider == "local":
            from app.providers.local_storage import LocalStorageProvider

            _storage_provider = LocalStorageProvider()
        else:
            raise NotImplementedError(
                f"Storage provider '{settings.storage_provider}' is not yet implemented. "
                "Supported: 'local'"
            )
    return _storage_provider


__all__ = ["StorageProvider", "StoredFile", "get_storage_provider"]
