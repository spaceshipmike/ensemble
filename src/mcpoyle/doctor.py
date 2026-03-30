"""Deterministic config health audit — no network calls, no LLM."""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, field
from pathlib import Path

from mcpoyle.clients import CLIENTS, get_managed_servers, read_client_config
from mcpoyle.config import McpoyleConfig, compute_entry_hash


# ── Check categories ───────────────────────────────────────────


CATEGORIES = ("existence", "freshness", "grounding", "parity", "skills-health")


@dataclass
class Check:
    """A single health check result with structured scoring."""
    id: str  # unique check identifier
    severity: str  # "error", "warning", "info"
    client: str  # client name or "central"
    message: str
    category: str = "existence"  # one of CATEGORIES
    max_points: int = 1
    earned_points: int = 0
    fix: str = ""  # suggested fix

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "severity": self.severity,
            "client": self.client,
            "message": self.message,
            "category": self.category,
            "maxPoints": self.max_points,
            "earnedPoints": self.earned_points,
            "fix": self.fix,
        }


@dataclass
class DoctorResult:
    """Aggregate result of all health checks."""
    checks: list[Check] = field(default_factory=list)
    server_count: int = 0
    group_count: int = 0
    plugin_count: int = 0
    skill_count: int = 0

    @property
    def errors(self) -> int:
        return sum(1 for c in self.checks if c.severity == "error")

    @property
    def warnings(self) -> int:
        return sum(1 for c in self.checks if c.severity == "warning")

    @property
    def max_score(self) -> int:
        return sum(c.max_points for c in self.checks)

    @property
    def earned_score(self) -> int:
        return sum(c.earned_points for c in self.checks)

    @property
    def score_pct(self) -> int:
        if self.max_score == 0:
            return 100
        return round(100 * self.earned_score / self.max_score)

    def category_scores(self) -> dict[str, tuple[int, int]]:
        """Return (earned, max) per category."""
        scores: dict[str, tuple[int, int]] = {}
        for cat in CATEGORIES:
            cat_checks = [c for c in self.checks if c.category == cat]
            earned = sum(c.earned_points for c in cat_checks)
            maximum = sum(c.max_points for c in cat_checks)
            if maximum > 0:
                scores[cat] = (earned, maximum)
        return scores

    def to_dict(self) -> dict:
        return {
            "server_count": self.server_count,
            "group_count": self.group_count,
            "plugin_count": self.plugin_count,
            "skill_count": self.skill_count,
            "errors": self.errors,
            "warnings": self.warnings,
            "score": self.earned_score,
            "maxScore": self.max_score,
            "scorePct": self.score_pct,
            "categoryScores": {
                cat: {"earned": e, "max": m}
                for cat, (e, m) in self.category_scores().items()
            },
            "checks": [c.to_dict() for c in self.checks],
        }


def run_doctor(config: McpoyleConfig) -> DoctorResult:
    """Run all health checks and return results."""
    result = DoctorResult(
        server_count=len(config.servers),
        group_count=len(config.groups),
        plugin_count=len(config.plugins),
        skill_count=len(config.skills),
    )

    _check_missing_env_vars(config, result)
    _check_unreachable_binaries(config, result)
    _check_config_parse_errors(result)
    _check_orphaned_entries(config, result)
    _check_stale_configs(config, result)
    _check_drift(config, result)
    _check_missing_tool_metadata(config, result)
    _check_cross_client_parity(config, result)
    _check_skill_symlinks(config, result)
    _check_skill_dependencies(config, result)

    return result


def _check_missing_env_vars(config: McpoyleConfig, result: DoctorResult) -> None:
    """Check for env vars that reference op:// or are empty."""
    for server in config.servers:
        if not server.enabled:
            continue
        for key, val in server.env.items():
            if not val:
                result.checks.append(Check(
                    id=f"env-empty-{server.name}-{key}",
                    severity="error",
                    client="central",
                    message=f"server \"{server.name}\" has empty env var {key}",
                    category="existence",
                    max_points=2,
                    earned_points=0,
                    fix=f"Set a value for {key} in server '{server.name}'",
                ))
            elif val.startswith("op://"):
                # op:// references are valid but worth noting if the op CLI isn't available
                if not shutil.which("op"):
                    result.checks.append(Check(
                        id=f"env-op-{server.name}-{key}",
                        severity="warning",
                        client="central",
                        message=f"server \"{server.name}\" env var {key} uses op:// but 1Password CLI not found",
                        category="existence",
                        max_points=1,
                        earned_points=0,
                        fix="Install 1Password CLI: brew install --cask 1password-cli",
                    ))
                else:
                    result.checks.append(Check(
                        id=f"env-op-ok-{server.name}-{key}",
                        severity="info",
                        client="central",
                        message=f"server \"{server.name}\" env var {key} uses op:// (1Password CLI available)",
                        category="existence",
                        max_points=1,
                        earned_points=1,
                    ))


