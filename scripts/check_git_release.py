"""Read-only audit of a deployment's sources and Git state against a commit."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess


def git(root: Path, *args: str) -> bytes:
    return subprocess.check_output(["git", "-C", str(root), *args])


def audit(root: Path, ref: str) -> dict:
    commit = git(root, "rev-parse", "--verify", f"{ref}^{{commit}}").decode().strip()
    mismatched, missing = [], []
    tracked = set()
    for entry in git(root, "ls-tree", "-rz", "--full-tree", commit).split(b"\0"):
        if not entry:
            continue
        metadata, raw_name = entry.split(b"\t", 1)
        mode, kind, oid = metadata.decode().split()
        name = os.fsdecode(raw_name)
        tracked.add(name)
        path = root / name
        if kind != "blob":
            raise ValueError(f"Unsupported Git entry: {name} ({kind})")
        if not path.exists() and not path.is_symlink():
            missing.append(name)
            continue
        if path.is_symlink():
            content = os.fsencode(os.readlink(path))
            actual_mode = "120000"
        elif path.is_file():
            content = path.read_bytes()
            actual_mode = "100755" if path.stat().st_mode & 0o111 else "100644"
        else:
            mismatched.append(name)
            continue
        actual = hashlib.sha1(b"blob " + str(len(content)).encode() + b"\0" + content).hexdigest()
        if actual != oid or actual_mode != mode:
            mismatched.append(name)
    index_files = {os.fsdecode(name) for name in git(root, "ls-files", "-z").split(b"\0") if name}
    untracked = [os.fsdecode(name) for name in git(root, "ls-files", "--others", "--directory", "--exclude-standard", "-z").split(b"\0") if name]
    index_matches = subprocess.run(["git", "-C", str(root), "diff", "--cached", "--quiet", commit]).returncode == 0
    head = git(root, "rev-parse", "HEAD").decode().strip()
    return {
        "expected_commit": commit, "head": head, "index_matches": index_matches,
        "tracked_files": len(tracked), "mismatched": mismatched, "missing": missing,
        "obsolete_index_paths": sorted(index_files - tracked), "untracked": untracked,
        "clean": head == commit and index_matches and not (mismatched or missing or untracked or index_files - tracked),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--ref", default="HEAD")
    args = parser.parse_args()
    report = audit(args.root.resolve(), args.ref)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report["clean"] else 1)


if __name__ == "__main__":
    main()
