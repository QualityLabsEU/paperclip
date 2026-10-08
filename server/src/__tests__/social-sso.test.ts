/**
 * Unit coverage for the optional social sign-in configuration: env → config
 * resolution (provider registered only when its client pair is set), gate-list
 * parsing, the Google hosted-domain matcher, the GitHub org-membership lookup
 * (pagination + failure semantics), and the `user.validateUserInfo` gate
 * decisions — including the fail-closed rules.
 */

import { describe, expect, it, vi } from "vitest";
import {
  buildSocialSsoProviderOptions,
  buildSocialSsoUserGate,
  fetchActiveGitHubOrgMemberships,
  isGoogleHostedDomainAllowed,
  isSocialSsoConfigured,
  parseCsvList,
  resolveSocialSsoConfig,
  resolveSocialSsoProviderAvailability,
} from "../auth/social-sso.js";

function jsonResponse(body: unknown, init?: { headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

describe("parseCsvList", () => {
  it("splits, trims, lowercases, and drops empty entries", () => {
    expect(parseCsvList(" Acme-Org , ,beta ,,GAMMA ")).toEqual(["acme-org", "beta", "gamma"]);
  });

  it("returns an empty list for unset, empty, or separator-only values", () => {
    expect(parseCsvList(undefined)).toEqual([]);
    expect(parseCsvList("")).toEqual([]);
    expect(parseCsvList(" , , ")).toEqual([]);
  });
});

describe("resolveSocialSsoConfig", () => {
  it("registers nothing when no env is set", () => {
    const config = resolveSocialSsoConfig({});
    expect(config.github).toBeNull();
    expect(config.google).toBeNull();
    expect(isSocialSsoConfigured(config)).toBe(false);
    expect(resolveSocialSsoProviderAvailability(config)).toEqual({ github: false, google: false });
    expect(buildSocialSsoProviderOptions(config)).toBeNull();
  });

  it("registers github only when both client id and secret are set", () => {
    expect(resolveSocialSsoConfig({ PAPERCLIP_SSO_GITHUB_CLIENT_ID: "id" }).github).toBeNull();
    expect(resolveSocialSsoConfig({ PAPERCLIP_SSO_GITHUB_CLIENT_SECRET: "secret" }).github).toBeNull();
    const config = resolveSocialSsoConfig({
      PAPERCLIP_SSO_GITHUB_CLIENT_ID: " gh-id ",
      PAPERCLIP_SSO_GITHUB_CLIENT_SECRET: " gh-secret ",
      PAPERCLIP_SSO_GITHUB_ORGS: "Acme-Org, beta",
    });
    expect(config.github).toEqual({
      clientId: "gh-id",
      clientSecret: "gh-secret",
      orgs: ["acme-org", "beta"],
    });
    expect(config.google).toBeNull();
    expect(isSocialSsoConfigured(config)).toBe(true);
  });

  it("registers google only when both client id and secret are set", () => {
    expect(resolveSocialSsoConfig({ PAPERCLIP_SSO_GOOGLE_CLIENT_ID: "id" }).google).toBeNull();
    expect(resolveSocialSsoConfig({ PAPERCLIP_SSO_GOOGLE_CLIENT_SECRET: "secret" }).google).toBeNull();
    const config = resolveSocialSsoConfig({
      PAPERCLIP_SSO_GOOGLE_CLIENT_ID: "goog-id",
      PAPERCLIP_SSO_GOOGLE_CLIENT_SECRET: "goog-secret",
      PAPERCLIP_SSO_GOOGLE_DOMAINS: "Example.COM, example.net",
    });
    expect(config.google).toEqual({
      clientId: "goog-id",
      clientSecret: "goog-secret",
      domains: ["example.com", "example.net"],
    });
    expect(config.github).toBeNull();
  });

  it("treats whitespace-only values as unset", () => {
    const config = resolveSocialSsoConfig({
      PAPERCLIP_SSO_GITHUB_CLIENT_ID: "   ",
      PAPERCLIP_SSO_GITHUB_CLIENT_SECRET: "   ",
    });
    expect(config.github).toBeNull();
  });

  it("reports provider availability as booleans only", () => {
    const config = resolveSocialSsoConfig({
      PAPERCLIP_SSO_GITHUB_CLIENT_ID: "id",
      PAPERCLIP_SSO_GITHUB_CLIENT_SECRET: "secret",
    });
    expect(resolveSocialSsoProviderAvailability(config)).toEqual({ github: true, google: false });
  });
});

describe("buildSocialSsoProviderOptions", () => {
  it("adds a github entry with a getUserInfo override and a plain google entry", () => {
    const config = resolveSocialSsoConfig({
      PAPERCLIP_SSO_GITHUB_CLIENT_ID: "gh-id",
      PAPERCLIP_SSO_GITHUB_CLIENT_SECRET: "gh-secret",
      PAPERCLIP_SSO_GITHUB_ORGS: "acme-org",
      PAPERCLIP_SSO_GOOGLE_CLIENT_ID: "goog-id",
      PAPERCLIP_SSO_GOOGLE_CLIENT_SECRET: "goog-secret",
      PAPERCLIP_SSO_GOOGLE_DOMAINS: "example.com",
    });
    const providers = buildSocialSsoProviderOptions(config)!;
    expect(providers.github).toMatchObject({
      clientId: "gh-id",
      clientSecret: "gh-secret",
      // The org-membership lookup needs read:org; without it GitHub answers
      // 403 and every sign-up would fail closed.
      scope: ["read:org"],
    });
    expect(typeof providers.github?.getUserInfo).toBe("function");
    // The Google gate runs in validateUserInfo against the id_token claims;
    // the provider entry itself stays stock.
    expect(providers.google).toEqual({ clientId: "goog-id", clientSecret: "goog-secret" });
  });
});

describe("isGoogleHostedDomainAllowed", () => {
  const domains = ["example.com", "example.net"];

  it("accepts an exact, case-insensitive hosted-domain match", () => {
    expect(isGoogleHostedDomainAllowed(domains, "example.com")).toBe(true);
    expect(isGoogleHostedDomainAllowed(domains, "Example.COM")).toBe(true);
  });

  it("rejects missing or non-string hd claims (plain gmail.com has none)", () => {
    expect(isGoogleHostedDomainAllowed(domains, undefined)).toBe(false);
    expect(isGoogleHostedDomainAllowed(domains, "")).toBe(false);
    expect(isGoogleHostedDomainAllowed(domains, "   ")).toBe(false);
    expect(isGoogleHostedDomainAllowed(domains, 42)).toBe(false);
  });

  it("rejects hosted domains outside the list", () => {
    expect(isGoogleHostedDomainAllowed(domains, "gmail.com")).toBe(false);
    expect(isGoogleHostedDomainAllowed(domains, "corp.example.com")).toBe(false);
  });
});

describe("fetchActiveGitHubOrgMemberships", () => {
  it("collects active org logins and sends the user token", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.github.test/user/memberships/orgs?state=active&per_page=100");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer gho-token");
      return jsonResponse([
        { state: "active", organization: { login: "Acme-Org" } },
        { state: "pending", organization: { login: "pending-org" } },
      ]);
    });
    const result = await fetchActiveGitHubOrgMemberships("gho-token", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiBaseUrl: "https://api.github.test",
    });
    expect(result).toEqual({ ok: true, orgs: ["acme-org"] });
  });

  it("follows Link-header pagination", async () => {
    const pages = [
      jsonResponse([{ state: "active", organization: { login: "org-one" } }], {
        headers: { link: '<https://api.github.test/user/memberships/orgs?state=active&per_page=100&page=2>; rel="next"' },
      }),
      jsonResponse([{ state: "active", organization: { login: "org-two" } }]),
    ];
    const fetchImpl = vi.fn(async () => pages.shift()!);
    const result = await fetchActiveGitHubOrgMemberships("gho-token", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiBaseUrl: "https://api.github.test",
    });
    expect(result).toEqual({ ok: true, orgs: ["org-one", "org-two"] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fails closed on HTTP errors, transport errors, and bad payloads", async () => {
    const httpError = vi.fn(async () => new Response("nope", { status: 403 }));
    expect(
      await fetchActiveGitHubOrgMemberships("t", { fetchImpl: httpError as unknown as typeof fetch, apiBaseUrl: "https://api.github.test" }),
    ).toEqual({ ok: false, orgs: [] });

    const transportError = vi.fn(async () => {
      throw new Error("connection reset");
    });
    expect(
      await fetchActiveGitHubOrgMemberships("t", { fetchImpl: transportError as unknown as typeof fetch, apiBaseUrl: "https://api.github.test" }),
    ).toEqual({ ok: false, orgs: [] });

    const badPayload = vi.fn(async () => jsonResponse({ not: "an array" }));
    expect(
      await fetchActiveGitHubOrgMemberships("t", { fetchImpl: badPayload as unknown as typeof fetch, apiBaseUrl: "https://api.github.test" }),
    ).toEqual({ ok: false, orgs: [] });
  });
});

