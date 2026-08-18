import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CanvasProvider } from "./providers/canvas.js";
import { MockProvider } from "./providers/mock.js";
import type { SchoolProvider } from "./providers/provider.js";
import { dataDir } from "./state.js";

export type ProviderName = "canvas" | "mock";

export interface ResolvedConfig {
  provider: ProviderName;
  canvas?: { baseUrl: string; token: string };
}

export interface CliOverrides {
  provider?: string;
  baseUrl?: string;
  token?: string;
}

export function configFile(): string {
  return join(dataDir(), "config.json");
}

function loadConfigFile(): any {
  try {
    return JSON.parse(readFileSync(configFile(), "utf8"));
  } catch {
    return {};
  }
}

export function saveConfigFile(cfg: object): void {
  const file = configFile();
  mkdirSync(dirname(file), { recursive: true });
  // 0600: the config can hold an access token.
  writeFileSync(file, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

/**
 * Resolution order for every setting: CLI flag > environment variable > config file.
 * Env vars: SCHOOLBRIDGE_PROVIDER, CANVAS_BASE_URL, CANVAS_ACCESS_TOKEN (or CANVAS_TOKEN).
 */
export function resolveConfig(overrides: CliOverrides = {}): ResolvedConfig {
  const file = loadConfigFile();
  const provider = (overrides.provider ??
    process.env.SCHOOLBRIDGE_PROVIDER ??
    file.provider ??
    "canvas") as string;

  if (provider === "mock") return { provider: "mock" };
  if (provider !== "canvas") {
    throw new Error(`Unknown provider "${provider}". Available providers: canvas, mock`);
  }

  const baseUrl = overrides.baseUrl ?? process.env.CANVAS_BASE_URL ?? file.canvas?.baseUrl;
  const token =
    overrides.token ?? process.env.CANVAS_ACCESS_TOKEN ?? process.env.CANVAS_TOKEN ?? file.canvas?.token;
  if (!baseUrl || !token) {
    throw new Error(
      [
        "Canvas is not configured. Either:",
        "  • run: schoolbridge init --base-url https://yourschool.instructure.com --token <token>",
        "  • or set the CANVAS_BASE_URL and CANVAS_ACCESS_TOKEN environment variables",
        "  • or try sample data with: schoolbridge upcoming --provider mock",
      ].join("\n")
    );
  }
  return { provider: "canvas", canvas: { baseUrl, token } };
}

export function createProvider(cfg: ResolvedConfig): SchoolProvider {
  return cfg.provider === "mock" ? new MockProvider() : new CanvasProvider(cfg.canvas!);
}
