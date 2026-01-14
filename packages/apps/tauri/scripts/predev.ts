import * as fs from "node:fs/promises"
import { $ } from "bun"

import { copyBinaryToSidecarFolder, getCurrentSidecar } from "./utils"

const RUST_TARGET = Bun.env.TAURI_ENV_TARGET_TRIPLE
const OPENCODE_PORT = Bun.env.OPENCODE_PORT || "4096"

const sidecarConfig = getCurrentSidecar(RUST_TARGET)

// Check if server is already running
async function isServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${OPENCODE_PORT}/health`, {
      signal: AbortSignal.timeout(1000),
    })
    return response.ok
  } catch {
    return false
  }
}

// Check if opencode directory exists
async function opencodeRepoExists(): Promise<boolean> {
  try {
    await fs.access("../opencode")
    return true
  } catch {
    return false
  }
}

const serverRunning = await isServerRunning()
const repoExists = await opencodeRepoExists()

if (serverRunning) {
  console.log(`OpenCode server already running on port ${OPENCODE_PORT}, skipping build`)
} else if (repoExists) {
  const binaryPath = `../opencode/dist/${sidecarConfig.ocBinary}/bin/opencode`
  await $`cd ../opencode && bun run build --single`
  await copyBinaryToSidecarFolder(binaryPath, RUST_TARGET)
} else {
  console.log("No opencode repo found and server not running.")
  console.log(`Please start opencode server: opencode serve --port ${OPENCODE_PORT}`)
  // Create placeholder sidecar so Tauri can still start
  const sidecarPath = `src-tauri/sidecars/${sidecarConfig.sidecar}`
  try {
    await fs.access(sidecarPath)
    console.log(`Using existing placeholder sidecar at ${sidecarPath}`)
  } catch {
    console.log(`Creating placeholder sidecar at ${sidecarPath}`)
    await fs.writeFile(sidecarPath, `#!/bin/bash\necho "Error: Run 'opencode serve' separately."\nexit 1\n`)
    await fs.chmod(sidecarPath, 0o755)
  }
}
