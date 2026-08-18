import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

/**
 * Canvas OAuth2 (authorization-code) support, so third-party apps can request
 * API permission through Canvas's consent screen instead of asking students to
 * hand-copy access tokens.
 *
 * Prerequisite: the institution's Canvas admin creates a Developer Key for the
 * app (Admin → Developer Keys) with redirect URI http://localhost:<port>/oauth/callback,
 * yielding the client id and secret used here. Flow reference:
 * https://developerdocs.instructure.com/services/canvas/oauth2
 */
export interface OAuthTokens {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  /** ISO timestamp when accessToken expires; null = unknown (refresh on 401 only). */
  expiresAt: string | null;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: number; name?: string };
}

export class CanvasOAuth {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private tokens: OAuthTokens,
    /** Called after every token refresh so the new tokens survive the process. */
    private readonly persist: (tokens: OAuthTokens) => void
  ) {
    this.base = baseUrl.replace(/\/+$/, "");
  }

  private expired(): boolean {
    if (!this.tokens.expiresAt) return false;
    // Refresh a minute early so in-flight requests don't race expiry.
    return Date.now() > new Date(this.tokens.expiresAt).getTime() - 60_000;
  }

  async getAccessToken(): Promise<string> {
    if (this.expired()) await this.refresh();
    return this.tokens.accessToken;
  }

  async refresh(): Promise<void> {
    const res = await fetch(`${this.base}/login/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.tokens.clientId,
        client_secret: this.tokens.clientSecret,
        refresh_token: this.tokens.refreshToken,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Canvas OAuth refresh failed (${res.status}). Re-authorize with: schoolbridge auth login …${
          body ? ` — ${body.slice(0, 200)}` : ""
        }`
      );
    }
    const data = (await res.json()) as TokenResponse;
    this.tokens = {
      ...this.tokens,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.tokens.refreshToken,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
    };
    this.persist(this.tokens);
  }

  /** Revoke the current access token with Canvas. */
  async revoke(): Promise<void> {
    await fetch(`${this.base}/login/oauth2/token`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.tokens.accessToken}` },
    }).catch(() => {
      /* best effort — the user can also revoke from Canvas settings */
    });
  }

  /**
   * Run the full browser consent flow: start a localhost callback server,
   * hand the consent URL to `onAuthUrl` (print it / open a browser), wait for
   * Canvas to redirect back with a code, and exchange it for tokens.
   */
  static async authorize(
    opts: { baseUrl: string; clientId: string; clientSecret: string; port?: number; timeoutMs?: number },
    onAuthUrl: (url: string) => void
  ): Promise<{ tokens: OAuthTokens; userName: string | null }> {
    const base = opts.baseUrl.replace(/\/+$/, "");
    const port = opts.port ?? 8765;
    const redirectUri = `http://localhost:${port}/oauth/callback`;
    const state = randomBytes(16).toString("hex");

    const code = await new Promise<string>((resolve, reject) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", `http://localhost:${port}`);
        if (url.pathname !== "/oauth/callback") {
          res.writeHead(404).end();
          return;
        }
        const error = url.searchParams.get("error");
        const gotCode = url.searchParams.get("code");
        const ok = !error && gotCode && url.searchParams.get("state") === state;
        res.writeHead(ok ? 200 : 400, { "content-type": "text/html" });
        res.end(
          ok
            ? "<h2>schoolbridge is connected 🎒</h2><p>You can close this tab and return to the terminal.</p>"
            : `<h2>Authorization failed</h2><p>${error ?? "state mismatch"} — return to the terminal and try again.</p>`
        );
        server.close();
        clearTimeout(timer);
        if (ok) resolve(gotCode);
        else reject(new Error(`Canvas authorization ${error ? `denied: ${error}` : "failed (state mismatch)"}`));
      });
      const timer = setTimeout(() => {
        server.close();
        reject(new Error("Timed out waiting for Canvas authorization (5 minutes)"));
      }, opts.timeoutMs ?? 300_000);
      timer.unref();
      server.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      server.listen(port, () => {
        const authUrl = `${base}/login/oauth2/auth?${new URLSearchParams({
          client_id: opts.clientId,
          response_type: "code",
          redirect_uri: redirectUri,
          state,
        })}`;
        onAuthUrl(authUrl);
      });
    });

    const res = await fetch(`${base}/login/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Canvas token exchange failed (${res.status})${body ? `: ${body.slice(0, 300)}` : ""}`);
    }
    const data = (await res.json()) as TokenResponse;
    if (!data.access_token || !data.refresh_token) {
      throw new Error(
        "Canvas returned no refresh token — the Developer Key may be misconfigured (it must allow the authorization_code flow)."
      );
    }
    return {
      tokens: {
        clientId: opts.clientId,
        clientSecret: opts.clientSecret,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
      },
      userName: data.user?.name ?? null,
    };
  }
}
