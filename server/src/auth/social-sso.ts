/**
 * Optional social sign-in (SSO) for authenticated deployments.
 *
 * Providers are registered on the Better Auth instance only when their OAuth
 * client pair is configured, and each provider carries a membership gate that
 * runs on social *sign-up* and social *account linking* through Better Auth's
 * `user.validateUserInfo` hook (better-auth@1.7.2). The hook fires before the
 * user or account row is written, so a rejected attempt leaves no user,
 * account, or session rows behind. `PAPERCLIP_AUTH_DISABLE_SIGN_UP` is mirrored
 * onto each provider's `disableSignUp` option, locking social registration
 * exactly like email/password registration.
 *
 * - GitHub: the user's OAuth token must show an active membership in one of
 *   `PAPERCLIP_SSO_GITHUB_ORGS` (GET /user/memberships/orgs?state=active).
 * - Google: the verified id_token `hd` claim must match one of
 *   `PAPERCLIP_SSO_GOOGLE_DOMAINS`. A plain `gmail.com` account has no `hd`
 *   claim and is rejected by design.
 *
 * If a provider is configured but its gate list is not, social sign-ups for
 * that provider fail closed: they are rejected with a clear error and the
 * reason is logged, and the health surface reports the provider as
 * unavailable. Email/password sign-up is untouched — it remains governed
 * by `PAPERCLIP_AUTH_DISABLE_SIGN_UP` exactly as before.
 */

import { github as githubSocialProvider } from "better-auth/social-providers";
import type { GithubOptions } from "better-auth/social-providers";
import type { GithubProfile } from "better-auth/social-providers";
import { logger } from "../middleware/logger.js";

export type SocialSsoProviderId = "github" | "google";

export type SocialSsoGitHubConfig = {
  clientId: string;
  clientSecret: string;
  /** Lowercased org logins; empty means the gate is unconfigured (fail closed). */
  orgs: string[];
};

export type SocialSsoGoogleConfig = {
  clientId: string;
  clientSecret: string;
  /** Lowercased hosted domains; empty means the gate is unconfigured (fail closed). */
  domains: string[];
};

export type SocialSsoConfig = {
  github: SocialSsoGitHubConfig | null;
  google: SocialSsoGoogleConfig | null;
};

export type SocialSsoProviderOptions = {
  github?: GithubOptions;
  google?: { clientId: string; clientSecret: string; disableSignUp?: boolean };
};

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_MEMBERSHIPS_PAGE_SIZE = 100;
/** Users with more orgs than this across pages fail closed instead of hanging. */
const GITHUB_MEMBERSHIPS_MAX_PAGES = 10;
/** Per-request budget for each membership page; a stalled API fails closed. */
const GITHUB_MEMBERSHIPS_TIMEOUT_MS = 10_000;

/**
 * Key on the GitHub profile record that carries the org-gate verdict from the
 * provider `getUserInfo` override (which sees the OAuth token) to the
 * `validateUserInfo` hook (which must decide before any row is written). The
 * profile flows between the two inside Better Auth's callback pipeline; the
 * namespaced key cannot collide with GitHub's `/user` response fields.
 */
const GITHUB_ORG_GATE_PROFILE_KEY = "paperclipSsoOrgGate";

export type GitHubOrgGateVerdict = {
  /** The membership lookup itself succeeded (HTTP 2xx, all pages read). */
  verified: boolean;
  /** The user holds an active membership in at least one configured org. */
  allowed: boolean;
};

