/**
 * schoolbridge — connect Canvas and other school platforms to AI agents.
 *
 * Library entry point. Most integrations want one of:
 *  - the CLI (`schoolbridge …`) for shell-based agents,
 *  - the MCP server (`schoolbridge mcp`) for MCP clients,
 *  - or these exports to embed schoolbridge in a Node.js agent directly.
 */
export * from "./types.js";
export type { SchoolProvider } from "./providers/provider.js";
export { CanvasProvider, type CanvasConfig } from "./providers/canvas.js";
export { CanvasOAuth, type OAuthTokens } from "./providers/canvasAuth.js";
export { IcsProvider } from "./providers/ics.js";
export { MockProvider } from "./providers/mock.js";
export { parseIcs, type IcsEvent } from "./ics.js";
export { buildSnapshot, checkEvents, diffSnapshots, type CheckResult } from "./events.js";
export { decorateAssignment, getGrades, listUpcoming, type GradeReport, type GradedItem } from "./queries.js";
export { priorityLabel, priorityScore } from "./priority.js";
export { createProvider, resolveConfig, saveConfigFile, configFile, type ResolvedConfig, type CliOverrides, type ProviderName } from "./config.js";
export { StateStore, dataDir } from "./state.js";
export { createMcpServer, runMcpServer } from "./mcp.js";
export { htmlToText } from "./html.js";
export { SKILL_TARGETS, skillInstallPath, skillMarkdown, type SkillTarget } from "./skill.js";
export { VERSION } from "./version.js";
