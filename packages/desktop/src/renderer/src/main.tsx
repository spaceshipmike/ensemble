import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ipcLink } from "electron-trpc/renderer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import { App } from "./App";
import { trpc } from "./trpc";
import "./globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

const trpcClient = trpc.createClient({
  transformer: superjson,
  links: [ipcLink()],
});

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </trpc.Provider>
    </StrictMode>,
  );
}
