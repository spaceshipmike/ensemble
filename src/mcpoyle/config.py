"""Central config management for mcpoyle."""

from __future__ import annotations

import fcntl
import hashlib
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

CONFIG_DIR = Path.home() / ".config" / "mcpoyle"
CONFIG_PATH = CONFIG_DIR / "config.json"
LOCK_PATH = CONFIG_DIR / "config.lock"


@dataclass
class ServerOrigin:
    """Tracks where a server definition came from."""
    source: str = ""  # "manual", "registry", "import"
    client: str = ""  # client id if imported
    registry_id: str = ""  # registry identifier if from registry
    timestamp: str = ""  # ISO 8601

    @classmethod
    def from_dict(cls, d: dict) -> ServerOrigin:
        if not d or not isinstance(d, dict):
            return cls()
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class ToolInfo:
    """Metadata about a tool provided by a server."""
    name: str
    description: str = ""

    @classmethod
    def from_dict(cls, d: dict) -> ToolInfo:
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class Server:
    name: str
    enabled: bool = True
    transport: str = "stdio"
    command: str = ""
    args: list[str] = field(default_factory=list)
    env: dict[str, str] = field(default_factory=dict)
    # HTTP transport fields
    url: str = ""
    auth_type: str = ""  # "", "bearer", "api-key", "header"
    auth_ref: str = ""  # op:// reference or env var name
    # Provenance
    origin: ServerOrigin = field(default_factory=ServerOrigin)
    # Tool metadata
    tools: list[ToolInfo] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: dict) -> Server:
        # Handle nested origin and tools
        origin_data = d.get("origin")
        tools_data = d.get("tools", [])
        simple_fields = {k: v for k, v in d.items()
                         if k in cls.__dataclass_fields__ and k not in ("origin", "tools")}
        simple_fields["origin"] = ServerOrigin.from_dict(origin_data) if origin_data else ServerOrigin()
        simple_fields["tools"] = [ToolInfo.from_dict(t) if isinstance(t, dict) else ToolInfo(name=str(t))
                                  for t in tools_data]
        return cls(**simple_fields)


@dataclass
class Plugin:
    name: str
    marketplace: str = ""
    enabled: bool = True
    managed: bool = True

    @classmethod
    def from_dict(cls, d: dict) -> Plugin:
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})

    @property
    def qualified_name(self) -> str:
        if self.marketplace:
            return f"{self.name}@{self.marketplace}"
        return self.name


@dataclass
class MarketplaceSource:
    source: str  # "github", "directory", "git", "url"
    repo: str = ""
    path: str = ""
    url: str = ""

    @classmethod
    def from_dict(cls, d: dict) -> MarketplaceSource:
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class Marketplace:
    name: str
    source: MarketplaceSource = field(default_factory=lambda: MarketplaceSource(source="directory"))

    RESERVED_NAMES = frozenset({
        "claude-code-marketplace", "claude-code-plugins", "claude-plugins-official",
        "anthropic-marketplace", "anthropic-plugins", "agent-skills", "life-sciences",
    })

    @classmethod
    def from_dict(cls, d: dict) -> Marketplace:
        source = d.get("source", {})
        return cls(
            name=d["name"],
            source=MarketplaceSource.from_dict(source) if isinstance(source, dict) else MarketplaceSource(source="directory"),
        )


@dataclass
class Settings:
    adopt_unmanaged_plugins: bool = False

    @classmethod
    def from_dict(cls, d: dict) -> Settings:
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class Group:
    name: str
    description: str = ""
    servers: list[str] = field(default_factory=list)
    plugins: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: dict) -> Group:
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class PathRule:
    path: str  # prefix to match (unexpanded, ~ allowed)
    group: str

    @classmethod
    def from_dict(cls, d: dict) -> PathRule:
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})

    @property
    def resolved_path(self) -> str:
        return str(Path(self.path).expanduser().resolve())

    def matches(self, project_path: str) -> bool:
        resolved = str(Path(project_path).expanduser().resolve())
        prefix = self.resolved_path
        if not prefix.endswith("/"):
            prefix += "/"
        return resolved.startswith(prefix)


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
    server_hashes: dict[str, str] = field(default_factory=dict)

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
            server_hashes=d.get("server_hashes", {}),
        )

    def get_project(self, path: str) -> ProjectAssignment | None:
        return next((p for p in self.projects if p.path == path), None)


