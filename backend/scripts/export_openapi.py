#!/usr/bin/env python3
"""Export the FastAPI OpenAPI document to contracts/openapi.json.

    python backend/scripts/export_openapi.py            # write the file
    python backend/scripts/export_openapi.py --check    # exit 1 if it drifted
    python backend/scripts/export_openapi.py --output PATH

The file is the frozen HTTP contract: the contract suite and the Node backend are
held to it, and CI fails when it is not the current export. The output is
normalised (sorted keys, two-space indent, trailing newline) and the settings that
leak into the document are pinned, so a developer's backend/.env cannot change it.
"""

from __future__ import annotations

import argparse
import difflib
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
DEFAULT_OUTPUT = REPO_ROOT / "contracts" / "openapi.json"


def render() -> str:
    # Environment variables win over backend/.env in pydantic-settings, so this
    # pins the only setting that reaches the document (the API title).
    os.environ["APP_NAME"] = "launchkit"
    os.environ.setdefault("SECRET_KEY", "contract-export-not-a-secret")
    os.environ["CREDENTIALS_DIRECTORY"] = ""
    sys.path.insert(0, str(BACKEND_DIR))

    from app.main import app

    return json.dumps(app.openapi(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true", help="compare instead of writing")
    args = parser.parse_args()

    expected = render()

    if args.check:
        current = args.output.read_text() if args.output.exists() else ""
        if current == expected:
            print(f"{args.output} is up to date")
            return 0
        diff = difflib.unified_diff(
            current.splitlines(keepends=True),
            expected.splitlines(keepends=True),
            fromfile=f"{args.output} (committed)",
            tofile="export (current)",
        )
        sys.stdout.writelines(diff)
        print(f"\n{args.output} is out of date; run: python backend/scripts/export_openapi.py")
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(expected)
    print(f"wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
