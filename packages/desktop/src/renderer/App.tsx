import React, { useState } from "react";
import { Sidebar, type SectionId } from "./components/Sidebar";
import { ClientChip } from "./components/ClientChip";
import { ToastProvider } from "./components/Toast";
import { useConfig } from "./hooks/useConfig";
import { PickerPage } from "./pages/PickerPage";
import { ServersPage } from "./pages/ServersPage";
import { SkillsPage } from "./pages/SkillsPage";
import { PluginsPage } from "./pages/PluginsPage";
import { GroupsPage } from "./pages/GroupsPage";
import { ClientsPage } from "./pages/ClientsPage";
import { SyncPage } from "./pages/SyncPage";
import { DoctorPage } from "./pages/DoctorPage";
import { RegistryPage } from "./pages/RegistryPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { RulesPage } from "./pages/RulesPage";

interface ActiveClient {
  id: string;
  name: string;
  index: number;
}

export function App() {
  const [activeSection, setActiveSection] = useState<SectionId>("servers");
  const [activeClient, setActiveClient] = useState<ActiveClient | null>(null);
  const { config, loading, error, mutate } = useConfig();

  if (!activeClient) {
    return (
      <ToastProvider>
        <PickerPage
          onPick={(c) =>
            setActiveClient({
              id: c.id ?? c.name,
              name: c.name ?? c.id ?? "UNKNOWN",
              index: 1,
            })
          }
        />
      </ToastProvider>
    );
  }

  const serverCount = config
    ? (Array.isArray(config.servers) ? config.servers.length : 0)
    : undefined;
  const skillCount = config
    ? (Array.isArray(config.skills) ? config.skills.length : 0)
    : undefined;
  const pluginCount = config
    ? (Array.isArray(config.plugins) ? config.plugins.length : 0)
    : undefined;
  const groupCount = config
    ? (Array.isArray(config.groups) ? config.groups.length : 0)
    : undefined;

  const renderContent = () => {
    if (loading) {
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
          }}
        >
          LOADING CONFIGURATION…
        </div>
      );
    }

    if (error && !config) {
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            flexDirection: "column",
            gap: 8,
            padding: 48,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--tape)",
            }}
          >
            FAILED TO LOAD CONFIG
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{error}</div>
        </div>
      );
    }

    switch (activeSection) {
      case "servers":
        return <ServersPage config={config} onMutate={mutate} />;
      case "skills":
        return <SkillsPage config={config} />;
      case "plugins":
        return <PluginsPage config={config} />;
      case "groups":
        return <GroupsPage config={config} onMutate={mutate} />;
      case "clients":
        return <ClientsPage config={config} />;
      case "sync":
        return <SyncPage config={config} onMutate={mutate} />;
      case "doctor":
        return <DoctorPage config={config} onMutate={mutate} />;
      case "registry":
        return <RegistryPage config={config} onMutate={mutate} />;
      case "profiles":
        return <ProfilesPage config={config} />;
      case "rules":
        return <RulesPage config={config} />;
    }
  };

  return (
    <ToastProvider>
    <div data-testid="app-root" className="te-app te-scope flex flex-col h-screen bg-surface-bg">
      <div
        data-drag-region
        className="te-scope flex items-center justify-between"
        style={{
          borderBottom: "1px solid var(--hairline-strong)",
          background: "var(--bone)",
          padding: "56px 12px 12px 80px",
        }}
      >
        <ClientChip
          index={activeClient.index}
          name={activeClient.name}
          state="sync"
          onSwap={() => setActiveClient(null)}
        />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          active={activeSection}
          onNavigate={setActiveSection}
          serverCount={serverCount}
          skillCount={skillCount}
          pluginCount={pluginCount}
          groupCount={groupCount}
        />
        <main data-testid="detail-panel" className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
    </ToastProvider>
  );
}
