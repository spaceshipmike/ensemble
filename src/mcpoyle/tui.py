"""Textual TUI dashboard for mcpoyle."""

from __future__ import annotations

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.command import Hit, Hits, Provider
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual.widgets import (
    DataTable,
    Footer,
    Header,
    Label,
    Static,
    TabbedContent,
    TabPane,
)

from mcpoyle import operations as ops
from mcpoyle.clients import CLIENTS
from mcpoyle.config import McpoyleConfig, load_config, save_config
from mcpoyle.sync import sync_all, sync_client


# ── Command Palette Provider ────────────────────────────────────


class McpoyleCommands(Provider):
    """Command palette provider for mcpoyle actions."""

    async def search(self, query: str) -> Hits:
        app = self.app
        if not isinstance(app, McpoyleApp):
            return

        commands = [
            ("Sync All Clients", "sync-all", "Sync servers and plugins to all detected clients"),
            ("Enable Selected", "enable", "Enable the selected server or plugin"),
            ("Disable Selected", "disable", "Disable the selected server or plugin"),
            ("Remove Selected", "remove", "Remove the selected server or plugin"),
            ("Refresh Dashboard", "refresh", "Reload config from disk"),
        ]

        # Add per-client sync commands
        for cid, cdef in CLIENTS.items():
            if cdef.is_installed:
                commands.append((f"Sync {cdef.name}", f"sync-{cid}", f"Sync to {cdef.name}"))

        # Add group assignment commands
        cfg = app.cfg
        for group in cfg.groups:
            commands.append((
                f"Assign to Group: {group.name}",
                f"assign-group-{group.name}",
                f"Assign selected server to group '{group.name}'",
            ))

        query_lower = query.lower()
        for label, action_id, help_text in commands:
            if query_lower in label.lower() or query_lower in help_text.lower():
                yield Hit(
                    score=1 if query_lower in label.lower() else 0,
                    match_display=label,
                    command=self._make_callback(app, action_id),
                    help=help_text,
                )

    @staticmethod
    def _make_callback(app: McpoyleApp, action_id: str):
        async def callback() -> None:
            await app.run_palette_action(action_id)
        return callback


# ── Sync Preview Modal ──────────────────────────────────────────


class SyncPreviewScreen(ModalScreen[bool]):
    """Shows a dry-run preview of sync changes and asks for confirmation."""

    BINDINGS = [
        Binding("enter", "confirm", "Confirm"),
        Binding("escape", "cancel", "Cancel"),
    ]

    def __init__(self, preview_text: str) -> None:
        super().__init__()
        self.preview_text = preview_text

    def compose(self) -> ComposeResult:
        with Vertical(id="sync-preview-modal"):
            yield Label("Sync Preview (dry run)", id="sync-preview-title")
            yield Static(self.preview_text, id="sync-preview-body")
            yield Label("Press [b]Enter[/b] to apply, [b]Esc[/b] to cancel", id="sync-preview-hint")

    def action_confirm(self) -> None:
        self.dismiss(True)

    def action_cancel(self) -> None:
        self.dismiss(False)


# ── Main App ────────────────────────────────────────────────────