export function parseCsvList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function firstConfiguredString(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

/**
 * Resolve the social SSO configuration from an environment. A provider is
 * configured only when BOTH its client id and secret are set; anything less is
 * treated as "not configured" so a half-set deployment keeps today's
 * provider-less behavior instead of failing at exchange time.
 */
export function resolveSocialSsoConfig(env: NodeJS.ProcessEnv): SocialSsoConfig {
  const githubClientId = firstConfiguredString(env.PAPERCLIP_SSO_GITHUB_CLIENT_ID);
  const githubClientSecret = firstConfiguredString(env.PAPERCLIP_SSO_GITHUB_CLIENT_SECRET);
  const googleClientId = firstConfiguredString(env.PAPERCLIP_SSO_GOOGLE_CLIENT_ID);
  const googleClientSecret = firstConfiguredString(env.PAPERCLIP_SSO_GOOGLE_CLIENT_SECRET);
  return {
    github: githubClientId && githubClientSecret
      ? {
          clientId: githubClientId,
          clientSecret: githubClientSecret,
          orgs: parseCsvList(env.PAPERCLIP_SSO_GITHUB_ORGS),
        }
      : null,
    google: googleClientId && googleClientSecret
      ? {
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          domains: parseCsvList(env.PAPERCLIP_SSO_GOOGLE_DOMAINS),
        }
      : null,
  };
}

/**
 * Which providers are available, for the public health surface. Booleans only —
 * never client ids, secrets, or gate lists.
 *
 * A provider counts as available only when its client pair is set AND its gate
 * list is non-empty: an empty gate list is a guaranteed-reject configuration
 * (every sign-up fails closed), so advertising the provider would render a
 * button that can never succeed. The provider stays registered on the auth
 * instance either way — the fail-closed gate error remains the backstop.
 */
export function resolveSocialSsoProviderAvailability(
  config: SocialSsoConfig,
): { github: boolean; google: boolean } {
  return {
    github: config.github !== null && config.github.orgs.length > 0,
    google: config.google !== null && config.google.domains.length > 0,
  };
}

export function isSocialSsoConfigured(config: SocialSsoConfig): boolean {
  return config.github !== null || config.google !== null;
}

export function isGoogleHostedDomainAllowed(domains: string[], hostedDomain: unknown): boolean {
  if (typeof hostedDomain !== "string") return false;
  const normalized = hostedDomain.trim().toLowerCase();
  if (!normalized) return false;
  return domains.includes(normalized);
}

type LinkHeaderValue = string | null;

/**
 * The `rel="next"` URL from a Link header, when present and when it stays on
 * the origin of the API base the lookup started from. The bearer token rides
 * every page request, so pagination must never be steered off-origin: a
 * rewritten Link header must not be able to send the user's GitHub token to an
 * arbitrary host. Returns `hostile: true` when a next URL exists but points
 * elsewhere so the caller can fail closed instead of silently stopping early.
 */
function nextGitHubMembershipsPageUrl(
  response: Response,
  allowedOrigin: string,
): { url: URL | null; hostile: boolean } {
  const link = response.headers.get("link") as LinkHeaderValue;
  if (!link) return { url: null, hostile: false };
  // GitHub paginates via a Link header: `<https://api.github.com/...&page=2>; rel="next", <...>; rel="first"`.
  for (const part of link.split(",")) {
    const [rawUrl, ...params] = part.split(";");
    const rel = params
      .map((param) => param.trim().toLowerCase())
      .find((param) => param.startsWith('rel="'));
    if (!rel || rel !== 'rel="next"') continue;
    const url = rawUrl?.trim().replace(/^<|>$/g, "");
    if (!url) return { url: null, hostile: false };
    try {
      const nextUrl = new URL(url);
      if (nextUrl.origin !== allowedOrigin) {
        logger.warn(
          { nextUrl: url, allowedOrigin },
          "Social SSO GitHub org membership Link header pointed off-origin; failing closed",
        );
        return { url: null, hostile: true };
      }
      return { url: nextUrl, hostile: false };
    } catch {
      return { url: null, hostile: false };
    }
  }
  return { url: null, hostile: false };
}

export type GitHubOrgMembershipResult = {
  /** The lookup succeeded; `orgs` is authoritative. False ⇒ fail closed. */
  ok: boolean;
  /** Lowercased logins of orgs the user is an active member of. */
  orgs: string[];
  /**
   * The org list is known to be incomplete (pagination exceeded the page
   * budget or was steered off-origin). Always accompanies `ok: false` — a
   * partial list is never presented as authoritative.
   */
  truncated?: boolean;
};

/**
 * Ask GitHub which orgs the user's OAuth token holds an *active* membership in.
 * `read:org` is not requested by default, so this uses the same user-scoped
 * endpoint the GitHub UI itself uses; orgs that only invited (pending) the user
 * are excluded by `state=active`. Any transport or HTTP failure — including a
 * page that stalls past the per-request timeout, pagination that exceeds the
 * page budget, or a Link header that tries to steer pagination off-origin —
 * reports `ok: false` so callers can fail closed.
 */
export async function fetchActiveGitHubOrgMemberships(
  accessToken: string,
  opts: {
    fetchImpl?: typeof globalThis.fetch;
    apiBaseUrl?: string;
    maxPages?: number;
    timeoutMs?: number;
  } = {},
): Promise<GitHubOrgMembershipResult> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const baseUrl = opts.apiBaseUrl ?? GITHUB_API_BASE_URL;
  const apiOrigin = new URL(baseUrl).origin;
  const maxPages = opts.maxPages ?? GITHUB_MEMBERSHIPS_MAX_PAGES;
  const timeoutMs = opts.timeoutMs ?? GITHUB_MEMBERSHIPS_TIMEOUT_MS;
  const orgs = new Set<string>();

  let url: URL | null = new URL(
    `/user/memberships/orgs?state=active&per_page=${GITHUB_MEMBERSHIPS_PAGE_SIZE}`,
    baseUrl,
  );
  let pages = 0;
  while (url && pages < maxPages) {
    pages += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/vnd.github+json",
          "user-agent": "paperclip",
        },
        signal: controller.signal,
      });
    } catch (error) {
      logger.warn({ err: error }, "Social SSO GitHub org membership lookup failed");
      return { ok: false, orgs: [] };
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      logger.warn(
        { status: response.status },
        "Social SSO GitHub org membership lookup returned an error status",
      );
      return { ok: false, orgs: [] };
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      logger.warn({ err: error }, "Social SSO GitHub org membership response was not JSON");
      return { ok: false, orgs: [] };
    }
    if (!Array.isArray(payload)) {
      logger.warn("Social SSO GitHub org membership response had an unexpected shape");
      return { ok: false, orgs: [] };
    }
    for (const membership of payload) {
      if (!membership || typeof membership !== "object") continue;
      const state = (membership as { state?: unknown }).state;
      const login = (membership as { organization?: { login?: unknown } }).organization?.login;
      // `state=active` is requested, but keep the filter so a proxy that
      // ignores query params cannot turn pending invitations into access.
      if (state !== "active" || typeof login !== "string") continue;
      const normalized = login.trim().toLowerCase();
      if (normalized) orgs.add(normalized);
    }
    const next = nextGitHubMembershipsPageUrl(response, apiOrigin);
    if (next.hostile) {
      return { ok: false, orgs: [], truncated: true };
    }
    url = next.url;
  }

  if (url) {
    // The loop stopped on the page budget while a next page still exists: the
    // collected list is partial, so the verdict must not claim verification.
    logger.warn(
      { pages, maxPages },
      "Social SSO GitHub org membership pagination exceeded the page budget; failing closed on a truncated org list",
    );
    return { ok: false, orgs: [], truncated: true };
  }

  return { ok: true, orgs: [...orgs] };
}

