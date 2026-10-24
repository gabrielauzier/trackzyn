#!/usr/bin/env python3
"""Export the timezone names the Python backend accepts to backend-node/src/data/timezones.json.

    python backend/scripts/export_timezones.py            # write the file
    python backend/scripts/export_timezones.py --check    # exit 1 if it drifted
    python backend/scripts/export_timezones.py --output PATH

`app.core.app_clock.timezone_names()` lists what the host's zoneinfo holds, which changes with
the machine. The export reads the `tzdata` package pinned in uv.lock instead, so the file is the
same everywhere, and the contract suite starts the Python stack on the same package
(PYTHONTZPATH) so both stacks answer with this list.
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
DEFAULT_OUTPUT = REPO_ROOT / "backend-node" / "src" / "data" / "timezones.json"


def render() -> str:
    import tzdata

    # The path is set before anything imports zoneinfo, as the contract suite does for the server.
    os.environ["PYTHONTZPATH"] = os.path.join(os.path.dirname(tzdata.__file__), "zoneinfo")
    os.environ.setdefault("SECRET_KEY", "contract-export-not-a-secret")
    os.environ["CREDENTIALS_DIRECTORY"] = ""
    sys.path.insert(0, str(BACKEND_DIR))

    from importlib.metadata import version

    from app.core.app_clock import timezone_names

    document = {"tzdata": version("tzdata"), "names": sorted(timezone_names())}
    return json.dumps(document, indent=2, ensure_ascii=False) + "\n"


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
        print("\nrun: python backend/scripts/export_timezones.py", file=sys.stderr)
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(expected)
    print(f"wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
