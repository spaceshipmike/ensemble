/**
 * Types shared across main and renderer processes.
 *
 * These describe the shape of data that crosses the IPC boundary. Keep this
 * file dependency-free so both the sandboxed renderer and the Node main
 * process can import it without pulling in platform-specific modules.
 */

export type ToolType = "server" | "skill" | "agent" | "command" | "style" | "plugin" | "hook";

export type ToolScope =
  | { kind: "global" }
  | { kind: "project"; path: string }
  | { kind: "library" };

export interface DiscoveredProject {
  path: string;
  name: string;
  seenIn: string[];
  lastSeenAt: number;
  exists: boolean;
  isGitRepo: boolean;
  /** Status from the project registry. "unregistered" when not in the DB. */
  registryStatus: string;
}

export interface DiscoveredTool {
  id: string;
  type: ToolType;
  name: string;
  description: string;
  scope: ToolScope;
  origin: "discovered" | "managed";
  filePath?: string;
  detail: string;
  /** Plugin-only: whether the plugin is enabled at its discovered scope. */
  pluginEnabled?: boolean;
  /** Plugin-only: marketplace identifier (e.g. "fctry"). Empty when unknown. */
  pluginMarketplace?: string;
}

/** Map from project path ("__global__" or an absolute path) to tools at that scope. */
export type WireMap = Record<string, DiscoveredTool[]>;

export interface WireRequest {
  type: ToolType;
  name: string;
  source: ToolScope;
  target: ToolScope;
}

export interface UnwireRequest {
  type: ToolType;
  name: string;
  scope: ToolScope;
}

export interface WireResult {
  ok: boolean;
  action: "wired" | "unwired" | "skipped" | "failed";
  reason?: string;
}

export interface AppWireApi {
  isWired: (toolId: string, projectPath: string) => boolean;
  wire: (tool: DiscoveredTool, targetPath: string) => Promise<{ ok: boolean; reason?: string }>;
  unwire: (tool: DiscoveredTool, targetPath: string) => Promise<{ ok: boolean; reason?: string }>;
}
