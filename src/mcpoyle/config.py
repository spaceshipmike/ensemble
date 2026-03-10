"""Central config management for mcpoyle."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

CONFIG_DIR = Path.home() / ".config" / "mcpoyle"
CONFIG_PATH = CONFIG_DIR / "config.json"


@dataclass
class Server:
    name: str
    enabled: bool = True
    transport: str = "stdio"
    command: str = ""
    args: list[str] = field(default_factory=list)
    env: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: dict) -> Server:
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class Group:
    name: str
    description: str = ""
    servers: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: dict) -> Group:
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class ProjectAssignment:
    path: str
    group: str | None = None
    last_synced: str | None = None

    @classmethod
    def from_dict(cls, d: dict) -> ProjectAssignment:
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class ClientAssignment:
    id: str
    group: str | None = None
    last_synced: str | None = None
    projects: list[ProjectAssignment] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: dict) -> ClientAssignment:
        projects_raw = d.get("projects", {})
        # Support both dict format {"path": {...}} and list format
        projects = []
        if isinstance(projects_raw, dict):
            for path, proj_data in projects_raw.items():
                proj_data["path"] = path
                projects.append(ProjectAssignment.from_dict(proj_data))
        elif isinstance(projects_raw, list):
            projects = [ProjectAssignment.from_dict(p) for p in projects_raw]
        return cls(
            id=d["id"],
            group=d.get("group"),
            last_synced=d.get("last_synced"),
            projects=projects,
        )

    def get_project(self, path: str) -> ProjectAssignment | None:
        return next((p for p in self.projects if p.path == path), None)


@dataclass
class McpoyleConfig:
    servers: list[Server] = field(default_factory=list)
    groups: list[Group] = field(default_factory=list)
    clients: list[ClientAssignment] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: dict) -> McpoyleConfig:
        return cls(
            servers=[Server.from_dict(s) for s in d.get("servers", [])],
            groups=[Group.from_dict(g) for g in d.get("groups", [])],
            clients=[ClientAssignment.from_dict(c) for c in d.get("clients", [])],
        )

    def to_dict(self) -> dict:
        d = asdict(self)
        # Convert projects lists to dict format keyed by path
        for client in d["clients"]:
            projects = client.pop("projects", [])
            if projects:
                client["projects"] = {
                    p["path"]: {k: v for k, v in p.items() if k != "path"}
                    for p in projects
                }
        return d

    def get_server(self, name: str) -> Server | None:
        return next((s for s in self.servers if s.name == name), None)

    def get_group(self, name: str) -> Group | None:
        return next((g for g in self.groups if g.name == name), None)

    def get_client(self, client_id: str) -> ClientAssignment | None:
        return next((c for c in self.clients if c.id == client_id), None)

    def resolve_servers(self, client_id: str, group_name: str | None = None) -> list[Server]:
        """Get the servers a client should receive.

        If group_name is provided, resolve for that specific group.
        Otherwise, use the client's assigned group (or all enabled if none).
        """
        if group_name is None:
            assignment = self.get_client(client_id)
            if assignment and assignment.group:
                group_name = assignment.group

        if group_name:
            group = self.get_group(group_name)
            if not group:
                return []
            return [s for s in self.servers if s.enabled and s.name in group.servers]
        # No group = all enabled servers
        return [s for s in self.servers if s.enabled]


def load_config() -> McpoyleConfig:
    if not CONFIG_PATH.exists():
        return McpoyleConfig()
    data = json.loads(CONFIG_PATH.read_text())
    return McpoyleConfig.from_dict(data)


def save_config(config: McpoyleConfig) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(config.to_dict(), indent=2) + "\n")
