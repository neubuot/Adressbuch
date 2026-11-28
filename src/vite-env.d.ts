/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIGNALING_URL?: string;
  readonly VITE_BOX_URL?: string;
  readonly VITE_ICE_SERVERS?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_MICROSOFT_CLIENT_ID?: string;
  readonly VITE_MICROSOFT_TENANT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
