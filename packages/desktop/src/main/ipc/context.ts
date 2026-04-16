// tRPC context — extend this with database connections, services, etc.
// Passed to every procedure via createIPCHandler({ createContext }).

export function createContext() {
  return {};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