class McpoyleApp(App):
    """mcpoyle TUI dashboard."""

    TITLE = "mcpoyle"
    SUB_TITLE = "MCP Server & Plugin Manager"
    COMMANDS = {McpoyleCommands}

    CSS = """
    TabbedContent {
        height: 1fr;
    }
    DataTable {
        height: 1fr;
    }
    .section-label {
        padding: 0 1;
        background: $primary-background;
        color: $text;
        text-style: bold;
        margin: 0 0 0 0;
    }
    #servers-section, #plugins-section {
        height: 1fr;
    }
    #sync-preview-modal {
        align: center middle;
        width: 80%;
        height: 80%;
        border: thick $primary;
        background: $surface;
        padding: 1 2;
    }
    #sync-preview-title {
        text-style: bold;
        padding: 0 0 1 0;
    }
    #sync-preview-body {
        height: 1fr;
        overflow-y: auto;
    }
    #sync-preview-hint {
        dock: bottom;
        padding: 1 0 0 0;
    }
    """

    BINDINGS = [
        Binding("ctrl+p", "command_palette", "Command Palette"),
        Binding("1", "tab_1", "Servers & Plugins", show=False),
        Binding("2", "tab_2", "Groups", show=False),
        Binding("3", "tab_3", "Clients", show=False),
        Binding("4", "tab_4", "Marketplaces", show=False),
        Binding("5", "tab_5", "Projects", show=False),
        Binding("s", "sync_all", "Sync All"),
        Binding("r", "refresh", "Refresh"),
        Binding("e", "toggle_enable", "Enable/Disable"),
        Binding("d", "remove_item", "Remove"),
        Binding("q", "quit", "Quit"),
    ]

    def __init__(self) -> None:
        super().__init__()
        self.cfg = load_config()

    def compose(self) -> ComposeResult:
        yield Header()
        with TabbedContent("Servers & Plugins", "Groups", "Clients", "Marketplaces", "Projects"):
            with TabPane("Servers & Plugins", id="tab-servers-plugins"):
                with Vertical(id="servers-section"):
                    yield Label("Servers", classes="section-label")
                    yield DataTable(id="servers-table")
                with Vertical(id="plugins-section"):
                    yield Label("Plugins", classes="section-label")
                    yield DataTable(id="plugins-table")
            with TabPane("Groups", id="tab-groups"):
                yield DataTable(id="groups-table")
            with TabPane("Clients", id="tab-clients"):
                yield DataTable(id="clients-table")
            with TabPane("Marketplaces", id="tab-marketplaces"):
                yield DataTable(id="marketplaces-table")
            with TabPane("Projects", id="tab-projects"):
                yield DataTable(id="projects-table")
        yield Footer()

    def on_mount(self) -> None:
        self._setup_tables()
        self._populate_all()

    def _setup_tables(self) -> None:
        servers = self.query_one("#servers-table", DataTable)
        servers.add_columns("Name", "Status", "Command", "Groups")
        servers.cursor_type = "row"

        plugins = self.query_one("#plugins-table", DataTable)
        plugins.add_columns("Name", "Status", "Marketplace", "Managed")
        plugins.cursor_type = "row"

        groups = self.query_one("#groups-table", DataTable)
        groups.add_columns("Name", "Servers", "Plugins", "Description")
        groups.cursor_type = "row"

        clients = self.query_one("#clients-table", DataTable)
        clients.add_columns("Name", "Installed", "Group", "Last Sync")
        clients.cursor_type = "row"

        mkts = self.query_one("#marketplaces-table", DataTable)
        mkts.add_columns("Name", "Source", "Detail")
        mkts.cursor_type = "row"

        projects = self.query_one("#projects-table", DataTable)
        projects.add_columns("Name", "Type", "Group", "Servers", "Path")
        projects.cursor_type = "row"

    def _populate_all(self) -> None:
        self._populate_servers()
        self._populate_plugins()
        self._populate_groups()
        self._populate_clients()
        self._populate_marketplaces()
        self._populate_projects()

    def _populate_servers(self) -> None:
        table = self.query_one("#servers-table", DataTable)
        table.clear()
        for s in self.cfg.servers:
            status = "ON" if s.enabled else "OFF"
            groups = ", ".join(g.name for g in self.cfg.groups if s.name in g.servers) or "—"
            cmd = f"{s.command} {' '.join(s.args)}".strip()
            table.add_row(s.name, status, cmd, groups, key=s.name)

    def _populate_plugins(self) -> None:
        table = self.query_one("#plugins-table", DataTable)
        table.clear()
        for p in self.cfg.plugins:
            status = "ON" if p.enabled else "OFF"
            managed = "yes" if p.managed else "no"
            table.add_row(p.name, status, p.marketplace, managed, key=p.name)

    def _populate_groups(self) -> None:
        table = self.query_one("#groups-table", DataTable)
        table.clear()
        for g in self.cfg.groups:
            table.add_row(
                g.name,
                str(len(g.servers)),
                str(len(g.plugins)),
                g.description or "—",
                key=g.name,
            )

    def _populate_clients(self) -> None:
        table = self.query_one("#clients-table", DataTable)
        table.clear()
        for cid, cdef in CLIENTS.items():
            installed = "Yes" if cdef.is_installed else "No"
            assignment = self.cfg.get_client(cid)
            group = "—"
            last_sync = "never"
            if assignment:
                group = assignment.group or "all servers"
                if assignment.last_synced:
                    last_sync = assignment.last_synced[:19]
            table.add_row(cdef.name, installed, group, last_sync, key=cid)

    def _populate_marketplaces(self) -> None:
        table = self.query_one("#marketplaces-table", DataTable)
        table.clear()
        for m in self.cfg.marketplaces:
            detail = m.source.repo or m.source.path or m.source.url or ""
            table.add_row(m.name, m.source.source, detail, key=m.name)

    def _populate_projects(self) -> None:
        from mcpoyle.projects import is_available, list_projects

        table = self.query_one("#projects-table", DataTable)
        table.clear()
        if not is_available():
            return

        for p in list_projects():
            # Find group assignment for this project's paths
            group_info = "—"
            for path in p.paths:
                for client in self.cfg.clients:
                    proj_assign = client.get_project(path)
                    if proj_assign and proj_assign.group:
                        group_info = proj_assign.group
                        break
                if group_info != "—":
                    break

            # Count servers in scope
            if group_info != "—":
                group = self.cfg.get_group(group_info)
                server_count = str(len(group.servers)) if group else "0"
            else:
                server_count = str(len([s for s in self.cfg.servers if s.enabled]))

            primary_path = p.paths[0] if p.paths else "—"
            table.add_row(p.display_name, p.type, group_info, server_count, primary_path, key=p.name)

    def _reload_config(self) -> None:
        self.cfg = load_config()
        self._populate_all()

    def _save_and_refresh(self) -> None:
        save_config(self.cfg)
        self._populate_all()

    def _get_focused_table(self) -> DataTable | None:
        focused = self.focused
        if isinstance(focused, DataTable):
            return focused
        return None

    def _get_selected_key(self, table: DataTable) -> str | None:
        if table.row_count == 0:
            return None
        row_key, _ = table.coordinate_to_cell_key(table.cursor_coordinate)
        return str(row_key.value) if row_key.value is not None else None

    def _get_focused_panel_type(self) -> str | None:
        table = self._get_focused_table()
        if table is None:
            return None
        table_id = table.id or ""
        if "servers" in table_id:
            return "server"
        if "plugins" in table_id:
            return "plugin"
        if "marketplaces" in table_id:
            return "marketplace"
        if "groups" in table_id:
            return "group"
        if "clients" in table_id:
            return "client"
        return None

    # ── Tab switching ───────────────────────────────────────────

    def _switch_tab(self, tab_id: str) -> None:
        tabbed = self.query_one(TabbedContent)
        tabbed.active = tab_id

    def action_tab_1(self) -> None:
        self._switch_tab("tab-servers-plugins")

    def action_tab_2(self) -> None:
        self._switch_tab("tab-groups")

    def action_tab_3(self) -> None:
        self._switch_tab("tab-clients")

    def action_tab_4(self) -> None:
        self._switch_tab("tab-marketplaces")

    def action_tab_5(self) -> None:
        self._switch_tab("tab-projects")

    # ── Actions ─────────────────────────────────────────────────

    def action_refresh(self) -> None:
        self._reload_config()
        self.notify("Refreshed from config")

    def action_toggle_enable(self) -> None:
        table = self._get_focused_table()
        if not table:
            return
        key = self._get_selected_key(table)
        if not key:
            return

        panel_type = self._get_focused_panel_type()
        if panel_type == "server":
            server = self.cfg.get_server(key)
            if server:
                if server.enabled:
                    result = ops.disable_server(self.cfg, key)
                else:
                    result = ops.enable_server(self.cfg, key)
                if result.ok:
                    self._save_and_refresh()
                    self.notify(result.messages[0] if result.messages else "Done")
                else:
                    self.notify(result.error, severity="error")
        elif panel_type == "plugin":
            plugin = self.cfg.get_plugin(key)
            if plugin:
                if plugin.enabled:
                    result = ops.disable_plugin(self.cfg, key)
                else:
                    result = ops.enable_plugin(self.cfg, key)
                if result.ok:
                    self._save_and_refresh()
                    self.notify(result.messages[0] if result.messages else "Done")
                else:
                    self.notify(result.error, severity="error")

    def action_remove_item(self) -> None:
        table = self._get_focused_table()
        if not table:
            return
        key = self._get_selected_key(table)
        if not key:
            return

        panel_type = self._get_focused_panel_type()
        if panel_type == "server":
            result = ops.remove_server(self.cfg, key)
        elif panel_type == "plugin":
            result = ops.uninstall_plugin(self.cfg, key)
        elif panel_type == "marketplace":
            result = ops.remove_marketplace(self.cfg, key)
        else:
            return

        if result.ok:
            self._save_and_refresh()
            self.notify(result.messages[0] if result.messages else "Removed")
        else:
            self.notify(result.error, severity="error")

    def action_sync_all(self) -> None:
        self._do_sync_preview()

    def _do_sync_preview(self, client_id: str | None = None) -> None:
        """Show sync preview then execute if confirmed."""
        if client_id:
            actions = sync_client(self.cfg, client_id, dry_run=True)
            preview_lines = actions
        else:
            results = sync_all(self.cfg, dry_run=True)
            preview_lines = []
            for cid, actions in results.items():
                preview_lines.extend(actions)

        if not preview_lines:
            self.notify("No changes to sync")
            return

        preview_text = "\n".join(preview_lines)

        def on_result(confirmed: bool) -> None:
            if confirmed:
                if client_id:
                    sync_client(self.cfg, client_id, dry_run=False)
                else:
                    sync_all(self.cfg, dry_run=False)
                save_config(self.cfg)
                self._reload_config()
                self.notify("Sync complete")
            else:
                self.notify("Sync cancelled")

        self.push_screen(SyncPreviewScreen(preview_text), on_result)

    async def run_palette_action(self, action_id: str) -> None:
        """Execute a command palette action."""
        if action_id == "sync-all":
            self._do_sync_preview()
        elif action_id.startswith("sync-"):
            client_id = action_id[5:]
            self._do_sync_preview(client_id)
        elif action_id == "enable":
            self.action_toggle_enable()
        elif action_id == "disable":
            self.action_toggle_enable()
        elif action_id == "remove":
            self.action_remove_item()
        elif action_id == "refresh":
            self.action_refresh()
        elif action_id.startswith("assign-group-"):
            group_name = action_id[len("assign-group-"):]
            self._assign_to_group(group_name)

    def _assign_to_group(self, group_name: str) -> None:
        table = self._get_focused_table()
        if not table:
            return
        key = self._get_selected_key(table)
        if not key:
            return

        panel_type = self._get_focused_panel_type()
        if panel_type == "server":
            result = ops.add_server_to_group(self.cfg, group_name, key)
        elif panel_type == "plugin":
            result = ops.add_plugin_to_group(self.cfg, group_name, key)
        else:
            self.notify("Select a server or plugin first", severity="warning")
            return

        if result.ok:
            self._save_and_refresh()
            self.notify(result.messages[0] if result.messages else "Assigned")
        else:
            self.notify(result.error, severity="error")


def main() -> None:
    """Entry point for the TUI."""
    app = McpoyleApp()
    app.run()