def _check_unreachable_binaries(config: McpoyleConfig, result: DoctorResult) -> None:
    """Check if server command binaries are on $PATH."""
    for server in config.servers:
        if not server.enabled or not server.command:
            continue
        if not shutil.which(server.command):
            result.checks.append(Check(
                id=f"binary-{server.name}",
                severity="warning",
                client="central",
                message=f"server \"{server.name}\" command \"{server.command}\" not found on $PATH",
                category="existence",
                max_points=2,
                earned_points=0,
                fix=f"Install or add {server.command} to $PATH",
            ))
        else:
            result.checks.append(Check(
                id=f"binary-ok-{server.name}",
                severity="info",
                client="central",
                message=f"server \"{server.name}\" binary reachable",
                category="existence",
                max_points=2,
                earned_points=2,
            ))


def _check_config_parse_errors(result: DoctorResult) -> None:
    """Check if client config files contain valid JSON or TOML."""
    import tomllib

    for client_id, client_def in CLIENTS.items():
        for path in client_def.resolved_paths:
            if not path.exists():
                continue
            try:
                if path.suffix == ".toml" or client_def.config_format == "toml":
                    with open(path, "rb") as f:
                        tomllib.load(f)
                else:
                    json.loads(path.read_text())
                result.checks.append(Check(
                    id=f"parse-ok-{client_id}",
                    severity="info",
                    client=client_def.name,
                    message="config file valid",
                    category="existence",
                    max_points=2,
                    earned_points=2,
                ))
            except (json.JSONDecodeError, OSError, tomllib.TOMLDecodeError) as e:
                fmt = "TOML" if path.suffix == ".toml" else "JSON"
                result.checks.append(Check(
                    id=f"parse-{client_id}",
                    severity="error",
                    client=client_def.name,
                    message=f"config file contains invalid {fmt}: {e}",
                    category="existence",
                    max_points=2,
                    earned_points=0,
                    fix=f"Fix the {fmt} syntax in {path}",
                ))


def _check_orphaned_entries(config: McpoyleConfig, result: DoctorResult) -> None:
    """Check for __mcpoyle-marked entries in client configs not in central registry."""
    registry_names = {s.name for s in config.servers}

    for client_id, client_def in CLIENTS.items():
        for path in client_def.resolved_paths:
            if not path.exists():
                continue
            try:
                client_config = read_client_config(path)
            except (json.JSONDecodeError, OSError, Exception):
                continue  # already reported by parse error check
            managed = get_managed_servers(client_config, client_def.servers_key)
            orphaned = set(managed.keys()) - registry_names
            if orphaned:
                names = ", ".join(sorted(orphaned))
                result.checks.append(Check(
                    id=f"orphaned-{client_id}",
                    severity="warning",
                    client=client_def.name,
                    message=f"{len(orphaned)} orphaned entries: {names} (run mcp sync to clean up)",
                    category="grounding",
                    max_points=2,
                    earned_points=0,
                    fix="Run 'mcp sync' to clean up orphaned entries",
                ))
            else:
                result.checks.append(Check(
                    id=f"orphaned-ok-{client_id}",
                    severity="info",
                    client=client_def.name,
                    message="no orphaned entries",
                    category="grounding",
                    max_points=2,
                    earned_points=2,
                ))


def _check_stale_configs(config: McpoyleConfig, result: DoctorResult) -> None:
    """Check for clients that haven't been synced since config changes."""
    if not config.clients:
        return

    for assignment in config.clients:
        client_def = CLIENTS.get(assignment.id)
        if not client_def:
            continue
        if not client_def.is_installed:
            continue
        if not assignment.last_synced:
            result.checks.append(Check(
                id=f"stale-{assignment.id}",
                severity="warning",
                client=client_def.name,
                message="has never been synced",
                category="freshness",
                max_points=2,
                earned_points=0,
                fix=f"Run 'mcp sync {assignment.id}'",
            ))
        else:
            result.checks.append(Check(
                id=f"stale-ok-{assignment.id}",
                severity="info",
                client=client_def.name,
                message=f"last synced {assignment.last_synced[:19]}",
                category="freshness",
                max_points=2,
                earned_points=2,
            ))


