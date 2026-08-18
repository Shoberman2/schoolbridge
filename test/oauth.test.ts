import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasOAuth, type OAuthTokens } from "../src/providers/canvasAuth.js";

function tokens(overrides: Partial<OAuthTokens> = {}): OAuthTokens {
  return {
    clientId: "cid",
    clientSecret: "secret",
    accessToken: "old-access",
    refreshToken: "refresh-1",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("CanvasOAuth", () => {
  it("returns the cached token without refreshing when not expired", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const oauth = new CanvasOAuth("https://canvas.example.edu", tokens(), () => {});
    expect(await oauth.getAccessToken()).toBe("old-access");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refreshes an expired token and persists the result", async () => {
    const fetchSpy = vi.fn(async (url: string, init: any) => {
      expect(url).toBe("https://canvas.example.edu/login/oauth2/token");
      const body = init.body as URLSearchParams;
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("refresh-1");
      return {
        ok: true,
        json: async () => ({ access_token: "new-access", expires_in: 3600 }),
      } as any;
    });
    vi.stubGlobal("fetch", fetchSpy);
    const persisted: OAuthTokens[] = [];
    const oauth = new CanvasOAuth(
      "https://canvas.example.edu",
      tokens({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
      (t) => persisted.push(t)
    );
    expect(await oauth.getAccessToken()).toBe("new-access");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].accessToken).toBe("new-access");
    expect(persisted[0].refreshToken).toBe("refresh-1"); // preserved when Canvas omits it
    // Subsequent calls use the fresh token without another refresh.
    expect(await oauth.getAccessToken()).toBe("new-access");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("surfaces a helpful error when refresh is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 400, text: async () => "invalid_grant" }) as any)
    );
    const oauth = new CanvasOAuth(
      "https://canvas.example.edu",
      tokens({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
      () => {}
    );
    await expect(oauth.getAccessToken()).rejects.toThrow(/auth login/);
  });
});
