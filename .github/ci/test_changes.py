"""Run with python3 .github/ci/test_changes.py; no application dependencies needed."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SELECTOR = Path(__file__).with_name("changes.py").resolve()


class CIChangesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name) / "repo"
        self.repo.mkdir()
        self.env = dict(os.environ, GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull)
        self.git("init", "-q", "-b", "base")
        self.git("config", "user.name", "CI Test")
        self.git("config", "user.email", "ci@example.invalid")
        for name in ("README.md", "docs/guide.md", "backend/old.py", "frontend/old.ts", "charts/trackzyn/old.yaml"):
            self.write(name, "original\n")
        self.git("add", ".")
        self.git("commit", "-qm", "base")
        self.base = self.git("rev-parse", "HEAD")

    def git(self, *args):
        return subprocess.check_output(
            ["git", "-c", "commit.gpgSign=false", "-c", f"core.hooksPath={os.devnull}", *args],
            cwd=self.repo, env=self.env, stderr=subprocess.PIPE,
        ).decode().strip()

    def write(self, name, text):
        path = self.repo / name
        if text is None:
            path.unlink()
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)

    def merge(self, files):
        self.git("switch", "-C", "feature", self.base)
        for name, text in files.items():
            self.write(name, text)
        self.git("add", "-A")
        self.git("commit", "--allow-empty", "-qm", "feature")
        head = self.git("rev-parse", "HEAD")
        self.git("switch", "--detach", self.base)
        self.git("merge", "--no-ff", "--no-edit", "feature")
        self.event = {"number": 123, "pull_request": {
            "base": {"sha": self.base}, "head": {"sha": head},
        }}
        self.env.update(GITHUB_EVENT_NAME="pull_request", GITHUB_REF="refs/pull/123/merge",
                        GITHUB_SHA=self.git("rev-parse", "HEAD"))

    def select(self, expected, overrides=None, event_text=None, stack=None):
        # Older cases list the three original outputs; the Node backend suite runs only when
        # everything does, or when a case says so with a fourth value.
        if len(expected) == 3:
            expected = (*expected, "true" if expected == ("true",) * 3 else "false")
        # The stack jobs run whenever a backend or the chart does, unless a case says otherwise.
        if stack is None:
            stack = "true" if "true" in (expected[0], expected[2], expected[3]) else "false"
        event_file = Path(self.temp.name) / "event.json"
        event_file.write_text(json.dumps(self.event) if event_text is None else event_text)
        output_file = Path(self.temp.name) / "output"
        output_file.write_text("")
        env = dict(self.env, GITHUB_EVENT_PATH=str(event_file), GITHUB_OUTPUT=str(output_file))
        env.update(overrides or {})
        result = subprocess.run([sys.executable, "-B", str(SELECTOR)], cwd=self.repo,
                                env=env, capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        # The desktop app bundles the frontend and backend-node: unless a case gives a fifth value (run_desktop), it follows either.
        desktop = expected[4] if len(expected) > 4 else "true" if "true" in (expected[1], expected[3]) else "false"
        self.assertEqual(output_file.read_text(),
                         f"run_backend={expected[0]}\nrun_frontend={expected[1]}\nrun_helm={expected[2]}\n"
                         f"run_backend_node={expected[3]}\nrun_desktop={desktop}\n"
                         f"run_stack_switch={stack}\nrun_select_stack={stack}\n")

    def test_component_docs_and_shared_paths(self):
        cases = [
            ({"README.md": "docs", "docs/new.md": "docs"}, ("false", "false", "false")),
            ({"frontend/new.ts": "code"}, ("false", "true", "false")),
            ({"backend/new.py": "code"}, ("true", "false", "false")),
            ({"backend/README.md": "fixture"}, ("true", "false", "false")),
            ({"backend/new.py": "code", "frontend/new.ts": "code"}, ("true", "true", "false")),
            ({"charts/trackzyn/new.yaml": "chart"}, ("false", "false", "true")),
            ({"charts/trackzyn/README.md": "docs"}, ("false", "false", "true")),
        ]
        for name in (".github/workflows/ci.yml", ".github/ci/changes.py",
                     ".github/ci/test_changes.py", "charts/other/Chart.yaml", "docker-compose.yml", "mise.toml",
                     "docs/tool.py", "unexpected.md", "new-package/code.py"):
            cases.append(({name: "shared"}, ("true", "true", "true")))
        for files, expected in cases:
            with self.subTest(files=files):
                self.merge(files)
                self.select(expected)

    def test_stack_jobs_triggers(self):
        for name in ("docker-compose.yml", "docker-compose.prod.yml", "docker-compose.override.yml"):
            with self.subTest(name=name):
                self.merge({name: "compose"})
                self.select(("true", "true", "true", "true"), stack="true")
        self.merge({"charts/trackzyn/values.yaml": "chart"})
        self.select(("false", "false", "true", "false"), stack="true")
        self.merge({"scripts/select-stack.mjs": "script"})
        self.select(("false", "false", "false", "false"), stack="true")
        for files in ({"frontend/new.ts": "code"}, {"README.md": "docs", "docs/new.md": "docs"}):
            with self.subTest(files=files):
                self.merge(files)
                self.select(("false", files.get("frontend/new.ts") and "true" or "false", "false", "false"), stack="false")

    def test_backend_node_only(self):
        for name in ("backend-node/src/app.ts", "backend-node/README.md", "backend-node/package.json"):
            with self.subTest(name=name):
                self.merge({name: "code"})
                self.select(("false", "false", "false", "true"))
        self.merge({"backend-node/src/app.ts": "code", "frontend/new.ts": "code"})
        self.select(("false", "true", "false", "true"))

    def test_contracts_select_both_backends(self):
        for name in ("contracts/tests/login.test.ts", "contracts/openapi.json"):
            with self.subTest(name=name):
                self.merge({name: "contract"})
                self.select(("true", "false", "false", "true"))

    def test_unknown_path_still_runs_everything(self):
        for name in ("new-package/code.py", "unexpected.md", "docker-compose.yml"):
            with self.subTest(name=name):
                self.merge({name: "shared"})
                self.select(("true", "true", "true", "true"))

    def test_run_desktop_selection(self):
        cases = [
            ({"desktop/src/main/index.ts": "code"}, ("false", "false", "false", "false", "true")),
            ({"desktop/package.json": "{}"}, ("false", "false", "false", "false", "true")),
            ({"frontend/new.ts": "code"}, ("false", "true", "false", "false", "true")),
            ({"backend-node/src/app.ts": "code"}, ("false", "false", "false", "true", "true")),
            ({"contracts/openapi.json": "contract"}, ("true", "false", "false", "true", "true")),
            ({"backend/new.py": "code"}, ("true", "false", "false", "false", "false")),
            ({"charts/trackzyn/new.yaml": "chart"}, ("false", "false", "true", "false", "false")),
            ({"docs/new.md": "docs"}, ("false", "false", "false", "false", "false")),
            ({"backend/new.py": "code", "desktop/new.ts": "code"}, ("true", "false", "false", "false", "true")),
            ({".github/workflows/desktop-release.yml": "shared"}, ("true", "true", "true", "true", "true")),
        ]
        for files, expected in cases:
            with self.subTest(files=files):
                self.merge(files)
                self.select(expected)

    def test_deleted_and_renamed_files(self):
        for old, new, expected in (
            ("backend/old.py", None, ("true", "false", "false")),
            ("frontend/old.ts", None, ("false", "true", "false")),
            ("backend/old.py", "docs/moved.md", ("true", "false", "false")),
            ("frontend/old.ts", "docs/moved.md", ("false", "true", "false")),
            ("backend/old.py", "frontend/moved.ts", ("true", "true", "false")),
            ("charts/trackzyn/old.yaml", None, ("false", "false", "true")),
            ("charts/trackzyn/old.yaml", "docs/moved.md", ("false", "false", "true")),
            ("charts/trackzyn/old.yaml", "backend/moved.py", ("true", "false", "true")),
            ("docs/guide.md", "backend/moved.py", ("true", "false", "false")),
        ):
            with self.subTest(old=old, new=new):
                files = {old: None}
                if new:
                    files[new] = "original\n"
                self.merge(files)
                self.select(expected)

    def test_odd_names_and_large_diffs(self):
        names = ["space name", "tab\tname", "line\nbackend/fake.py", "quotes'\"",
                 "$(touch injected)", "`touch injected`", "-leading", "日本語"]
        self.merge({f"frontend/{name}.ts": "code" for name in names})
        self.select(("false", "true", "false"))
        self.assertFalse((self.repo / "injected").exists())
        # Git filenames are bytes; this also works on systems rejecting undecodable names.
        if sys.platform.startswith("linux"):
            self.merge({"backend/odd-\udcff.py": "code"})
            self.select(("true", "false", "false"))
        self.merge({**{f"docs/{i}.md": "docs" for i in range(350)},
                    "backend/last.py": "code"})
        self.select(("true", "false", "false"))

    def test_merge_includes_all_pr_commits_but_not_base_only_changes(self):
        self.git("switch", "-c", "feature")
        self.write("frontend/first.ts", "first")
        self.git("add", ".")
        self.git("commit", "-qm", "first")
        self.write("README.md", "last PR commit only changes docs")
        self.git("commit", "-qam", "second")
        head = self.git("rev-parse", "HEAD")
        self.git("switch", "base")
        self.write("backend/base-only.py", "base advanced")
        self.git("add", ".")
        self.git("commit", "-qm", "base advanced")
        base = self.git("rev-parse", "HEAD")
        self.git("merge", "--no-ff", "--no-edit", "feature")
        self.event = {"number": 123, "pull_request": {
            "base": {"sha": base}, "head": {"sha": head},
        }}
        self.env.update(GITHUB_EVENT_NAME="pull_request", GITHUB_REF="refs/pull/123/merge",
                        GITHUB_SHA=self.git("rev-parse", "HEAD"))
        self.select(("false", "true", "false"))

    def test_unverifiable_inputs_and_non_pr_events_run_everything(self):
        self.merge({"README.md": "docs"})
        for overrides in (
            {"GITHUB_REF": "refs/heads/feature"}, {"GITHUB_SHA": "0" * 40},
            {"GITHUB_EVENT_PATH": "/missing/event.json"},
            {"GITHUB_EVENT_NAME": "push"}, {"GITHUB_EVENT_NAME": "workflow_dispatch"},
            {"PATH": ""},
        ):
            with self.subTest(overrides=overrides):
                self.select(("true", "true", "true"), overrides)
        for event_text in ("{", "null", "[]", "{}", '{"number":123,"pull_request":null}'):
            with self.subTest(event_text=event_text):
                self.select(("true", "true", "true"), event_text=event_text)
        self.event["pull_request"]["base"]["sha"] = "0" * 40
        self.select(("true", "true", "true"))
        self.merge({})
        self.select(("true", "true", "true"))

    def test_checkout_depth_and_head_ref(self):
        self.merge({"README.md": "docs"})
        source = self.repo
        for depth, expected in ((2, ("false", "false", "false")), (1, ("true", "true", "true"))):
            clone = Path(self.temp.name) / f"depth-{depth}"
            self.git("clone", "-q", f"--depth={depth}", source.as_uri(), str(clone))
            self.repo = clone
            self.select(expected)
            self.repo = source
        self.git("switch", "feature")
        self.select(("true", "true", "true"), {"GITHUB_SHA": self.git("rev-parse", "HEAD")})

    def test_output_publication_failure_fails_step(self):
        self.merge({"README.md": "docs"})
        result = subprocess.run([sys.executable, "-B", str(SELECTOR)], cwd=self.repo,
                                env=dict(self.env, GITHUB_OUTPUT=str(self.repo)),
                                capture_output=True, text=True, check=False)
        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
