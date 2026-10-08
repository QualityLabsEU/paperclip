/**
 * End-to-end coverage for the social sign-in gate, driven through a real
 * Better Auth instance mounted exactly like the server mounts it (memory
 * adapter instead of Drizzle, so the suite runs on hosts without Postgres).
 *
 * The provider entries and the `user.validateUserInfo` gate are the very
 * objects `createBetterAuthInstance` composes from the resolved env, so these
 * requests exercise the same wiring a browser meets: token exchange, provider
 * profile fetch, org-membership lookup, and the sign-up gate that must fire
 * *before* any row is written. A suite that additionally drives the full
 * Drizzle mount lives in social-sso-signup.integration.test.ts.
 *
 * GitHub APIs are stubbed at the global fetch layer (better-fetch uses
 * globalThis.fetch), which is also how the org-membership endpoint gets
 * mocked for the accept/reject cases.
 */

import express from "express";
import request from "supertest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { toNodeHandler } from "better-auth/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import {
  buildSocialSsoProviderOptions,
  buildSocialSsoUserGate,
  isSocialSsoConfigured,
  resolveSocialSsoConfig,
} from "../auth/social-sso.js";
import { createBetterAuthInstance } from "../auth/better-auth.js";
import type { Config } from "../config.js";

const ORIGIN = "http://127.0.0.1:41971";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";
const GITHUB_MEMBERSHIPS_URL = "https://api.github.com/user/memberships/orgs";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

type MemoryStore = Record<string, Record<string, unknown>[]>;