@dataclass
class McpoyleConfig:
    servers: list[Server] = field(default_factory=list)
    groups: list[Group] = field(default_factory=list)
    clients: list[ClientAssignment] = field(default_factory=list)
    plugins: list[Plugin] = field(default_factory=list)
    marketplaces: list[Marketplace] = field(default_factory=list)
    rules: list[PathRule] = field(default_factory=list)
    settings: Settings = field(default_factory=Settings)

    @classmethod
    def from_dict(cls, d: dict) -> McpoyleConfig:
        return cls(
            servers=[Server.from_dict(s) for s in d.get("servers", [])],
            groups=[Group.from_dict(g) for g in d.get("groups", [])],
            clients=[ClientAssignment.from_dict(c) for c in d.get("clients", [])],
            plugins=[Plugin.from_dict(p) for p in d.get("plugins", [])],
            marketplaces=[Marketplace.from_dict(m) for m in d.get("marketplaces", [])],
            rules=[PathRule.from_dict(r) for r in d.get("rules", [])],
            settings=Settings.from_dict(d.get("settings", {})),
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

    def get_plugin(self, name: str) -> Plugin | None:
        return next((p for p in self.plugins if p.name == name or p.qualified_name == name), None)

    def get_marketplace(self, name: str) -> Marketplace | None:
        return next((m for m in self.marketplaces if m.name == name), None)

    def match_rule(self, project_path: str) -> PathRule | None:
        """Find the first path rule matching a project path (longest prefix wins)."""
        resolved = str(Path(project_path).expanduser().resolve())
        matches = [r for r in self.rules if r.matches(resolved)]
        if not matches:
            return None
        # Longest prefix = most specific match
        return max(matches, key=lambda r: len(r.resolved_path))

    def resolve_servers(self, client_id: str, group_name: str | None = None) -> list[Server]:
        """Get the servers a client should receive."""
        if group_name is None:
            assignment = self.get_client(client_id)
            if assignment and assignment.group:
                group_name = assignment.group

        if group_name:
            group = self.get_group(group_name)
            if not group:
                return []
            return [s for s in self.servers if s.enabled and s.name in group.servers]
        return [s for s in self.servers if s.enabled]

    def resolve_plugins(self, client_id: str, group_name: str | None = None) -> list[Plugin]:
        """Get the plugins a client should receive."""
        if group_name is None:
            assignment = self.get_client(client_id)
            if assignment and assignment.group:
                group_name = assignment.group

        if group_name:
            group = self.get_group(group_name)
            if not group:
                return []
            return [p for p in self.plugins if p.enabled and p.name in group.plugins]
        return [p for p in self.plugins if p.enabled]


def compute_entry_hash(entry: dict) -> str:
    """Compute a SHA-256 hash of a server entry dict in canonical form.

    Strips the __mcpoyle marker before hashing so the hash reflects
    only the meaningful config content (command, args, env, etc.).
    """
    canonical = {k: v for k, v in sorted(entry.items()) if k != "__mcpoyle"}
    return hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()


def load_config() -> McpoyleConfig:
    if not CONFIG_PATH.exists():
        return McpoyleConfig()
    data = json.loads(CONFIG_PATH.read_text())
    return McpoyleConfig.from_dict(data)


def save_config(config: McpoyleConfig) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    # Use a file lock to prevent concurrent writes from clobbering each other
    with open(LOCK_PATH, "w") as lock_f:
        fcntl.flock(lock_f, fcntl.LOCK_EX)
        try:
            CONFIG_PATH.write_text(json.dumps(config.to_dict(), indent=2) + "\n")
        finally:
            fcntl.flock(lock_f, fcntl.LOCK_UN)