function githubOrgGateVerdictFromProfile(profile: unknown): GitHubOrgGateVerdict | null {
  if (!profile || typeof profile !== "object") return null;
  const verdict = (profile as Record<string, unknown>)[GITHUB_ORG_GATE_PROFILE_KEY];
  if (!verdict || typeof verdict !== "object") return null;
  const { verified, allowed } = verdict as { verified?: unknown; allowed?: unknown };
  if (typeof verified !== "boolean" || typeof allowed !== "boolean") return null;
  return { verified, allowed };
}

/**
 * Build the Better Auth `socialProviders` entries for the configured
 * providers. Returns null when none are configured so the caller adds no
 * `socialProviders` key at all.
 *
 * `disableSignUp` mirrors `PAPERCLIP_AUTH_DISABLE_SIGN_UP` onto every
 * configured provider: Better Auth then refuses to provision *new* users over
 * the social path (the same contract the email/password path already has),
 * while existing users keep signing in.
 *
 * GitHub's entry wraps the stock provider's `getUserInfo` purely to record the
 * org-membership verdict on the profile: that override is the only supported
 * surface that sees the user's OAuth access token, and the profile is what
 * Better Auth hands to `validateUserInfo` before any row is written. The
 * mapped user and every stock profile field pass through unchanged.
 */
export function buildSocialSsoProviderOptions(
  config: SocialSsoConfig,
  opts: {
    disableSignUp?: boolean;
    fetchImpl?: typeof globalThis.fetch;
    apiBaseUrl?: string;
  } = {},
): SocialSsoProviderOptions | null {
  const providers: SocialSsoProviderOptions = {};

  if (config.github) {
    const orgs = config.github.orgs;
    const stockProvider = githubSocialProvider({
      clientId: config.github.clientId,
      clientSecret: config.github.clientSecret,
    });
    const stockGetUserInfo = stockProvider.getUserInfo.bind(stockProvider);
    providers.github = {
      clientId: config.github.clientId,
      clientSecret: config.github.clientSecret,
      // The stock scopes (read:user, user:email) do not cover the membership
      // lookup below: GitHub answers /user/memberships/orgs with a 403 unless
      // the token carries read:org (or user), which would fail every GitHub
      // sign-up closed. This appends to the stock scopes, it does not replace
      // them.
      scope: ["read:org"],
      ...(opts.disableSignUp ? { disableSignUp: true } : {}),
      getUserInfo: async (token) => {
        const result = await stockGetUserInfo(token);
        if (!result?.user) return result;
        const accessToken = token.accessToken;
        if (orgs.length === 0 || typeof accessToken !== "string" || !accessToken) {
          // Unverifiable: record a fail-closed verdict. The validateUserInfo
          // gate turns the empty org list into a clearer not-configured error.
          const verdict: GitHubOrgGateVerdict = { verified: false, allowed: false };
          return {
            user: result.user,
            data: { ...result.data, [GITHUB_ORG_GATE_PROFILE_KEY]: verdict } as GithubProfile,
          };
        }
        const membership = await fetchActiveGitHubOrgMemberships(accessToken, {
          fetchImpl: opts.fetchImpl,
          apiBaseUrl: opts.apiBaseUrl,
        });
        const verdict: GitHubOrgGateVerdict = {
          verified: membership.ok,
          allowed: membership.ok && orgs.some((org) => membership.orgs.includes(org)),
        };
        return {
          user: result.user,
          data: { ...result.data, [GITHUB_ORG_GATE_PROFILE_KEY]: verdict } as GithubProfile,
        };
      },
    };
  }

  if (config.google) {
    // The hosted-domain gate needs a *list* of domains, which the stock
    // provider's single-value `hd` option cannot express; the hd check runs in
    // validateUserInfo against the id_token claims Better Auth already
    // verified and decoded into the profile.
    providers.google = {
      clientId: config.google.clientId,
      clientSecret: config.google.clientSecret,
      ...(opts.disableSignUp ? { disableSignUp: true } : {}),
    };
  }

  return providers.github || providers.google ? providers : null;
}

