"""Tests for the init command."""

from unittest.mock import patch

from click.testing import CliRunner

from mcpoyle.cli import cli
from mcpoyle.config import McpoyleConfig, Server


@patch("mcpoyle.cli.load_config")
@patch("mcpoyle.cli.save_config")
@patch("mcpoyle.sync.sync_all")
def test_init_auto_no_clients(mock_sync_all, mock_save, mock_load):
    """--auto with no installed clients exits gracefully."""
    mock_load.return_value = McpoyleConfig()
    mock_sync_all.return_value = {}

    with patch("mcpoyle.clients.ClientDef.is_installed", new_callable=lambda: property(lambda self: False)):
        runner = CliRunner()
        result = runner.invoke(cli, ["init", "--auto"])
        assert result.exit_code == 0
        assert "No clients detected" in result.output


@patch("mcpoyle.cli.load_config")
@patch("mcpoyle.cli.save_config")
@patch("mcpoyle.sync.sync_all")
@patch("mcpoyle.sync.do_import")
def test_init_auto_with_servers(mock_do_import, mock_sync_all, mock_save, mock_load):
    """--auto imports servers and syncs."""
    from mcpoyle.sync import ImportResult

    cfg = McpoyleConfig(servers=[Server(name="s1", command="echo")])
    mock_load.return_value = cfg
    mock_do_import.return_value = ImportResult(servers=[], project_imports=[])
    mock_sync_all.return_value = {"claude-code": ["Claude Code: synced"]}

    with patch("mcpoyle.clients.ClientDef.is_installed", new_callable=lambda: property(lambda self: self.id == "claude-code")):
        runner = CliRunner()
        result = runner.invoke(cli, ["init", "--auto"])
        assert result.exit_code == 0
        assert "Setup complete" in result.output


@patch("mcpoyle.cli.load_config")
@patch("mcpoyle.cli.save_config")
def test_init_auto_no_servers(mock_save, mock_load):
    """--auto with no servers to import shows appropriate message."""
    from mcpoyle.sync import ImportResult

    mock_load.return_value = McpoyleConfig()

    with patch("mcpoyle.clients.ClientDef.is_installed", new_callable=lambda: property(lambda self: self.id == "claude-code")), \
         patch("mcpoyle.cli.do_import", return_value=ImportResult(servers=[], project_imports=[])):
        runner = CliRunner()
        result = runner.invoke(cli, ["init", "--auto"])
        assert result.exit_code == 0
        # With no servers imported and no existing servers, should say no servers
        assert "No servers to sync" in result.output
