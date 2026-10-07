"""Build a native closure after provision-hermes verifies source and resolves uv.lock.

This runs only during explicit provisioning, never in an agent's execution.
"""
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path

source, destination, provider = map(Path, sys.argv[1:])
if destination.exists():
    raise ValueError("Hermes provisioning destination must be new")
destination.mkdir(parents=True, mode=0o700)


def copy_tree(origin, target, excluded=()):
    def ignore(directory, names):
        return [name for name in names if name in excluded or name == "__pycache__"
                or name.endswith((".pyc", ".pyo"))]
    shutil.copytree(origin, target, symlinks=False, ignore=ignore, dirs_exist_ok=True)


copy_tree(Path(sys.base_prefix), destination / "python", ("include", "share"))
site = destination / "python/lib/python3.12/site-packages"
site.mkdir(parents=True, exist_ok=True)
# Do not retain editable-install locators, virtualenv hooks, or provenance files
# containing the build machine's absolute paths. Hermes source is loaded below.
for item in (source / ".venv/lib/python3.12/site-packages").iterdir():
    if item.name.startswith(("__editable__", "_virtualenv", "hermes_agent-")) or item.name == "__pycache__":
        continue
    if item.suffix == ".pth":
        raise ValueError("Unreviewed Python site hook in Hermes dependencies")
    if item.is_dir():
        copy_tree(item, site / item.name)
    elif item.suffix not in (".pyc", ".pyo"):
        shutil.copy2(item, site / item.name)
copy_tree(source, destination / "app", (".venv", ".git", ".github", "tests", "website", "docs", ".pytest_cache"))
for name in ("bridge.py", "policy.py", "tool_process.py", "entry.py", "version.json"):
    shutil.copy2(provider / name, destination / name)
# Installed RECORD and direct_url metadata can contain mutable build locations.
for item in destination.rglob("*.dist-info/direct_url.json"):
    item.unlink()
for item in destination.rglob("*.dist-info/RECORD"):
    item.unlink()
entries = []
for item in sorted(destination.rglob("*")):
    if not item.is_file():
        continue
    data = item.read_bytes()
    entries.append({"path": item.relative_to(destination).as_posix(), "sha256": hashlib.sha256(data).hexdigest(),
                    "size": len(data), "executable": bool(item.stat().st_mode & 0o111)})
entries.sort(key=lambda entry: entry["path"].encode("utf-16-be"))
serialized = json.dumps(entries, separators=(",", ":"), ensure_ascii=False).encode()
digest = hashlib.sha256(serialized).hexdigest()
(destination / "manifest.json").write_text(json.dumps({"entries": entries}, separators=(",", ":")))
print(json.dumps({"closureSha256": digest, "files": len(entries), "bytes": sum(e["size"] for e in entries)}))
