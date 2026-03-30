"""Tests for the init command."""

from pathlib import Path
from unittest.mock import patch

from click.testing import CliRunner

from mcpoyle.cli import cli
from mcpoyle.config import McpoyleConfig, Server, Skill


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


@patch("mcpoyle.cli.load_config")
@patch("mcpoyle.cli.save_config")
@patch("mcpoyle.sync.sync_all")
@patch("mcpoyle.sync.do_import")
def test_init_auto_installs_meta_skill(mock_do_import, mock_sync_all, mock_save, mock_load, tmp_path, monkeypatch):
    """Init should install the mcpoyle-usage meta-skill."""
    from mcpoyle.sync import ImportResult

    monkeypatch.setattr("mcpoyle.skills.SKILLS_DIR", tmp_path / "skills")
    monkeypatch.setattr("mcpoyle.config.SKILLS_DIR", tmp_path / "skills")

    cfg = McpoyleConfig(servers=[Server(name="s1", command="echo")])
    mock_load.return_value = cfg
    mock_do_import.return_value = ImportResult(servers=[], project_imports=[])
    mock_sync_all.return_value = {"claude-code": ["synced"]}

    with patch("mcpoyle.clients.ClientDef.is_installed", new_callable=lambda: property(lambda self: self.id == "claude-code")):
        runner = CliRunner()
        result = runner.invoke(cli, ["init", "--auto"])
        assert result.exit_code == 0
        assert "mcpoyle-usage" in result.output
        assert cfg.get_skill("mcpoyle-usage") is not None


@patch("mcpoyle.cli.load_config")
@patch("mcpoyle.cli.save_config")
@patch("mcpoyle.sync.sync_all")
@patch("mcpoyle.sync.do_import")
def test_init_auto_imports_skills_from_client(mock_do_import, mock_sync_all, mock_save, mock_load, tmp_path, monkeypatch):
    """Init should discover and import skills from client skills directories."""
    from mcpoyle.sync import ImportResult

    monkeypatch.setattr("mcpoyle.skills.SKILLS_DIR", tmp_path / "canonical")
    monkeypatch.setattr("mcpoyle.config.SKILLS_DIR", tmp_path / "canonical")

    # Create a skill in a client's skills dir
    from mcpoyle.clients import ClientDef
    client_skills = tmp_path / "client_skills"
    (client_skills / "existing-skill").mkdir(parents=True)
    (client_skills / "existing-skill" / "SKILL.md").write_text(
        "---\nname: existing-skill\ndescription: Test\n---\n\nContent"
    )

    cfg = McpoyleConfig(servers=[Server(name="s1", command="echo")])
    mock_load.return_value = cfg
    mock_do_import.return_value = ImportResult(servers=[], project_imports=[])
    mock_sync_all.return_value = {"test-client": ["synced"]}

    fake_client = ClientDef(
        id="test-client", name="Test Client", config_path=str(tmp_path / "nonexistent.json"),
        servers_key="mcpServers", detect_paths=[], skills_dir=str(client_skills),
    )

    # Only expose our fake client so real client configs aren't read
    with patch.dict("mcpoyle.cli.CLIENTS", {"test-client": fake_client}, clear=True), \
         patch("mcpoyle.clients.ClientDef.is_installed", new_callable=lambda: property(lambda self: True)):
        runner = CliRunner()
        result = runner.invoke(cli, ["init", "--auto"])
        assert result.exit_code == 0
        assert "existing-skill" in result.output
        assert cfg.get_skill("existing-skill") is not None


@patch("mcpoyle.cli.load_config")
@patch("mcpoyle.cli.save_config")
@patch("mcpoyle.sync.sync_all")
@patch("mcpoyle.sync.do_import")
def test_init_auto_skips_existing_meta_skill(mock_do_import, mock_sync_all, mock_save, mock_load, tmp_path, monkeypatch):
    """Init should not reinstall mcpoyle-usage if already present."""
    from mcpoyle.sync import ImportResult

    monkeypatch.setattr("mcpoyle.skills.SKILLS_DIR", tmp_path / "skills")
    monkeypatch.setattr("mcpoyle.config.SKILLS_DIR", tmp_path / "skills")

    cfg = McpoyleConfig(
        servers=[Server(name="s1", command="echo")],
        skills=[Skill(name="mcpoyle-usage", origin="builtin")],
    )
    mock_load.return_value = cfg
    mock_do_import.return_value = ImportResult(servers=[], project_imports=[])
    mock_sync_all.return_value = {"claude-code": ["synced"]}

    with patch("mcpoyle.clients.ClientDef.is_installed", new_callable=lambda: property(lambda self: self.id == "claude-code")):
        runner = CliRunner()
        result = runner.invoke(cli, ["init", "--auto"])
        assert result.exit_code == 0
        # Should NOT show "Installed builtin skill" since it already exists
        assert "Installed builtin skill" not in result.output
