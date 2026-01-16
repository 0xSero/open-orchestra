// Orchestra Plugin Entry Point
// This file loads the Orchestra plugin from the workspace package

// Use relative import since .opencode is not part of the bun workspace
export { OrchestraPlugin } from "../../packages/plugin/src/index"
export { OrchestraPlugin as default } from "../../packages/plugin/src/index"
