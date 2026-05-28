/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin only — e.g. https://safariomni.com (no /api suffix). */
  readonly VITE_API_URL?: string;
  /** Staff ERP login URL — e.g. https://www.safariomni.com/login */
  readonly VITE_STAFF_ERP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
