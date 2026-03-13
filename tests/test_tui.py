"""Smoke tests for the TUI."""

import pytest
from unittest.mock import patch

from mcpoyle.config import (
    Group,
    Marketplace,
    MarketplaceSource,
    McpoyleConfig,
    Plugin,
    Server,
)


def _make_test_config() -> McpoyleConfig:
    return McpoyleConfig(
        servers=[
            Server(name="ctx", command="npx", args=["tsx", "index.ts"], enabled=True),
            Server(name="prm", command="node", args=["prm.js"], enabled=False),
        ],
        plugins=[
            Plugin(name="clangd-lsp", marketplace="claude-plugins-official", enabled=True),
        ],
        marketplaces=[
            Marketplace(name="homelab", source=MarketplaceSource(source="directory", path="/tmp/mkt")),
        ],
        groups=[
            Group(name="dev-tools", description="Dev servers", servers=["ctx"], plugins=["clangd-lsp"]),
        ],
    )


@pytest.mark.asyncio
@patch("mcpoyle.tui.load_config")
async def test_tui_launches_and_shows_dashboard(mock_load):
    """Verify the TUI app mounts and populates all 5 tables."""
    mock_load.return_value = _make_test_config()

    from mcpoyle.tui import McpoyleApp
    from textual.widgets import DataTable

    async with McpoyleApp().run_test() as pilot:
        app = pilot.app

        # All 5 tables should exist and have data
        servers_table = app.query_one("#servers-table", DataTable)
        assert servers_table.row_count == 2

        plugins_table = app.query_one("#plugins-table", DataTable)
        assert plugins_table.row_count == 1

        mkts_table = app.query_one("#marketplaces-table", DataTable)
        assert mkts_table.row_count == 1

        groups_table = app.query_one("#groups-table", DataTable)
        assert groups_table.row_count == 1

        clients_table = app.query_one("#clients-table", DataTable)
        assert clients_table.row_count > 0  # At least some clients detected


@pytest.mark.asyncio
@patch("mcpoyle.tui.load_config")
async def test_tui_empty_config(mock_load):
    """TUI should render cleanly with no configured items."""
    mock_load.return_value = McpoyleConfig()

    from mcpoyle.tui import McpoyleApp
    from textual.widgets import DataTable

    async with McpoyleApp().run_test() as pilot:
        app = pilot.app
        servers_table = app.query_one("#servers-table", DataTable)
        assert servers_table.row_count == 0


@pytest.mark.asyncio
@patch("mcpoyle.tui.save_config")
@patch("mcpoyle.tui.load_config")
@patch("mcpoyle.operations.read_cc_settings", return_value={})
@patch("mcpoyle.operations.write_cc_settings")
async def test_tui_toggle_server(mock_cc_write, mock_cc_read, mock_load, mock_save):
    """Toggling a server via the 'e' key should flip its enabled state."""
    cfg = _make_test_config()
    mock_load.return_value = cfg

    from mcpoyle.tui import McpoyleApp
    from textual.widgets import DataTable

    async with McpoyleApp().run_test() as pilot:
        app = pilot.app

        # Focus the servers table
        servers_table = app.query_one("#servers-table", DataTable)
        servers_table.focus()
        await pilot.pause()

        # First server (ctx) should be enabled
        assert cfg.get_server("ctx").enabled is True

        # Press 'e' to toggle
        await pilot.press("e")
        await pilot.pause()

        # Server should now be disabled
        assert cfg.get_server("ctx").enabled is False
