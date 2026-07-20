/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MOCK_DEVICE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}