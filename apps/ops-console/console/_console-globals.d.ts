// Ambient globals for the ops-console UMD app. React/ReactDOM load via
// <script> tags (no import), babel-standalone transpiles the .tsx in the
// browser, and every console .tsx file is a global *script* (zero
// import/export) — so functions defined in one file (Card, PageHeader,
// Badge, Icon, I3, …) are already globally visible to tsc and must NOT be
// re-declared here. This file declares only what is NOT defined in the
// .tsx sources: the UMD React/ReactDOM globals, and the app-specific
// members assigned onto window/globalThis at runtime (window.ElevenUI =
// …, Object.assign(globalThis, …)). Lets `tsc -p apps/ops-console/
// tsconfig.json` check the console for real logic errors without an
// ESM/bundle rewrite.
import type * as ReactNamespace from 'react';

declare global {
  const React: typeof ReactNamespace;
  const ReactDOM: any;

  // App globals are published on window/globalThis at runtime by sibling
  // console modules (Object.assign(globalThis, …), window.X = …). They're
  // too many to enumerate stably and are all loosely typed at the call
  // site, so a string index keeps `window.X` / `globalThis.X` resolvable
  // as `any`. Concrete DOM members (innerWidth, customElements, …) keep
  // their lib.dom types — the index only backstops unknown app keys.
  interface Window {
    [key: string]: any;
  }
}

export {};