function jsonResponse(body: unknown, init?: { headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

function base64url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Unsigned JWT payload carrier: better-auth decodes the payload locally. */
function fakeIdToken(claims: Record<string, unknown>) {
  return `${base64url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${base64url(
    JSON.stringify({ iat: Math.floor(Date.now() / 1000), ...claims }),
  )}.`;
}

type FetchStub = {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  calls: Array<{ url: string; headers: Headers }>;
};

function stubGithubApis(input: {
  githubLogin: string;
  email: string;
  memberships: Array<{ state: string; org: string }>;
}) {
  const calls: FetchStub["calls"] = [];
  const stub: FetchStub = async (inputUrl, init) => {
    const url = String(inputUrl);
    calls.push({ url, headers: new Headers(init?.headers) });
    if (url === GITHUB_TOKEN_URL) {
      return jsonResponse({ access_token: "gho-test-access-token", token_type: "bearer" });
    }
    if (url === GITHUB_USER_URL) {
      return jsonResponse({
        login: input.githubLogin,
        id: 421997,
        name: input.githubLogin,
        email: input.email,
        avatar_url: "https://avatars.example.test/u/421997",
      });
    }
    if (url === GITHUB_EMAILS_URL) {
      return jsonResponse([{ email: input.email, primary: true, verified: true, visibility: "public" }]);
    }
    if (url.startsWith(GITHUB_MEMBERSHIPS_URL)) {
      return jsonResponse(
        input.memberships.map((membership) => ({
          state: membership.state,
          role: "member",
          organization: { login: membership.org },
        })),
      );
    }
    throw new Error(`unexpected GitHub fetch: ${url}`);
  };
  stub.calls = calls;
  return stub;
}

function stubGoogleTokenEndpoint(claims: Record<string, unknown>) {
  const calls: FetchStub["calls"] = [];
  const stub: FetchStub = async (inputUrl) => {
    const url = String(inputUrl);
    calls.push({ url, headers: new Headers() });
    if (url === GOOGLE_TOKEN_URL) {
      return jsonResponse({
        access_token: "ya29.test-access-token",
        id_token: fakeIdToken(claims),
        token_type: "Bearer",
      });
    }
    throw new Error(`unexpected Google fetch: ${url}`);
  };
  stub.calls = calls;
  return stub;
}

/**
 * Build the same Better Auth pieces `createBetterAuthInstance` composes from a
 * resolved env, against the in-memory adapter.
 */
function createSocialSsoAuth(
  env: NodeJS.ProcessEnv,
  store: MemoryStore,
  opts: { disableSignUp?: boolean } = {},
) {
  const sso = resolveSocialSsoConfig(env);
  const providers = buildSocialSsoProviderOptions(sso, { disableSignUp: opts.disableSignUp });
  const auth = betterAuth({
    secret: "better-auth-secret-for-social-sso-gate-tests",
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    database: memoryAdapter(store),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    advanced: { useSecureCookies: false },
    ...(providers ? { socialProviders: providers } : {}),
    ...(isSocialSsoConfigured(sso) ? { user: { validateUserInfo: buildSocialSsoUserGate(sso) } } : {}),
  });
  const app = express();
  app.all("/api/auth/*splat", (req, res, next) => {
    void Promise.resolve(toNodeHandler(auth)(req, res)).catch(next);
  });
  return { app, store };
}

/**
 * Same as createSocialSsoAuth but with Better Auth's origin checks explicitly
 * enabled. Better Auth auto-skips origin checks (which also covers callbackURL
 * validation) whenever NODE_ENV=test, so a vitest suite must opt back in to
 * pin the production behavior of the `/sign-in/social` callbackURL contract.
 */
function createSocialSsoAuthWithOriginChecks(env: NodeJS.ProcessEnv, store: MemoryStore) {
  const sso = resolveSocialSsoConfig(env);
  const providers = buildSocialSsoProviderOptions(sso);
  const auth = betterAuth({
    secret: "better-auth-secret-for-social-sso-gate-tests",
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    database: memoryAdapter(store),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    advanced: { useSecureCookies: false, disableOriginCheck: false },
    ...(providers ? { socialProviders: providers } : {}),
    ...(isSocialSsoConfigured(sso) ? { user: { validateUserInfo: buildSocialSsoUserGate(sso) } } : {}),
  });
  const app = express();
  app.all("/api/auth/*splat", (req, res, next) => {
    void Promise.resolve(toNodeHandler(auth)(req, res)).catch(next);
  });
  return { app, store };
}

async function startSocialSignIn(app: express.Express, provider: "github" | "google") {
  const response = await request(app)
    .post(`/api/auth/sign-in/social`)
    .set("origin", ORIGIN)
    .send({ provider, callbackURL: "/" });
  expect(response.status).toBe(200);
  expect(response.body?.url).toEqual(expect.any(String));
  const setCookies = response.headers["set-cookie"] ?? [];
  const cookieHeader = (Array.isArray(setCookies) ? setCookies : [setCookies])
    .map((cookie: string) => cookie.split(";", 1)[0])
    .join("; ");
  const url = new URL(response.body.url as string);
  return { state: url.searchParams.get("state"), cookieHeader };
}

async function completeSocialSignIn(
  app: express.Express,
  provider: "github" | "google",
  handshake: { state: string | null; cookieHeader: string },
) {
  return request(app)
    .get(`/api/auth/callback/${provider}?code=test-code&state=${handshake.state}`)
    .set("cookie", handshake.cookieHeader);
}

function storeCounts(store: MemoryStore) {
  return {
    users: store.user?.length ?? 0,
    accounts: store.account?.length ?? 0,
    sessions: store.session?.length ?? 0,
  };
}

const GITHUB_ENV = {
  PAPERCLIP_SSO_GITHUB_CLIENT_ID: "gh-client-id",
  PAPERCLIP_SSO_GITHUB_CLIENT_SECRET: "gh-client-secret",
  PAPERCLIP_SSO_GITHUB_ORGS: "acme-org",
};

const GOOGLE_ENV = {
  PAPERCLIP_SSO_GOOGLE_CLIENT_ID: "goog-client-id",
  PAPERCLIP_SSO_GOOGLE_CLIENT_SECRET: "goog-client-secret",
  PAPERCLIP_SSO_GOOGLE_DOMAINS: "example.com",
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("social sign-up gate through the real Better Auth pipeline", () => {
  it("accepts a GitHub sign-up for an active member of a configured org", async () => {
    const fetchStub = stubGithubApis({
      githubLogin: "acme-member",
      email: "member@acme-org.dev",
      memberships: [{ state: "active", org: "unrelated-org" }, { state: "active", org: "Acme-Org" }],
    });
    vi.stubGlobal("fetch", fetchStub as unknown as typeof fetch);
    const { app, store } = createSocialSsoAuth(GITHUB_ENV, {
      user: [], session: [], account: [], verification: [],
    });

    const handshake = await startSocialSignIn(app, "github");
    const callback = await completeSocialSignIn(app, "github", handshake);
    expect(callback.status).toBe(302);
    expect(callback.headers.location).not.toMatch(/error=/);
    expect(storeCounts(store)).toEqual({ users: 1, accounts: 1, sessions: 1 });
    expect(store.user?.[0]).toMatchObject({ email: "member@acme-org.dev" });
    expect(store.account?.[0]).toMatchObject({ providerId: "github" });
    // The org gate rides the getUserInfo override, so the membership lookup
    // ran with the user's OAuth token.
    expect(
      fetchStub.calls.find((call) => call.url.startsWith(GITHUB_MEMBERSHIPS_URL))?.headers.get("authorization"),
    ).toBe("Bearer gho-test-access-token");
    expect(new URL(fetchStub.calls.find((call) => call.url.startsWith(GITHUB_MEMBERSHIPS_URL))!.url).searchParams.get("state")).toBe("active");
  });

  it("rejects a GitHub sign-up outside the configured orgs and leaves no rows behind", async () => {
    const fetchStub = stubGithubApis({
      githubLogin: "outsider",
      email: "outsider@example.com",
      memberships: [{ state: "active", org: "some-other-org" }],
    });
    vi.stubGlobal("fetch", fetchStub as unknown as typeof fetch);
    const { app, store } = createSocialSsoAuth(GITHUB_ENV, {
      user: [], session: [], account: [], verification: [],
    });

    const handshake = await startSocialSignIn(app, "github");
    const callback = await completeSocialSignIn(app, "github", handshake);

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toContain("error=sso_github_org_membership_required");
    // The gate fires before any write: no partial user, account, or session.
    expect(storeCounts(store)).toEqual({ users: 0, accounts: 0, sessions: 0 });
  });

  it("fails closed for GitHub when the orgs env is unset, without calling the membership API", async () => {
    const fetchStub = stubGithubApis({
      githubLogin: "member",
      email: "member@acme-org.dev",
      memberships: [{ state: "active", org: "acme-org" }],
    });
    vi.stubGlobal("fetch", fetchStub as unknown as typeof fetch);
    const { app, store } = createSocialSsoAuth(
      {
        PAPERCLIP_SSO_GITHUB_CLIENT_ID: GITHUB_ENV.PAPERCLIP_SSO_GITHUB_CLIENT_ID,
        PAPERCLIP_SSO_GITHUB_CLIENT_SECRET: GITHUB_ENV.PAPERCLIP_SSO_GITHUB_CLIENT_SECRET,
      },
      { user: [], session: [], account: [], verification: [] },
    );

    const handshake = await startSocialSignIn(app, "github");
    const callback = await completeSocialSignIn(app, "github", handshake);

    expect(callback.headers.location).toContain("error=sso_github_orgs_not_configured");
    expect(fetchStub.calls.some((call) => call.url.startsWith(GITHUB_MEMBERSHIPS_URL))).toBe(false);
    expect(storeCounts(store)).toEqual({ users: 0, accounts: 0, sessions: 0 });
  });

  it("fails closed for GitHub when the membership lookup itself errors", async () => {
    vi.stubGlobal(
      "fetch",
      stubGithubApis({ githubLogin: "member", email: "member@acme-org.dev", memberships: [] }),
    );
    // Overlay a failing membership endpoint on top of the stock stub.
    const baseFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      (async (inputUrl: RequestInfo | URL, init?: RequestInit) => {
        if (String(inputUrl).startsWith(GITHUB_MEMBERSHIPS_URL)) {
          return new Response("rate limited", { status: 403 });
        }
        return baseFetch(inputUrl, init);
      }) as unknown as typeof fetch,
    );
    const { app, store } = createSocialSsoAuth(GITHUB_ENV, {
      user: [], session: [], account: [], verification: [],
    });

    const handshake = await startSocialSignIn(app, "github");
    const callback = await completeSocialSignIn(app, "github", handshake);

    expect(callback.headers.location).toContain("error=sso_github_org_membership_unverified");
    expect(storeCounts(store)).toEqual({ users: 0, accounts: 0, sessions: 0 });
  });

  it("accepts a Google sign-up whose id_token hd matches a configured domain", async () => {
    vi.stubGlobal(
      "fetch",
      stubGoogleTokenEndpoint({
        sub: "google-sub-1",
        email: "member@example.com",
        email_verified: true,
        name: "Example Member",
        hd: "example.com",
      }) as unknown as typeof fetch,
    );
    const { app, store } = createSocialSsoAuth(GOOGLE_ENV, {
      user: [], session: [], account: [], verification: [],
    });

    const handshake = await startSocialSignIn(app, "google");
    const callback = await completeSocialSignIn(app, "google", handshake);

    expect(callback.status).toBe(302);
    expect(callback.headers.location).not.toMatch(/error=/);
    expect(storeCounts(store)).toEqual({ users: 1, accounts: 1, sessions: 1 });
    expect(store.account?.[0]).toMatchObject({ providerId: "google" });
  });

  it("rejects a Google sign-up whose hd is outside the configured domains", async () => {
    vi.stubGlobal(
      "fetch",
      stubGoogleTokenEndpoint({
        sub: "google-sub-2",
        email: "member@other.com",
        email_verified: true,
        name: "Other Member",
        hd: "other.com",
      }) as unknown as typeof fetch,
    );
    const { app, store } = createSocialSsoAuth(GOOGLE_ENV, {
      user: [], session: [], account: [], verification: [],
    });

    const handshake = await startSocialSignIn(app, "google");
    const callback = await completeSocialSignIn(app, "google", handshake);

    expect(callback.headers.location).toContain("error=sso_google_hosted_domain_not_allowed");
    expect(storeCounts(store)).toEqual({ users: 0, accounts: 0, sessions: 0 });
  });

  it("rejects a Google sign-up with no hd claim (plain gmail.com) and leaves no rows", async () => {
    vi.stubGlobal(
      "fetch",
      stubGoogleTokenEndpoint({
        sub: "google-sub-3",
        email: "someone@gmail.com",
        email_verified: true,
        name: "Personal Account",
      }) as unknown as typeof fetch,
    );
    const { app, store } = createSocialSsoAuth(GOOGLE_ENV, {
      user: [], session: [], account: [], verification: [],
    });

    const handshake = await startSocialSignIn(app, "google");
    const callback = await completeSocialSignIn(app, "google", handshake);

    expect(callback.headers.location).toContain("error=sso_google_hosted_domain_required");
    expect(storeCounts(store)).toEqual({ users: 0, accounts: 0, sessions: 0 });
  });

  it("fails closed for Google when the domains env is unset", async () => {
    vi.stubGlobal(
      "fetch",
      stubGoogleTokenEndpoint({
        sub: "google-sub-4",
        email: "member@example.com",
        email_verified: true,
        name: "Example Member",
        hd: "example.com",
      }) as unknown as typeof fetch,
    );
    const { app, store } = createSocialSsoAuth(
      {
        PAPERCLIP_SSO_GOOGLE_CLIENT_ID: GOOGLE_ENV.PAPERCLIP_SSO_GOOGLE_CLIENT_ID,
        PAPERCLIP_SSO_GOOGLE_CLIENT_SECRET: GOOGLE_ENV.PAPERCLIP_SSO_GOOGLE_CLIENT_SECRET,
      },
      { user: [], session: [], account: [], verification: [] },
    );

    const handshake = await startSocialSignIn(app, "google");
    const callback = await completeSocialSignIn(app, "google", handshake);

    expect(callback.headers.location).toContain("error=sso_google_domains_not_configured");
    expect(storeCounts(store)).toEqual({ users: 0, accounts: 0, sessions: 0 });
  });

  it("leaves the email/password path untouched while the gate is armed", async () => {
    const { app, store } = createSocialSsoAuth(
      { ...GITHUB_ENV, ...GOOGLE_ENV },
      { user: [], session: [], account: [], verification: [] },
    );

    const signUp = await request(app)
      .post("/api/auth/sign-up/email")
      .set("origin", ORIGIN)
      .send({ email: "founder@example.com", password: "correct-horse-battery-staple", name: "Founder" });

    expect(signUp.status).toBe(200);
    expect(signUp.body?.user?.email).toBe("founder@example.com");
    expect(storeCounts(store)).toEqual({ users: 1, accounts: 1, sessions: 1 });
  });
});

describe("registration lock governs the social path", () => {
  it("refuses to provision a new GitHub user while registration is locked", async () => {
    vi.stubGlobal(
      "fetch",
      stubGithubApis({
        githubLogin: "locked-out-member",
        email: "newuser@acme-org.dev",
        memberships: [{ state: "active", org: "acme-org" }],
      }) as unknown as typeof fetch,
    );
    const { app, store } = createSocialSsoAuth(
      GITHUB_ENV,
      { user: [], session: [], account: [], verification: [] },
      { disableSignUp: true },
    );

    const handshake = await startSocialSignIn(app, "github");
    const callback = await completeSocialSignIn(app, "github", handshake);

    // Even an org member cannot register: PAPERCLIP_AUTH_DISABLE_SIGN_UP locks
    // the social path with the same contract the password path has.
    expect(callback.headers.location).toContain("error=signup_disabled");
    expect(storeCounts(store)).toEqual({ users: 0, accounts: 0, sessions: 0 });
  });

  it("still signs in an already-linked GitHub user while registration is locked", async () => {
    vi.stubGlobal(
      "fetch",
      stubGithubApis({
        githubLogin: "linked-member",
        email: "linked@acme-org.dev",
        memberships: [{ state: "active", org: "acme-org" }],
      }) as unknown as typeof fetch,
    );
    const { app, store } = createSocialSsoAuth(
      GITHUB_ENV,
      {
        user: [
          {
            id: "u-linked",
            name: "Linked Member",
            email: "linked@acme-org.dev",
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        account: [
          {
            id: "a-linked",
            userId: "u-linked",
            providerId: "github",
            issuer: "local:oauth:github",
            accountId: "421997",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        session: [],
        verification: [],
      },
      { disableSignUp: true },
    );

    const handshake = await startSocialSignIn(app, "github");
    const callback = await completeSocialSignIn(app, "github", handshake);

    // A registration lock must not lock existing users out: the linked
    // account signs in (the stub /user id 421997 matches the seeded account).
    expect(callback.status).toBe(302);
    expect(callback.headers.location).not.toMatch(/error=/);
    expect(storeCounts(store)).toEqual({ users: 1, accounts: 1, sessions: 1 });
  });
});

describe("social account linking passes the same gate", () => {
  function seededVerifiedUserStore(email: string): MemoryStore {
    return {
      user: [
        {
          id: "u-local",
          name: "Local Founder",
          email,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      account: [],
      session: [],
      verification: [],
    };
  }

  it("rejects a GitHub link onto a pre-existing verified account that fails the org gate", async () => {
    vi.stubGlobal(
      "fetch",
      stubGithubApis({
        githubLogin: "outsider",
        email: "founder@example.com",
        memberships: [{ state: "active", org: "some-other-org" }],
      }) as unknown as typeof fetch,
    );
    const { app, store } = createSocialSsoAuth(GITHUB_ENV, seededVerifiedUserStore("founder@example.com"));

    const handshake = await startSocialSignIn(app, "github");
    const callback = await completeSocialSignIn(app, "github", handshake);

    // Implicit email-match linking used to bypass the gate (the hook exempted
    // link-account); it must now fail closed with the org-gate error.
    expect(callback.headers.location).toContain("error=sso_github_org_membership_required");
    expect(storeCounts(store)).toEqual({ users: 1, accounts: 0, sessions: 0 });
  });

  it("links an org member onto a pre-existing verified account", async () => {
    vi.stubGlobal(
      "fetch",
      stubGithubApis({
        githubLogin: "acme-member",
        email: "founder@example.com",
        memberships: [{ state: "active", org: "acme-org" }],
      }) as unknown as typeof fetch,
    );
    const { app, store } = createSocialSsoAuth(GITHUB_ENV, seededVerifiedUserStore("founder@example.com"));

    const handshake = await startSocialSignIn(app, "github");
    const callback = await completeSocialSignIn(app, "github", handshake);

    expect(callback.status).toBe(302);
    expect(callback.headers.location).not.toMatch(/error=/);
    expect(storeCounts(store)).toEqual({ users: 1, accounts: 1, sessions: 1 });
    expect(store.account?.[0]).toMatchObject({ providerId: "github", userId: "u-local" });
  });
});

describe("the callbackURL sent to /sign-in/social is constrained by the server", () => {
  // Better Auth's global origin-check middleware validates callbackURL
  // against trustedOrigins with relative paths allowed — this is what keeps a
  // hostile ?next (flowing through the OAuth round trip as the redirect
  // target) from becoming an open redirect. The pin runs with origin checks
  // explicitly enabled because NODE_ENV=test would otherwise skip them.
  it("rejects absolute and protocol-relative callbackURLs", async () => {
    const { app } = createSocialSsoAuthWithOriginChecks(GITHUB_ENV, {
      user: [], session: [], account: [], verification: [],
    });

    for (const hostile of ["https://evil.example/phish", "//evil.example/phish", "/\\evil.example"]) {
      const response = await request(app)
        .post("/api/auth/sign-in/social")
        .set("origin", ORIGIN)
        .send({ provider: "github", callbackURL: hostile });
      expect(response.status).toBe(403);
      expect(response.body?.code).toBe("INVALID_CALLBACK_URL");
    }
  });

  it("accepts a root-relative callbackURL", async () => {
    const { app } = createSocialSsoAuthWithOriginChecks(GITHUB_ENV, {
      user: [], session: [], account: [], verification: [],
    });

    const response = await request(app)
      .post("/api/auth/sign-in/social")
      .set("origin", ORIGIN)
      .send({ provider: "github", callbackURL: "/workspaces/ws_123" });
    expect(response.status).toBe(200);
    expect(response.body?.url).toEqual(expect.any(String));
  });
});

describe("createBetterAuthInstance registers providers from config", () => {
  const originalEnv = {
    secret: process.env.BETTER_AUTH_SECRET,
    rateLimit: process.env.PAPERCLIP_AUTH_RATE_LIMIT_ENABLED,
  };

  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "better-auth-secret-for-social-sso-registration-tests";
    // The rate limiter is on by default in authenticated mode and would score
    // the back-to-back sign-in attempts in these tests.
    process.env.PAPERCLIP_AUTH_RATE_LIMIT_ENABLED = "false";
  });

  afterEach(() => {
    if (originalEnv.secret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = originalEnv.secret;
    if (originalEnv.rateLimit === undefined) delete process.env.PAPERCLIP_AUTH_RATE_LIMIT_ENABLED;
    else process.env.PAPERCLIP_AUTH_RATE_LIMIT_ENABLED = originalEnv.rateLimit;
  });

  /**
   * `/sign-in/social` persists its CSRF/OAuth state row through the Drizzle
   * adapter before answering, so the fake db needs just enough of Drizzle's
   * insert chain for that write. No other model is touched on this path.
   */
  function stateOnlyDb(): Db {
    const db = {
      insert: (_table: unknown) => ({
        values: (values: Record<string, unknown>) => ({
          returning: async () => [values],
        }),
      }),
    };
    return db as unknown as Db;
  }

  function authRequest(path: string, init?: RequestInit): Request {
    return new Request(`${ORIGIN}/api/auth${path}`, {
      ...init,
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        ...init?.headers,
      },
    });
  }

  function testConfig(authSocialSso: Config["authSocialSso"]): Config {
    return {
      deploymentMode: "authenticated",
      deploymentExposure: "private",
      authBaseUrlMode: "explicit",
      authPublicBaseUrl: ORIGIN,
      authDisableSignUp: false,
      authSocialSso,
    } as unknown as Config;
  }

  it("answers provider-not-found for social sign-in when nothing is configured", async () => {
    const auth = createBetterAuthInstance(stateOnlyDb(), testConfig({ github: null, google: null }), [ORIGIN]);
    const response = await auth.handler(
      authRequest("/sign-in/social", {
        method: "POST",
        body: JSON.stringify({ provider: "github", callbackURL: "/" }),
      }),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("PROVIDER_NOT_FOUND");
  });

  it("issues a GitHub authorization URL only when the client pair is configured", async () => {
    const auth = createBetterAuthInstance(
      stateOnlyDb(),
      testConfig(
        resolveSocialSsoConfig({
          PAPERCLIP_SSO_GITHUB_CLIENT_ID: "gh-client-id",
          PAPERCLIP_SSO_GITHUB_CLIENT_SECRET: "gh-client-secret",
          PAPERCLIP_SSO_GITHUB_ORGS: "acme-org",
        }),
      ),
      [ORIGIN],
    );
    const github = await auth.handler(
      authRequest("/sign-in/social", {
        method: "POST",
        body: JSON.stringify({ provider: "github", callbackURL: "/" }),
      }),
    );
    expect(github.status).toBe(200);
    const githubBody = (await github.json()) as { url?: string };
    expect(githubBody.url).toContain("https://github.com/login/oauth/authorize");
    expect(githubBody.url).toContain("client_id=gh-client-id");
    // The org-membership gate needs read:org on the user token, APPENDED to
    // the stock GitHub scopes (read:user, user:email) — replacing them would
    // break profile/email mapping. Lock the whole scope set.
    const authorizeUrl = new URL(githubBody.url!);
    const scopes = (authorizeUrl.searchParams.get("scope") ?? "").split(/[\s+]+/).filter(Boolean);
    expect(scopes).toEqual(
      expect.arrayContaining(["read:org", "read:user", "user:email"]),
    );
    expect(scopes.filter((scope) => scope === "read:org")).toHaveLength(1);

    // Google stays unregistered when only GitHub is configured.
    const google = await auth.handler(
      authRequest("/sign-in/social", {
        method: "POST",
        body: JSON.stringify({ provider: "google", callbackURL: "/" }),
      }),
    );
    expect(google.status).toBe(404);
  });

  it("issues a Google authorization URL when the Google client pair is configured", async () => {
    const auth = createBetterAuthInstance(
      stateOnlyDb(),
      testConfig(
        resolveSocialSsoConfig({
          PAPERCLIP_SSO_GOOGLE_CLIENT_ID: "goog-client-id",
          PAPERCLIP_SSO_GOOGLE_CLIENT_SECRET: "goog-client-secret",
          PAPERCLIP_SSO_GOOGLE_DOMAINS: "example.com",
        }),
      ),
      [ORIGIN],
    );
    const google = await auth.handler(
      authRequest("/sign-in/social", {
        method: "POST",
        body: JSON.stringify({ provider: "google", callbackURL: "/" }),
      }),
    );
    expect(google.status).toBe(200);
    const googleBody = (await google.json()) as { url?: string };
    expect(googleBody.url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(googleBody.url).toContain("client_id=goog-client-id");
  });
});