describe("buildSocialSsoUserGate", () => {
  const configuredEnv = {
    PAPERCLIP_SSO_GITHUB_CLIENT_ID: "gh-id",
    PAPERCLIP_SSO_GITHUB_CLIENT_SECRET: "gh-secret",
    PAPERCLIP_SSO_GITHUB_ORGS: "acme-org",
    PAPERCLIP_SSO_GOOGLE_CLIENT_ID: "goog-id",
    PAPERCLIP_SSO_GOOGLE_CLIENT_SECRET: "goog-secret",
    PAPERCLIP_SSO_GOOGLE_DOMAINS: "example.com",
  };

  it("accepts a GitHub sign-up whose profile carries an allowed org verdict", async () => {
    const gate = buildSocialSsoUserGate(resolveSocialSsoConfig(configuredEnv));
    await expect(
      gate({
        user: { email: "member@acme.dev" },
        source: {
          action: "create-user",
          method: "oauth",
          oauth: {
            providerId: "github",
            profile: { login: "member", paperclipSsoOrgGate: { verified: true, allowed: true } },
          },
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a GitHub sign-up that is not a member of any configured org", async () => {
    const gate = buildSocialSsoUserGate(resolveSocialSsoConfig(configuredEnv));
    await expect(
      gate({
        user: { email: "stranger@example.com" },
        source: {
          action: "create-user",
          method: "oauth",
          oauth: {
            providerId: "github",
            profile: { login: "stranger", paperclipSsoOrgGate: { verified: true, allowed: false } },
          },
        },
      }),
    ).resolves.toMatchObject({ error: "sso_github_org_membership_required" });
  });

  it("fails closed when the membership lookup itself failed", async () => {
    const gate = buildSocialSsoUserGate(resolveSocialSsoConfig(configuredEnv));
    await expect(
      gate({
        user: { email: "member@acme.dev" },
        source: {
          action: "create-user",
          method: "oauth",
          oauth: {
            providerId: "github",
            profile: { login: "member", paperclipSsoOrgGate: { verified: false, allowed: false } },
          },
        },
      }),
    ).resolves.toMatchObject({ error: "sso_github_org_membership_unverified" });
  });

  it("fails closed when a GitHub sign-up carries no verdict at all", async () => {
    const gate = buildSocialSsoUserGate(resolveSocialSsoConfig(configuredEnv));
    await expect(
      gate({
        user: { email: "member@acme.dev" },
        source: {
          action: "create-user",
          method: "oauth",
          oauth: { providerId: "github", profile: { login: "member" } },
        },
      }),
    ).resolves.toMatchObject({ error: "sso_github_org_membership_unverified" });
  });

  it("fails closed when GitHub is configured but the orgs list is unset", async () => {
    const gate = buildSocialSsoUserGate(
      resolveSocialSsoConfig({
        PAPERCLIP_SSO_GITHUB_CLIENT_ID: "gh-id",
        PAPERCLIP_SSO_GITHUB_CLIENT_SECRET: "gh-secret",
      }),
    );
    await expect(
      gate({
        user: { email: "member@acme.dev" },
        source: { action: "create-user", method: "oauth", oauth: { providerId: "github", profile: {} } },
      }),
    ).resolves.toMatchObject({ error: "sso_github_orgs_not_configured" });
  });

  it("accepts a Google sign-up whose hd claim matches a configured domain", async () => {
    const gate = buildSocialSsoUserGate(resolveSocialSsoConfig(configuredEnv));
    await expect(
      gate({
        user: { email: "member@example.com" },
        source: {
          action: "create-user",
          method: "oauth",
          oauth: { providerId: "google", profile: { hd: "example.com", email: "member@example.com" } },
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a Google sign-up whose hd claim is outside the list", async () => {
    const gate = buildSocialSsoUserGate(resolveSocialSsoConfig(configuredEnv));
    await expect(
      gate({
        user: { email: "member@other.com" },
        source: {
          action: "create-user",
          method: "oauth",
          oauth: { providerId: "google", profile: { hd: "other.com" } },
        },
      }),
    ).resolves.toMatchObject({ error: "sso_google_hosted_domain_not_allowed" });
  });

  it("rejects a Google sign-up with no hd claim (plain gmail.com)", async () => {
    const gate = buildSocialSsoUserGate(resolveSocialSsoConfig(configuredEnv));
    await expect(
      gate({
        user: { email: "someone@gmail.com" },
        source: {
          action: "create-user",
          method: "oauth",
          oauth: { providerId: "google", profile: { email: "someone@gmail.com" } },
        },
      }),
    ).resolves.toMatchObject({ error: "sso_google_hosted_domain_required" });
  });

  it("fails closed when Google is configured but the domains list is unset", async () => {
    const gate = buildSocialSsoUserGate(
      resolveSocialSsoConfig({
        PAPERCLIP_SSO_GOOGLE_CLIENT_ID: "goog-id",
        PAPERCLIP_SSO_GOOGLE_CLIENT_SECRET: "goog-secret",
      }),
    );
    await expect(
      gate({
        user: { email: "member@example.com" },
        source: {
          action: "create-user",
          method: "oauth",
          oauth: { providerId: "google", profile: { hd: "example.com" } },
        },
      }),
    ).resolves.toMatchObject({ error: "sso_google_domains_not_configured" });
  });

  it("leaves email/password provisioning and social sign-ins ungated", async () => {
    const gate = buildSocialSsoUserGate(resolveSocialSsoConfig(configuredEnv));
    await expect(
      gate({
        user: { email: "founder@example.com" },
        source: { action: "create-user", method: "email-password" },
      }),
    ).resolves.toBeUndefined();
    await expect(
      gate({
        user: { email: "member@example.com" },
        source: {
          action: "sign-in",
          method: "oauth",
          oauth: { providerId: "github", profile: {} },
        },
      }),
    ).resolves.toBeUndefined();
    await expect(
      gate({
        user: { email: "member@example.com" },
        source: {
          action: "link-account",
          method: "oauth",
          oauth: { providerId: "github", profile: {} },
        },
      }),
    ).resolves.toBeUndefined();
  });
});
