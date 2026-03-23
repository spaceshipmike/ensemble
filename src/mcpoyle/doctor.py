"""Deterministic config health audit — no network calls, no LLM."""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, field
from pathlib import Path

from mcpoyle.clients import CLIENTS, get_managed_servers, read_client_config
from mcpoyle.config import McpoyleConfig, compute_entry_hash


@dataclass
class Check:
    """A single health check result."""
    severity: str  # "error", "warning", "info"
    client: str  # client name or "central"
    message: str

    def to_dict(self) -> dict:
        return {"severity": self.severity, "client": self.client, "message": self.message}


@dataclass
class DoctorResult:
    """Aggregate result of all health checks."""
    checks: list[Check] = field(default_factory=list)
    server_count: int = 0
    group_count: int = 0
    plugin_count: int = 0

    @property
    def errors(self) -> int:
        return sum(1 for c in self.checks if c.severity == "error")

    @property
    def warnings(self) -> int:
        return sum(1 for c in self.checks if c.severity == "warning")

    def to_dict(self) -> dict:
        return {
            "server_count": self.server_count,
            "group_count": self.group_count,
            "plugin_count": self.plugin_count,
            "errors": self.errors,
            "warnings": self.warnings,
            "checks": [c.to_dict() for c in self.checks],
        }


def run_doctor(config: McpoyleConfig) -> DoctorResult:
    """Run all health checks and return results."""
    result = DoctorResult(
        server_count=len(config.servers),
        group_count=len(config.groups),
        plugin_count=len(config.plugins),
    )

    _check_missing_env_vars(config, result)
    _check_unreachable_binaries(config, result)
    _check_config_parse_errors(result)
    _check_orphaned_entries(config, result)
    _check_stale_configs(config, result)
    _check_drift(config, result)

    return result


def _check_missing_env_vars(config: McpoyleConfig, result: DoctorResult) -> None:
    """Check for env vars that reference op:// or are empty."""
    for server in config.servers:
        if not server.enabled:
            continue
        for key, val in server.env.items():
            if not val:
                result.checks.append(Check(
                    severity="error",
                    client="central",
                    message=f"server \"{server.name}\" has empty env var {key}",
                ))
            elif val.startswith("op://"):
                # op:// references are valid but worth noting if the op CLI isn't available
                if not shutil.which("op"):
                    result.checks.append(Check(
                        severity="warning",
                        client="central",
                        message=f"server \"{server.name}\" env var {key} uses op:// but 1Password CLI not found",
                    ))


def _check_unreachable_binaries(config: McpoyleConfig, result: DoctorResult) -> None:
    """Check if server command binaries are on $PATH."""
    for server in config.servers:
        if not server.enabled or not server.command:
            continue
        if not shutil.which(server.command):
            result.checks.append(Check(
                severity="warning",
                client="central",
                message=f"server \"{server.name}\" command \"{server.command}\" not found on $PATH",
            ))


def _check_config_parse_errors(result: DoctorResult) -> None:
    """Check if client config files contain valid JSON (or TOML for Codex)."""
    for client_id, client_def in CLIENTS.items():
        for path in client_def.resolved_paths:
            if not path.exists():
                continue
            # Skip TOML files (e.g., Codex CLI uses config.toml)
            if path.suffix == ".toml":
                continue
            try:
                json.loads(path.read_text())
            except (json.JSONDecodeError, OSError) as e:
                result.checks.append(Check(
                    severity="error",
                    client=client_def.name,
                    message=f"config file contains invalid JSON: {e}",
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
            except (json.JSONDecodeError, OSError):
                continue  # already reported by parse error check
            managed = get_managed_servers(client_config, client_def.servers_key)
            orphaned = set(managed.keys()) - registry_names
            if orphaned:
                names = ", ".join(sorted(orphaned))
                result.checks.append(Check(
                    severity="warning",
                    client=client_def.name,
                    message=f"{len(orphaned)} orphaned entries: {names} (run mcpoyle sync to clean up)",
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
                severity="warning",
                client=client_def.name,
                message="has never been synced",
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
            except (json.JSONDecodeError, OSError):
                continue
            managed = get_managed_servers(client_config, client_def.servers_key)

            drifted = []
            for name, entry in managed.items():
                if name in assignment.server_hashes:
                    current_hash = compute_entry_hash(entry)
                    if current_hash != assignment.server_hashes[name]:
                        drifted.append(name)

            if drifted:
                names = ", ".join(sorted(drifted))
                result.checks.append(Check(
                    severity="warning",
                    client=client_def.name,
                    message=f"{len(drifted)} entries modified outside mcpoyle: {names}",
                ))
