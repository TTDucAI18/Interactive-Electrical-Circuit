/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IMAGE_TO_BOARD_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
