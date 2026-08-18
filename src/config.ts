import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CanvasProvider } from "./providers/canvas.js";
import { CanvasOAuth, type OAuthTokens } from "./providers/canvasAuth.js";
import { IcsProvider } from "./providers/ics.js";
import { MockProvider } from "./providers/mock.js";
import type { SchoolProvider } from "./providers/provider.js";
import { dataDir } from "./state.js";

export type ProviderName = "canvas" | "ics" | "mock";

export interface ResolvedConfig {
  provider: ProviderName;
  canvas?: {
    baseUrl: string;
    /** Manual access token (schoolbridge init). Takes priority over oauth. */
    token?: string;
    /** OAuth2 session created by `schoolbridge auth login`. */
    oauth?: OAuthTokens;
  };
  /** Zero-credential Canvas calendar feed (Calendar → "Calendar Feed"). */
  ics?: { feedUrl: string };
}

export interface CliOverrides {
  provider?: string;
  baseUrl?: string;
  token?: string;
  feedUrl?: string;
}

export function configFile(): string {
  return join(dataDir(), "config.json");
}

export function loadConfigFile(): any {
  try {
    return JSON.parse(readFileSync(configFile(), "utf8"));
  } catch {
    return {};
  }
}

export function saveConfigFile(cfg: object): void {
  const file = configFile();
  mkdirSync(dirname(file), { recursive: true });
  // 0600: the config can hold an access token / OAuth secrets.
  writeFileSync(file, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

/** Merge an OAuth session into the config file (preserving unrelated settings). */
export function saveCanvasOAuth(baseUrl: string, tokens: OAuthTokens): void {
  const file = loadConfigFile();
  saveConfigFile({
    ...file,
    provider: "canvas",
    canvas: { ...(file.canvas ?? {}), baseUrl, oauth: tokens },
  });
}

/** Remove the stored OAuth session (leaves any manual token in place). */
export function clearCanvasOAuth(): void {
  const file = loadConfigFile();
  if (file.canvas?.oauth) {
    delete file.canvas.oauth;
    saveConfigFile(file);
  }
}

/**
 * Resolution order for every setting: CLI flag > environment variable > config file.
 * Env vars: SCHOOLBRIDGE_PROVIDER, CANVAS_BASE_URL, CANVAS_ACCESS_TOKEN (or CANVAS_TOKEN).
 * A manual token (flag/env/init) takes priority over a stored OAuth session.
 */
export function resolveConfig(overrides: CliOverrides = {}): ResolvedConfig {
  const file = loadConfigFile();
  const provider = (overrides.provider ??
    process.env.SCHOOLBRIDGE_PROVIDER ??
    file.provider ??
    "canvas") as string;

  if (provider === "mock") return { provider: "mock" };
  if (provider === "ics") {
    const feedUrl = overrides.feedUrl ?? process.env.SCHOOLBRIDGE_ICS_URL ?? file.ics?.feedUrl;
    if (!feedUrl) {
      throw new Error(
        [
          "No calendar feed configured. Get the URL from Canvas → Calendar →",
          '"Calendar Feed" (bottom-right, ends in .ics), then run:',
          "  schoolbridge init --provider ics --feed-url <url>",
        ].join("\n")
      );
    }
    return { provider: "ics", ics: { feedUrl } };
  }
  if (provider !== "canvas") {
    throw new Error(`Unknown provider "${provider}". Available providers: canvas, ics, mock`);
  }

  const baseUrl = overrides.baseUrl ?? process.env.CANVAS_BASE_URL ?? file.canvas?.baseUrl;
  const token =
    overrides.token ?? process.env.CANVAS_ACCESS_TOKEN ?? process.env.CANVAS_TOKEN ?? file.canvas?.token;
  const oauth: OAuthTokens | undefined = file.canvas?.oauth;
  if (!baseUrl || (!token && !oauth)) {
    throw new Error(
      [
        "Canvas is not configured. Either:",
        "  • run: schoolbridge init --base-url https://yourschool.instructure.com --token <token>",
        "  • or authorize a third-party app: schoolbridge auth login --base-url <url> --client-id <id> --client-secret <secret>",
        "  • or set the CANVAS_BASE_URL and CANVAS_ACCESS_TOKEN environment variables",
        "  • or try sample data with: schoolbridge upcoming --provider mock",
      ].join("\n")
    );
  }
  return { provider: "canvas", canvas: { baseUrl, token, oauth: token ? undefined : oauth } };
}

export function createProvider(cfg: ResolvedConfig): SchoolProvider {
  if (cfg.provider === "mock") return new MockProvider();
  if (cfg.provider === "ics") return new IcsProvider(cfg.ics!.feedUrl);
  const { baseUrl, token, oauth } = cfg.canvas!;
  const session = oauth
    ? new CanvasOAuth(baseUrl, oauth, (updated) => saveCanvasOAuth(baseUrl, updated))
    : undefined;
  return new CanvasProvider({ baseUrl, token, oauth: session });
}