export type SocialSsoUserGateInput = {
  user: Record<string, unknown>;
  source: {
    action?: string;
    method?: string;
    oauth?: { providerId?: string; profile?: Record<string, unknown> } | undefined;
  };
};

export type SocialSsoUserGateResult = {
  error: string;
  errorDescription?: string;
};

/**
 * Build the Better Auth `user.validateUserInfo` hook that gates social
 * sign-up. Runs before the user row is created; returning `{ error }` rejects
 * the sign-up with a 403 (browser flows redirect to the auth error URL).
 *
 * Scope: `create-user` AND `link-account`, and only for the two providers this
 * feature registers. Better Auth invokes the hook for the implicit email-match
 * link that runs during a social sign-in, so exempting link-account would let
 * a pre-existing local account attach an SSO identity without passing the org
 * or hosted-domain gate. Sign-ins of already-linked accounts and email/password
 * sign-up are not re-validated here.
 */
export function buildSocialSsoUserGate(config: SocialSsoConfig): (
  data: SocialSsoUserGateInput,
) => Promise<SocialSsoUserGateResult | void> {
  return async (data) => {
    const source = data.source;
    if (source.method !== "oauth") return;
    if (source.action !== "create-user" && source.action !== "link-account") return;
    const providerId = source.oauth?.providerId;
    const profile = source.oauth?.profile;

    if (providerId === "github") {
      const orgs = config.github?.orgs ?? [];
      if (orgs.length === 0) {
        logger.warn(
          "Social SSO fail-closed: GitHub provider is configured but PAPERCLIP_SSO_GITHUB_ORGS is unset or empty; rejecting GitHub sign-ups",
        );
        return {
          error: "sso_github_orgs_not_configured",
          errorDescription:
            "Sign-in with GitHub is disabled because no allowed organizations are configured on this server.",
        };
      }
      const verdict = githubOrgGateVerdictFromProfile(profile);
      if (!verdict || !verdict.verified) {
        logger.warn(
          "Social SSO fail-closed: GitHub org membership could not be verified; rejecting GitHub sign-up",
        );
        return {
          error: "sso_github_org_membership_unverified",
          errorDescription:
            "Sign-in with GitHub could not verify your organization membership. Try again, and contact the operator if it keeps failing.",
        };
      }
      if (!verdict.allowed) {
        return {
          error: "sso_github_org_membership_required",
          errorDescription:
            "Sign-in with GitHub is limited to members of the organizations configured on this server.",
        };
      }
      return;
    }

    if (providerId === "google") {
      const domains = config.google?.domains ?? [];
      if (domains.length === 0) {
        logger.warn(
          "Social SSO fail-closed: Google provider is configured but PAPERCLIP_SSO_GOOGLE_DOMAINS is unset or empty; rejecting Google sign-ups",
        );
        return {
          error: "sso_google_domains_not_configured",
          errorDescription:
            "Sign-in with Google is disabled because no allowed hosted domains are configured on this server.",
        };
      }
      const hostedDomain = profile?.hd;
      if (typeof hostedDomain !== "string" || !hostedDomain.trim()) {
        return {
          error: "sso_google_hosted_domain_required",
          errorDescription:
            "Sign-in with Google is limited to accounts from the hosted domains configured on this server; personal Google accounts are not allowed.",
        };
      }
      if (!isGoogleHostedDomainAllowed(domains, hostedDomain)) {
        return {
          error: "sso_google_hosted_domain_not_allowed",
          errorDescription:
            "Sign-in with Google is limited to accounts from the hosted domains configured on this server.",
        };
      }
      return;
    }
  };
}
