import type { EnsembleAPI } from "../preload/index";

declare global {
  interface Window {
    ensemble: EnsembleAPI;
  }
}

export type { EnsembleAPI };
