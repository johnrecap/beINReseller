#!/usr/bin/env python3
"""Initialize, validate, and narrow work for a web PROJECT_MEMORY.md ledger.

The helper enforces deterministic structure and local freshness signals. It never
rewrites semantic records and never treats memory as authoritative evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from collections import Counter, deque
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath


RECORD_STATES = (
    "VERIFIED",
    "INFERRED",
    "PLANNED",
    "PARTIAL",
    "STALE",
    "CONFLICT",
    "DEPRECATED",
    "UNKNOWN",
)

FEATURE_STATES = (
    "PLANNED",
    "PARTIAL",
    "WORKING",
    "BLOCKED",
    "DEPRECATED",
    "BROKEN",
    "UNKNOWN",
)

SECTION_TITLES = (
    "Project Identity",
    "Current System Snapshot",
    "Technology Stack",
    "Architecture Map",
    "Source Map",
    "Frontend",
    "Backend",
    "API Contracts",
    "Database",
    "Data Flows",
    "Authentication and Authorization",
    "External Integrations",
    "Environment Variables",
    "Security",
    "Testing and Quality",
    "Build Deployment and Operations",
    "Feature Registry",
    "Dependency and Impact Map",
    "Technical Decisions",
    "Known Issues and Technical Debt",
    "Open Tasks",
    "Change Ledger",
    "Freshness and Conflicts",
)

SOURCE_OF_TRUTH = (
    "Source of truth: source code, schemas, ordered migrations, accepted specifications, "
    "tests, explicit maintainer decisions, and authorized operational evidence."
)

RECORD_ID_PATTERN = (
    r"(?:SRC|APP|FE|BE|API|DATA|FLOW|AUTH|JOB|INT|ENV|SEC|OPS|FEAT|IMPACT|TEST|DEC|RISK|WORK|FRESH)-\d{3}"
    r"|UPD-\d{8}-\d{3}"
)
RECORD_ID_TOKEN = re.compile(rf"\b(?:{RECORD_ID_PATTERN})\b")
RECORD_HEADING = re.compile(
    rf"^###\s+({RECORD_ID_PATTERN})\s+—\s+\S.*$", re.MULTILINE
)
ANY_HEADING = re.compile(r"^#{2,3}\s+", re.MULTILINE)
ANY_LEVEL_THREE = re.compile(r"^###\s+(.+?)\s*$", re.MULTILINE)
SECTION_HEADING = re.compile(r"^##\s+(\d+)\.\s+(.+?)\s*$", re.MULTILINE)
STATE_LINE = re.compile(r"^- State:\s+(\S+)\s*$", re.MULTILINE)
FEATURE_STATUS_LINE = re.compile(r"^- Status:\s+(\S+)\s*$", re.MULTILINE)
SOURCES_LINE = re.compile(r"^- Sources:\s+(.+?)\s*$", re.MULTILINE)
LAST_SYNC = re.compile(r"^> Last synchronized:\s+(\d{4}-\d{2}-\d{2})\s*$", re.MULTILINE)
LAST_COMMIT = re.compile(
    r"^> Last synchronized commit:\s+([0-9a-f]{40}|NO_GIT|UNKNOWN)\s*$",
    re.MULTILINE,
)
WORKING_TREE = re.compile(
    r"^> Working tree at synchronization:\s+(CLEAN|DIRTY|NO_GIT|UNKNOWN)\s*$",
    re.MULTILINE,
)
WORKING_FINGERPRINT = re.compile(
    r"^> Working tree fingerprint:\s+(SHA256:[0-9a-f]{64}|NO_GIT|UNKNOWN)\s*$",
    re.MULTILINE,
)
NON_GIT_BASELINE = re.compile(
    r"^> Non-Git source baseline:\s+(SHA256:[0-9a-f]{64})\s*$", re.MULTILINE
)

SECRET_ASSIGNMENT = re.compile(
    r"^\s*-?\s*(?:password|passwd|secret|token|api[_ -]?key|cookie|session)\s*[:=]\s*(\S.+)$",
    re.IGNORECASE | re.MULTILINE,
)
DATABASE_CREDENTIAL_URL = re.compile(
    r"\b(?:postgres(?:ql)?|mysql|redis)://[^\s/:@]+:[^\s@]+@", re.IGNORECASE
)
JWT_LIKE_VALUE = re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.")
PROVIDER_SECRET = re.compile(r"\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,}\b")
ALLOWED_SECRET_MARKERS = {
    "not-recorded",
    "not_recorded",
    "not recorded",
    "redacted",
    "names-only",
    "names only",
    "unknown",
    "none",
}

NON_GIT_EXCLUDES = {
    ".git",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".turbo",
    ".cache",
    ".pytest_cache",
    ".venv",
    "node_modules",
    "vendor",
    "dist",
    "build",
    "coverage",
    "out",
    "target",
}

NON_FILE_SOURCE_PREFIXES = (
    "command:",
    "external:",
    "decision:",
    "production:",
    "runtime:",
    "user:",
)


def utc_date() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="surrogateescape")).hexdigest()


def normalize_project_name(raw: str) -> str:
    name = " ".join(raw.split())
    if not name:
        raise ValueError("Project name must not be empty")
    return name


def require_directory(raw: str) -> Path:
    directory = Path(raw).expanduser().resolve()
    if not directory.is_dir():
        raise ValueError(f"Directory does not exist: {directory}")
    return directory


def relative_ledger_path(repository: Path, ledger: Path | None) -> str | None:
    if ledger is None:
        return None
    try:
        return ledger.expanduser().resolve().relative_to(repository).as_posix()
    except ValueError:
        return None


def run_git(repository: Path, arguments: list[str], binary: bool = False):
    return subprocess.run(
        ["git", "-C", str(repository), *arguments],
        capture_output=True,
        text=not binary,
        check=False,
    )


def decode_git_path(raw: bytes) -> str:
    return raw.decode("utf-8", errors="surrogateescape").replace("\\", "/")


def parse_status_entries(raw: bytes, excluded_path: str | None) -> list[dict[str, object]]:
    items = raw.split(b"\0")
    entries: list[dict[str, object]] = []
    index = 0
    while index < len(items):
        item = items[index]
        index += 1
        if not item:
            continue
        if len(item) < 4:
            continue
        status = item[:2].decode("ascii", errors="replace")
        current_path = decode_git_path(item[3:])
        paths = [current_path]
        if status[0] in {"R", "C"} or status[1] in {"R", "C"}:
            if index < len(items) and items[index]:
                paths.append(decode_git_path(items[index]))
                index += 1
        if excluded_path and excluded_path in paths:
            continue
        entries.append({"status": status, "paths": paths})
    return entries


def git_object_id(repository: Path, arguments: list[str]) -> str:
    result = run_git(repository, arguments)
    if result.returncode != 0:
        return "MISSING"
    value = result.stdout.strip()
    return value if re.fullmatch(r"[0-9a-f]{40,64}", value) else "MISSING"


def git_path_fingerprint(repository: Path, status: str, path: str) -> str:
    worktree = git_object_id(repository, ["hash-object", "--no-filters", "--", path])
    index = git_object_id(repository, ["rev-parse", f":{path}"])
    head = git_object_id(repository, ["rev-parse", f"HEAD:{path}"])
    return f"{status}:{path}|work={worktree}|index={index}|head={head}"


def git_diff_paths(repository: Path, cached: bool = False) -> list[str]:
    arguments = ["diff"]
    if cached:
        arguments.append("--cached")
    arguments.extend(["--name-only", "-z", "--", "."])
    result = run_git(repository, arguments, binary=True)
    if result.returncode != 0:
        return []
    return sorted(
        {
            decode_git_path(item)
            for item in result.stdout.split(b"\0")
            if item
        }
    )


def git_state(repository: Path, ledger: Path | None = None) -> dict[str, object]:
    probe = run_git(repository, ["rev-parse", "--is-inside-work-tree"])
    if probe.returncode != 0 or probe.stdout.strip() != "true":
        baseline = non_git_baseline(repository, ledger)
        return {
            "available": False,
            "commit": "NO_GIT",
            "working_tree": "NO_GIT",
            "fingerprint": "NO_GIT",
            "changed_paths": [],
            "diff_paths": [],
            "non_git_baseline": baseline["fingerprint"],
            "non_git_sources": baseline["sources"],
        }

    status_result = run_git(
        repository,
        ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "."],
        binary=True,
    )
    if status_result.returncode != 0:
        raise ValueError(
            status_result.stderr.decode("utf-8", errors="replace").strip()
            or "Unable to inspect Git status"
        )

    excluded_path = relative_ledger_path(repository, ledger)
    entries = parse_status_entries(status_result.stdout, excluded_path)
    changed_paths = sorted(
        {path for entry in entries for path in entry["paths"] if path != excluded_path}
    )
    fingerprint_lines: list[str] = []
    for entry in entries:
        status = str(entry["status"])
        for path in entry["paths"]:
            fingerprint_lines.append(git_path_fingerprint(repository, status, str(path)))

    commit_result = run_git(repository, ["rev-parse", "HEAD"])
    commit = commit_result.stdout.strip() if commit_result.returncode == 0 else "UNKNOWN"
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        commit = "UNKNOWN"

    diff_paths = sorted(
        set(git_diff_paths(repository)) | set(git_diff_paths(repository, cached=True))
    )
    if excluded_path:
        diff_paths = [path for path in diff_paths if path != excluded_path]

    return {
        "available": True,
        "commit": commit,
        "working_tree": "DIRTY" if entries else "CLEAN",
        "fingerprint": f"SHA256:{sha256_text(chr(10).join(sorted(fingerprint_lines)))}",
        "changed_paths": changed_paths,
        "diff_paths": diff_paths,
    }


def non_git_baseline(repository: Path, ledger: Path | None = None) -> dict[str, object]:
    ledger_path = ledger.resolve() if ledger else None
    facts: list[str] = []
    sources: list[str] = []
    for path in sorted(repository.rglob("*"), key=lambda item: item.as_posix().lower()):
        if len(facts) >= 200:
            break
        if ledger_path and path.resolve() == ledger_path:
            continue
        try:
            relative = path.relative_to(repository)
        except ValueError:
            continue
        if any(part in NON_GIT_EXCLUDES for part in relative.parts):
            continue
        if not path.is_file():
            continue
        stat = path.stat()
        normalized = relative.as_posix()
        facts.append(f"{normalized}|{stat.st_size}|{stat.st_mtime_ns}")
        sources.append(normalized)
    return {
        "fingerprint": f"SHA256:{sha256_text(chr(10).join(facts))}",
        "sources": sources,
    }


def project_template(project_name: str, state: dict[str, object]) -> str:
    sections = "\n\n".join(
        f"## {index}. {title}\n\n- No records yet."
        for index, title in enumerate(SECTION_TITLES, 1)
    )
    metadata = [
        f"> {SOURCE_OF_TRUTH}",
        "> Memory role: derived index and resumption state; use it to locate evidence, never as proof.",
        f"> Record states: {' | '.join(RECORD_STATES)}",
        f"> Feature states: {' | '.join(FEATURE_STATES)}",
        f"> Last synchronized: {utc_date()}",
        f"> Last synchronized commit: {state['commit']}",
        f"> Working tree at synchronization: {state['working_tree']}",
        f"> Working tree fingerprint: {state['fingerprint']}",
    ]
    if not state["available"]:
        metadata.append(f"> Non-Git source baseline: {state['non_git_baseline']}")
    return f"# PROJECT MEMORY — {project_name}\n\n" + "\n".join(metadata) + f"\n\n{sections}\n"


def create_exclusive(path: Path, content: str) -> None:
    try:
        with path.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
    except FileExistsError as exc:
        raise ValueError(f"Refusing to overwrite existing ledger: {path}") from exc
    print(f"CREATED {path}")


def read_ledger(path: Path) -> tuple[bytes, str]:
    if not path.is_file():
        raise ValueError(f"Ledger does not exist: {path}")
    raw = path.read_bytes()
    try:
        return raw, raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError(f"Ledger is not valid UTF-8: {exc}") from exc


def record_blocks(text: str) -> list[tuple[str, str]]:
    headings = list(ANY_HEADING.finditer(text))
    blocks: list[tuple[str, str]] = []
    for index, heading in enumerate(headings):
        record = RECORD_HEADING.match(text, heading.start())
        if not record:
            continue
        end = headings[index + 1].start() if index + 1 < len(headings) else len(text)
        blocks.append((record.group(1), text[heading.end():end]))
    return blocks


def source_tokens(block: str) -> list[str]:
    line = SOURCES_LINE.search(block)
    if not line:
        return []
    return [token.strip() for token in re.findall(r"`([^`]+)`", line.group(1))]


def normalize_source_pointer(pointer: str) -> str | None:
    normalized = pointer.strip().replace("\\", "/")
    if not normalized or normalized.lower().startswith(NON_FILE_SOURCE_PREFIXES):
        return None
    if "://" in normalized:
        return None
    normalized = normalized.split("#", 1)[0].strip()
    normalized = re.sub(r":\d+(?:-\d+)?$", "", normalized)
    if not normalized:
        return None
    pure = PurePosixPath(normalized)
    if pure.is_absolute() or ".." in pure.parts:
        raise ValueError(f"Source pointer must be repository-relative: {pointer}")
    return pure.as_posix()


def find_secret_errors(text: str) -> list[str]:
    errors: list[str] = []
    for match in SECRET_ASSIGNMENT.finditer(text):
        value = match.group(1).strip().strip("`'").lower()
        if value not in ALLOWED_SECRET_MARKERS and not value.startswith("$env:"):
            errors.append("Ledger contains a secret-like value assignment")
            break
    if "-----BEGIN PRIVATE KEY-----" in text or "-----BEGIN RSA PRIVATE KEY-----" in text:
        errors.append("Ledger contains private-key material")
    if DATABASE_CREDENTIAL_URL.search(text):
        errors.append("Ledger contains credentials inside a database or cache URL")
    if JWT_LIKE_VALUE.search(text):
        errors.append("Ledger contains a JWT-like value")
    if PROVIDER_SECRET.search(text):
        errors.append("Ledger contains a provider-secret-like value")
    return errors


def validate(path: Path, repository: Path | None = None) -> list[str]:
    try:
        raw, text = read_ledger(path)
    except ValueError as exc:
        return [str(exc)]

    errors: list[str] = []
    if raw.startswith(b"\xef\xbb\xbf"):
        errors.append("Ledger must not contain a UTF-8 BOM")
    if SOURCE_OF_TRUTH not in text:
        errors.append("Missing source-of-truth declaration")
    if "derived index and resumption state" not in text:
        errors.append("Missing derived-memory role declaration")
    if f"Record states: {' | '.join(RECORD_STATES)}" not in text:
        errors.append("Missing or incomplete record-state declaration")
    if f"Feature states: {' | '.join(FEATURE_STATES)}" not in text:
        errors.append("Missing or incomplete feature-state declaration")

    sync_match = LAST_SYNC.search(text)
    if not sync_match:
        errors.append("Missing ISO last-synchronized date")
    else:
        try:
            datetime.strptime(sync_match.group(1), "%Y-%m-%d")
        except ValueError:
            errors.append("Invalid last-synchronized date")
    commit_match = LAST_COMMIT.search(text)
    tree_match = WORKING_TREE.search(text)
    fingerprint_match = WORKING_FINGERPRINT.search(text)
    if not commit_match:
        errors.append("Missing last-synchronized commit")
    if not tree_match:
        errors.append("Missing synchronization working-tree state")
    if not fingerprint_match:
        errors.append("Missing synchronization working-tree fingerprint")
    if commit_match and commit_match.group(1) == "NO_GIT" and not NON_GIT_BASELINE.search(text):
        errors.append("Missing non-Git source baseline")

    actual_sections = [(int(number), title) for number, title in SECTION_HEADING.findall(text)]
    expected_sections = list(enumerate(SECTION_TITLES, 1))
    if actual_sections != expected_sections:
        for index, title in expected_sections:
            if (index, title) not in actual_sections:
                errors.append(f"Missing numbered section {index}: {title}")
        if len(actual_sections) != len(expected_sections) or set(actual_sections) == set(expected_sections):
            errors.append("Numbered sections must appear exactly once in required order")

    blocks = record_blocks(text)
    known_headings = {match.group(0).strip() for match in RECORD_HEADING.finditer(text)}
    for match in ANY_LEVEL_THREE.finditer(text):
        if match.group(0).strip() not in known_headings:
            errors.append(f"Unsupported level-three heading: {match.group(1)}")

    counts = Counter(record_id for record_id, _ in blocks)
    for record_id, count in counts.items():
        if count > 1:
            errors.append(f"Duplicate stable record ID: {record_id}")

    checked_sources: set[str] = set()
    for record_id, block in blocks:
        state = STATE_LINE.search(block)
        if not state:
            errors.append(f"Record {record_id} is missing State")
        elif state.group(1) not in RECORD_STATES:
            errors.append(f"Record {record_id} has unsupported state: {state.group(1)}")

        if record_id.startswith("FEAT-"):
            status = FEATURE_STATUS_LINE.search(block)
            if not status:
                errors.append(f"Feature record {record_id} is missing Status")
            elif status.group(1) not in FEATURE_STATES:
                errors.append(f"Feature record {record_id} has unsupported status: {status.group(1)}")

        sources = SOURCES_LINE.search(block)
        if not sources or not sources.group(1).strip():
            errors.append(f"Record {record_id} is missing Sources")
            continue
        tokens = source_tokens(block)
        if not tokens:
            errors.append(f"Record {record_id} Sources must contain a backticked pointer")
            continue
        if repository:
            for pointer in tokens:
                try:
                    normalized = normalize_source_pointer(pointer)
                except ValueError as exc:
                    errors.append(str(exc))
                    continue
                if normalized is None or normalized in checked_sources:
                    continue
                checked_sources.add(normalized)
                if not (repository / Path(normalized)).exists():
                    errors.append(f"Source pointer does not exist: {normalized}")

    errors.extend(find_secret_errors(text))
    return errors


def parse_baseline(text: str) -> dict[str, str]:
    commit = LAST_COMMIT.search(text)
    working_tree = WORKING_TREE.search(text)
    fingerprint = WORKING_FINGERPRINT.search(text)
    non_git = NON_GIT_BASELINE.search(text)
    if not commit or not working_tree or not fingerprint:
        raise ValueError("Ledger synchronization metadata is incomplete")
    return {
        "commit": commit.group(1),
        "working_tree": working_tree.group(1),
        "fingerprint": fingerprint.group(1),
        "non_git_baseline": non_git.group(1) if non_git else "",
    }


def freshness_report(repository: Path, ledger: Path) -> tuple[int, dict[str, object]]:
    errors = validate(ledger)
    if errors:
        raise ValueError("; ".join(errors))
    _, text = read_ledger(ledger)
    baseline = parse_baseline(text)
    current = git_state(repository, ledger)

    if baseline["commit"] == "NO_GIT":
        status = (
            "CURRENT"
            if not current["available"]
            and baseline["non_git_baseline"] == current["non_git_baseline"]
            else "STALE"
        )
    else:
        status = (
            "CURRENT"
            if current["available"]
            and baseline["commit"] == current["commit"]
            and baseline["working_tree"] == current["working_tree"]
            and baseline["fingerprint"] == current["fingerprint"]
            else "STALE"
        )
    report = {
        "status": status,
        "baseline": baseline,
        "current": current,
        "changed_paths": current.get("changed_paths", []),
    }
    return (0 if status == "CURRENT" else 1), report


def source_matches_change(source: str, changed: str) -> bool:
    return source == changed or changed.startswith(f"{source.rstrip('/')}/")


def impact_report(
    repository: Path, ledger: Path, supplied_changes: list[str]
) -> dict[str, object]:
    errors = validate(ledger, repository)
    if errors:
        raise ValueError("; ".join(errors))
    _, text = read_ledger(ledger)
    blocks = record_blocks(text)
    state = git_state(repository, ledger)
    changed_paths = sorted(
        {
            path.replace("\\", "/").lstrip("./")
            for path in (supplied_changes or list(state.get("changed_paths", [])))
            if path
        }
    )

    record_sources: dict[str, list[str]] = {}
    graph: dict[str, set[str]] = {record_id: set() for record_id, _ in blocks}
    for record_id, block in blocks:
        normalized_sources: list[str] = []
        for pointer in source_tokens(block):
            normalized = normalize_source_pointer(pointer)
            if normalized:
                normalized_sources.append(normalized)
        record_sources[record_id] = normalized_sources
        for linked in RECORD_ID_TOKEN.findall(block):
            if linked != record_id:
                graph.setdefault(record_id, set()).add(linked)
                graph.setdefault(linked, set()).add(record_id)

    direct = sorted(
        record_id
        for record_id, sources in record_sources.items()
        if any(
            source_matches_change(source, changed)
            for source in sources
            for changed in changed_paths
        )
    )
    visited = set(direct)
    queue = deque(direct)
    while queue:
        current = queue.popleft()
        for linked in sorted(graph.get(current, set())):
            if linked in graph and linked not in visited:
                visited.add(linked)
                queue.append(linked)
    connected = sorted(visited - set(direct))
    read_paths = sorted(
        {
            source
            for record_id in visited
            for source in record_sources.get(record_id, [])
        }
    )
    return {
        "changed_paths": changed_paths,
        "direct_records": direct,
        "connected_records": connected,
        "read_paths": read_paths,
    }


def print_json(value: dict[str, object]) -> None:
    print(json.dumps(value, indent=2, sort_keys=True))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    initialize = subparsers.add_parser("init", help="Create a missing PROJECT_MEMORY.md")
    initialize.add_argument("directory")
    initialize.add_argument("--project-name", required=True)

    check = subparsers.add_parser("validate", help="Validate a PROJECT_MEMORY.md")
    check.add_argument("path")
    check.add_argument("--repository")

    state_parser = subparsers.add_parser("git-state", help="Report bounded Git state")
    state_parser.add_argument("repository")
    state_parser.add_argument("--ledger")

    freshness_parser = subparsers.add_parser(
        "freshness", help="Compare the ledger synchronization baseline with local state"
    )
    freshness_parser.add_argument("repository")
    freshness_parser.add_argument("ledger")

    impact_parser = subparsers.add_parser(
        "impact", help="Map changed paths to direct and connected ledger records"
    )
    impact_parser.add_argument("repository")
    impact_parser.add_argument("ledger")
    impact_parser.add_argument("--changed-path", action="append", default=[])

    args = parser.parse_args()
    try:
        if args.command == "init":
            directory = require_directory(args.directory)
            destination = directory / "PROJECT_MEMORY.md"
            if destination.exists():
                raise ValueError(f"Refusing to overwrite existing ledger: {destination}")
            state = git_state(directory, destination)
            create_exclusive(
                destination,
                project_template(normalize_project_name(args.project_name), state),
            )
        elif args.command == "validate":
            destination = Path(args.path).expanduser().resolve()
            repository = require_directory(args.repository) if args.repository else None
            errors = validate(destination, repository)
            if errors:
                for error in errors:
                    print(f"ERROR {error}", file=sys.stderr)
                return 1
            print(f"OK {destination}")
        elif args.command == "git-state":
            repository = require_directory(args.repository)
            ledger = Path(args.ledger).expanduser().resolve() if args.ledger else None
            print_json(git_state(repository, ledger))
        elif args.command == "freshness":
            repository = require_directory(args.repository)
            ledger = Path(args.ledger).expanduser().resolve()
            status, report = freshness_report(repository, ledger)
            print_json(report)
            return status
        else:
            repository = require_directory(args.repository)
            ledger = Path(args.ledger).expanduser().resolve()
            print_json(impact_report(repository, ledger, args.changed_path))
    except (OSError, UnicodeError, ValueError) as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
