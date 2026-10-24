"""The exported OpenAPI file is the frozen HTTP contract the Node backend must match."""
import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "backend" / "scripts" / "export_openapi.py"
MAIN = REPO_ROOT / "backend" / "app" / "main.py"
COMMITTED = REPO_ROOT / "contracts" / "openapi.json"
HTTP_METHODS = {"get", "put", "post", "delete", "options", "head", "patch", "trace"}


def operations(spec: dict) -> set[tuple[str, str]]:
    return {
        (method.upper(), path)
        for path, item in spec["paths"].items()
        for method in item
        if method in HTTP_METHODS
    }


def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def test_exported_file_lists_all_61_operations(tmp_path):
    out = tmp_path / "openapi.json"
    result = run("--output", str(out))
    assert result.returncode == 0, result.stderr

    exported = json.loads(out.read_text())
    assert len(operations(exported)) == 61

    # The committed contract is exactly what the script writes today.
    assert COMMITTED.read_text() == out.read_text()


def test_operations_split_52_8_1():
    """52 declared in backend/app/api, 8 mounted from fastapi-users, 1 in app.main."""
    declared_in_api = sum(
        len(re.findall(r"^@router\.(?:get|post|put|patch|delete)\(", path.read_text(), re.M))
        for path in (REPO_ROOT / "backend" / "app" / "api").glob("*.py")
    )
    declared_in_main = len(
        re.findall(r"^@app\.(?:get|post|put|patch|delete)\(", MAIN.read_text(), re.M)
    )
    # fastapi-users names its routes `register:register`, `reset:*` and `users:*`,
    # and FastAPI turns that into the operationId prefix.
    fastapi_users = {
        (method.upper(), path)
        for path, item in json.loads(COMMITTED.read_text())["paths"].items()
        for method, op in item.items()
        if method in HTTP_METHODS and re.match(r"(register|reset|users)_", op["operationId"])
    }

    assert (declared_in_api, len(fastapi_users), declared_in_main) == (52, 8, 1)


def test_check_mode_exits_1_when_the_file_drifts(tmp_path):
    drifted = tmp_path / "openapi.json"
    drifted.write_text(COMMITTED.read_text().replace('"/api/health"', '"/api/healthz"'))

    result = run("--check", "--output", str(drifted))
    assert result.returncode == 1
    assert "/api/healthz" in result.stdout + result.stderr

    # --check never rewrites the file it compares against.
    assert '"/api/healthz"' in drifted.read_text()

    clean = run("--check")
    assert clean.returncode == 0, clean.stdout + clean.stderr
