interface ImportMetaEnv {
  readonly VITE_OPENCODE_SERVER_HOST: string
  readonly VITE_OPENCODE_SERVER_PORT: string
  readonly VITE_LINEAR_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
