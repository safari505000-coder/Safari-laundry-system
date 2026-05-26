/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin only — e.g. https://safariomni.com (no /api suffix). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
