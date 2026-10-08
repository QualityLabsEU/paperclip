/**
 * Full-stack coverage for the social sign-up gate against the real Drizzle
 * schema and a migrated embedded Postgres, driven through the real
 * `createBetterAuthInstance` mount. This is the suite that proves a rejected
 * social sign-up leaves no orphan rows at the SQL level (the memory-adapter
 * suite in social-sso-gate.test.ts covers the gate logic itself).
 *
 * Hosts where the embedded Postgres runtime cannot start skip this suite, the
 * same as better-auth-credential-signup.integration.test.ts and
 * managed-loopback-auth.test.ts. Provider APIs are stubbed at the global fetch
 * layer.
 */

import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { authAccounts, authSessions, authUsers, createDb } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { createBetterAuthHandler, createBetterAuthInstance } from "../auth/better-auth.js";
import { resolveSocialSsoConfig } from "../auth/social-sso.js";
import type { Config } from "../config.js";

const ORIGIN = "http://127.0.0.1:41973";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";
const GITHUB_MEMBERSHIPS_URL = "https://api.github.com/user/memberships/orgs";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping social SSO signup integration tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function stubGithubApis(input: { githubId: number; githubLogin: string; email: string; orgs: string[] }) {
  return vi.fn(async (inputUrl: RequestInfo | URL) => {
    const url = String(inputUrl);
    if (url === GITHUB_TOKEN_URL) {
      return jsonResponse({ access_token: "gho-integration-access-token", token_type: "bearer" });
    }
    if (url === GITHUB_USER_URL) {
      return jsonResponse({
        login: input.githubLogin,
        id: input.githubId,
        name: input.githubLogin,
        email: input.email,
        avatar_url: `https://avatars.example.test/u/${input.githubId}`,
      });
    }
    if (url === GITHUB_EMAILS_URL) {
      return jsonResponse([{ email: input.email, primary: true, verified: true, visibility: "public" }]);
    }
    if (url.startsWith(GITHUB_MEMBERSHIPS_URL)) {
      return jsonResponse(
        input.orgs.map((org) => ({ state: "active", role: "member", organization: { login: org } })),
      );
    }
    throw new Error(`unexpected GitHub fetch: ${url}`);
  });
}

function testConfig(): Config {
  return {
    deploymentMode: "authenticated",
    deploymentExposure: "private",
    authBaseUrlMode: "explicit",
    authPublicBaseUrl: ORIGIN,
    authDisableSignUp: false,
    authSocialSso: resolveSocialSsoConfig({
      PAPERCLIP_SSO_GITHUB_CLIENT_ID: "gh-integration-client-id",
      PAPERCLIP_SSO_GITHUB_CLIENT_SECRET: "gh-integration-client-secret",
      PAPERCLIP_SSO_GITHUB_ORGS: "acme-org",
    }),
  } as unknown as Config;
}

describeEmbeddedPostgres("social SSO sign-up gate against the real schema", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db!: ReturnType<typeof createDb>;
  let app!: express.Express;
  const originalEnv = {
    secret: process.env.BETTER_AUTH_SECRET,
    rateLimit: process.env.PAPERCLIP_AUTH_RATE_LIMIT_ENABLED,
  };

  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET = "better-auth-secret-for-social-sso-integration-tests";
    process.env.PAPERCLIP_AUTH_RATE_LIMIT_ENABLED = "false";

    database = await startEmbeddedPostgresTestDatabase("paperclip-social-sso-signup-");
    db = createDb(database.connectionString);

    const auth = createBetterAuthInstance(db, testConfig(), [ORIGIN]);
    app = express();
    app.all("/api/auth/{*authPath}", createBetterAuthHandler(auth));
  }, 30_000);

  afterAll(async () => {
    vi.unstubAllGlobals();
    await database?.cleanup();
    if (originalEnv.secret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = originalEnv.secret;
    if (originalEnv.rateLimit === undefined) delete process.env.PAPERCLIP_AUTH_RATE_LIMIT_ENABLED;
    else process.env.PAPERCLIP_AUTH_RATE_LIMIT_ENABLED = originalEnv.rateLimit;
  });

  /**
   * Drive the browser OAuth handshake for one GitHub identity. Each case uses
   * a distinct GitHub account id and email, so a rejection case is a genuine
   * *sign-up* attempt — the gate only provisions new users, and an identity
   * that already exists would take the sign-in path instead.
   */
  async function driveGithubSignIn(identity: {
    githubId: number;
    githubLogin: string;
    email: string;
    orgs: string[];
  }) {
    vi.stubGlobal("fetch", stubGithubApis(identity) as unknown as typeof fetch);

    const start = await request(app)
      .post("/api/auth/sign-in/social")
      .set("origin", ORIGIN)
      .send({ provider: "github", callbackURL: "/" });
    expect(start.status).toBe(200);
    const setCookies = start.headers["set-cookie"] ?? [];
    const cookieHeader = (Array.isArray(setCookies) ? setCookies : [setCookies])
      .map((cookie: string) => cookie.split(";", 1)[0])
      .join("; ");
    const state = new URL(start.body.url as string).searchParams.get("state");
    return request(app)
      .get(`/api/auth/callback/github?code=integration-code&state=${state}`)
      .set("cookie", cookieHeader);
  }

  it("creates the user and account for an active member of a configured org", async () => {
    const callback = await driveGithubSignIn({
      githubId: 421998,
      githubLogin: "integration-member",
      email: "member@acme-org.dev",
      orgs: ["acme-org"],
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.location).not.toMatch(/error=/);

    const users = await db.select().from(authUsers);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: "member@acme-org.dev" });
    const accounts = await db.select().from(authAccounts);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ providerId: "github" });
    const sessions = await db.select().from(authSessions);
    expect(sessions).toHaveLength(1);
  });

  it("rejects a non-member and leaves no user, account, or session rows", async () => {
    const callback = await driveGithubSignIn({
      githubId: 421997,
      githubLogin: "integration-outsider",
      email: "outsider@example.com",
      orgs: ["some-other-org"],
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toContain("error=sso_github_org_membership_required");

    // The first test's rows are still there; the rejected sign-up added none.
    const users = await db.select().from(authUsers);
    const accounts = await db.select().from(authAccounts);
    const sessions = await db.select().from(authSessions);
    expect(users).toHaveLength(1);
    expect(accounts).toHaveLength(1);
    expect(sessions).toHaveLength(1);
  });
});