def _check_drift(config: McpoyleConfig, result: DoctorResult) -> None:
    """Check for managed entries that were modified outside mcpoyle."""
    for assignment in config.clients:
        if not assignment.server_hashes:
            continue
        client_def = CLIENTS.get(assignment.id)
        if not client_def:
            continue

        for path in client_def.resolved_paths:
            if not path.exists():
                continue
            try:
                client_config = read_client_config(path)
            except (json.JSONDecodeError, OSError, Exception):
                continue
            managed = get_managed_servers(client_config, client_def.servers_key)

            drifted = []
            for name, entry in managed.items():
                if name in assignment.server_hashes:
                    current_hash = compute_entry_hash(entry)
                    if current_hash != assignment.server_hashes[name]:
                        drifted.append(name)

            if drifted:
                # Add origin context to drift messages
                details = []
                for name in sorted(drifted):
                    server = config.get_server(name)
                    if server and server.origin and server.origin.source:
                        origin_str = f" (origin: {server.origin.source}"
                        if server.origin.registry_id:
                            origin_str += f", {server.origin.registry_id}"
                        origin_str += ")"
                        details.append(f"{name}{origin_str}")
                    else:
                        details.append(name)
                names = ", ".join(details)
                result.checks.append(Check(
                    id=f"drift-{assignment.id}",
                    severity="warning",
                    client=client_def.name,
                    message=f"{len(drifted)} entries modified outside mcpoyle: {names}",
                    category="freshness",
                    max_points=2,
                    earned_points=0,
                    fix="Run 'mcp sync --force' to overwrite or 'mcp sync --adopt' to keep",
                ))


def _check_missing_tool_metadata(config: McpoyleConfig, result: DoctorResult) -> None:
    """Check for enabled servers with no tool metadata — informational only."""
    missing = [s.name for s in config.servers if s.enabled and not s.tools]
    if missing:
        names = ", ".join(sorted(missing))
        result.checks.append(Check(
            id="tools-missing",
            severity="info",
            client="central",
            message=f"{len(missing)} server(s) have no tool metadata: {names} (run 'mcp registry show' to populate)",
            category="grounding",
            max_points=1,
            earned_points=0,
            fix="Run 'mcp registry show <server>' to fetch tool metadata",
        ))


def _check_cross_client_parity(config: McpoyleConfig, result: DoctorResult) -> None:
    """Check if clients with the same group have consistent server sets."""
    group_clients: dict[str, list[str]] = {}
    for assignment in config.clients:
        if assignment.group:
            group_clients.setdefault(assignment.group, []).append(assignment.id)

    for group_name, client_ids in group_clients.items():
        if len(client_ids) < 2:
            continue
        group = config.get_group(group_name)
        if not group:
            continue

        # All clients with the same group should receive the same servers
        result.checks.append(Check(
            id=f"parity-{group_name}",
            severity="info",
            client="central",
            message=f"group '{group_name}' assigned to {len(client_ids)} clients: {', '.join(client_ids)}",
            category="parity",
            max_points=1,
            earned_points=1,
        ))


def _check_skill_symlinks(config: McpoyleConfig, result: DoctorResult) -> None:
    """Check for broken skill symlinks in client skills directories."""
    for client_id, client_def in CLIENTS.items():
        if not client_def.skills_dir:
            continue
        if not client_def.is_installed:
            continue

        skills_dir = Path(client_def.skills_dir).expanduser()
        if not skills_dir.exists():
            continue

        broken = []
        for d in skills_dir.iterdir():
            if d.is_symlink() and not d.exists():
                broken.append(d.name)

        if broken:
            names = ", ".join(sorted(broken))
            result.checks.append(Check(
                id=f"skill-symlink-{client_id}",
                severity="warning",
                client=client_def.name,
                message=f"{len(broken)} broken skill symlink(s): {names}",
                category="skills-health",
                max_points=2,
                earned_points=0,
                fix="Run 'mcp skills sync' to repair symlinks",
            ))
        else:
            result.checks.append(Check(
                id=f"skill-symlink-ok-{client_id}",
                severity="info",
                client=client_def.name,
                message="all skill symlinks valid",
                category="skills-health",
                max_points=2,
                earned_points=2,
            ))


def _check_skill_dependencies(config: McpoyleConfig, result: DoctorResult) -> None:
    """Check for skills with unresolved server dependencies."""
    for skill in config.skills:
        if not skill.enabled or not skill.dependencies:
            continue
        missing = [d for d in skill.dependencies if not config.get_server(d)]
        if missing:
            names = ", ".join(missing)
            result.checks.append(Check(
                id=f"skill-dep-{skill.name}",
                severity="warning",
                client="central",
                message=f"skill '{skill.name}' depends on missing server(s): {names}",
                category="skills-health",
                max_points=2,
                earned_points=0,
                fix=f"Add server(s) {names} or remove the dependency from skill '{skill.name}'",
            ))
        else:
            result.checks.append(Check(
                id=f"skill-dep-ok-{skill.name}",
                severity="info",
                client="central",
                message=f"skill '{skill.name}' dependencies satisfied",
                category="skills-health",
                max_points=2,
                earned_points=2,
            ))
