#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
# SPDX-License-Identifier: Apache-2.0
"""Parse CI log files and emit a deterministic JSON failure list.

Designed for the self-healing CI scan workflow. Reads one or more log
files (pytest output, pre-commit output, hadolint json) and produces a
JSON array of failure descriptors, each with a stable signature hash so
the triage step can deduplicate against open GitHub issues.

The output is always a JSON array on stdout. The array is empty when no
failures are detected. Never raises on missing files - missing logs are
treated as "tool didn't run" and skipped silently.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

MAX_FAILURES = 5
SNIPPET_LINES = 20


def sig(component: str, key: str) -> str:
    return hashlib.sha256(f"{component}:{key}".encode()).hexdigest()[:12]


def parse_pytest(text: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for m in re.finditer(r"^FAILED (\S+?)(?:::(\S+?))?(?:\s|$)", text, re.MULTILINE):
        test_path = m.group(1)
        test_name = m.group(2) or ""
        key = f"{test_path}::{test_name}"
        out.append(
            {
                "component": "pytest",
                "title": f"pytest failure: {test_name or test_path}",
                "key": key,
                "signature": sig("pytest", key),
                "snippet": _snippet(text, m.start()),
            }
        )
    return out


def parse_precommit(text: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for m in re.finditer(
        r"^(\S[^\n.]+?)\.\.+(Failed|Error)$", text, re.MULTILINE
    ):
        hook = m.group(1).strip()
        key = hook
        out.append(
            {
                "component": "pre-commit",
                "title": f"pre-commit hook failed: {hook}",
                "key": key,
                "signature": sig("pre-commit", key),
                "snippet": _snippet(text, m.start()),
            }
        )
    return out


def parse_hadolint(text: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    try:
        items = json.loads(text)
    except Exception:
        return out
    if not isinstance(items, list):
        return out
    for it in items:
        code = it.get("code", "?")
        msg = it.get("message", "?")
        key = f"{code}:{it.get('file', '?')}:{it.get('line', '?')}"
        out.append(
            {
                "component": "hadolint",
                "title": f"hadolint {code}: {msg[:60]}",
                "key": key,
                "signature": sig("hadolint", key),
                "snippet": f"{it.get('file')}:{it.get('line')} [{code}] {msg}",
            }
        )
    return out


def _snippet(text: str, pos: int) -> str:
    """Return up to SNIPPET_LINES of context around offset."""
    lines = text[:pos].count("\n")
    all_lines = text.splitlines()
    start = max(0, lines - SNIPPET_LINES // 2)
    end = min(len(all_lines), lines + SNIPPET_LINES // 2)
    return "\n".join(all_lines[start:end])[:2000]


def parse_vitest(text: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    # Vitest "FAIL <path> > <suite> > <test>"
    for m in re.finditer(r"^\s*(?:×|FAIL)\s+(\S+\.test\.\S+)\s*>\s*(.+)$", text, re.MULTILINE):
        file_ = m.group(1)
        case = m.group(2).strip()
        key = f"{file_}::{case}"
        out.append(
            {
                "component": "vitest",
                "title": f"vitest failure: {case[:80]}",
                "key": key,
                "signature": sig("vitest", key),
                "snippet": _snippet(text, m.start()),
            }
        )
    return out


def parse_tsc(text: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    # TS2345: src/foo.ts(12,34): error TS2345: ...
    for m in re.finditer(
        r"^(\S+\.tsx?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$",
        text, re.MULTILINE
    ):
        file_, line, _col, code, msg = m.groups()
        key = f"{file_}:{line}:{code}"
        out.append(
            {
                "component": "tsc",
                "title": f"{code} in {file_}: {msg[:60]}",
                "key": key,
                "signature": sig("tsc", key),
                "snippet": _snippet(text, m.start()),
            }
        )
    return out


def parse_eslint(text: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    # ESLint prints a file header (absolute OR relative path ending in
    # a JS/TS extension) followed by indented "line:col error msg rule"
    # rows. `turbo run lint` typically emits relative paths.
    file_header = re.compile(
        r"^(?:/|\.{0,2}/|[A-Za-z]:[\\/])?[\w./\\@-]+\.(?:ts|tsx|js|jsx|mjs|cjs)$"
    )
    current_file: str | None = None
    for line in text.splitlines():
        stripped = line.strip()
        if file_header.match(stripped) and not stripped.startswith(" "):
            current_file = stripped
            continue
        m = re.match(r"\s+(\d+):(\d+)\s+error\s+(.+?)\s+(\S+)$", line)
        if m and current_file:
            ln, _col, msg, rule = m.groups()
            key = f"{current_file}:{ln}:{rule}"
            out.append(
                {
                    "component": "eslint",
                    "title": f"eslint {rule} in {Path(current_file).name}",
                    "key": key,
                    "signature": sig("eslint", key),
                    "snippet": f"{current_file}:{ln} [{rule}] {msg}",
                }
            )
    return out


def parse_jest(text: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    # Jest summary: "  ● <describe> > <test name>" and "FAIL <path>".
    # Pair the FAIL line (which gives the file) with following bullets.
    file_marker = re.compile(r"^\s*FAIL\s+(\S+)")
    bullet = re.compile(r"^\s*●\s+(.+?)\s*$")
    current_file: str | None = None
    for line in text.splitlines():
        fm = file_marker.match(line)
        if fm:
            current_file = fm.group(1)
            continue
        bm = bullet.match(line)
        if bm and current_file:
            case = bm.group(1)
            # Skip "Test suite failed to run" generic headers without ›
            if case.lower().startswith("test suite failed"):
                continue
            key = f"{current_file}::{case}"
            out.append(
                {
                    "component": "jest",
                    "title": f"jest failure: {case[:80]}",
                    "key": key,
                    "signature": sig("jest", key),
                    "snippet": f"{current_file}: {case}",
                }
            )
    return out


PARSERS = {
    "pytest": parse_pytest,
    "precommit": parse_precommit,
    "hadolint": parse_hadolint,
    "vitest": parse_vitest,
    "tsc": parse_tsc,
    "eslint": parse_eslint,
    "jest": parse_jest,
}


def main(argv: list[str]) -> int:
    failures: list[dict[str, Any]] = []
    for arg in argv:
        kind, _, path = arg.partition("=")
        if not path:
            kind, path = "pytest", arg
        p = Path(path)
        if not p.exists():
            continue
        text = p.read_text(errors="replace")
        parser = PARSERS.get(kind)
        if parser is None:
            continue
        failures.extend(parser(text))

    # Deduplicate by signature, preserving first occurrence.
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for f in failures:
        if f["signature"] in seen:
            continue
        seen.add(f["signature"])
        unique.append(f)

    # Cap to MAX_FAILURES to keep triage volume bounded.
    print(json.dumps(unique[:MAX_FAILURES]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
