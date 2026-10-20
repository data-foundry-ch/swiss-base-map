/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SWISS_ASSETS_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
