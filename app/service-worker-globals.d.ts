declare global {
  interface ServiceWorkerManifestGlobal {
    readonly __SW_MANIFEST: import("serwist").PrecacheEntry[];
  }
}

export {};
