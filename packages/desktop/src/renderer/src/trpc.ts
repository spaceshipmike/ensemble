import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../main/ipc/router";

/**
 * Typed tRPC client — imported by hooks and pages. Keep this in its own
 * module so component files don't create circular dependencies through
 * `main.tsx`.
 */
export const trpc = createTRPCReact<AppRouter>();
