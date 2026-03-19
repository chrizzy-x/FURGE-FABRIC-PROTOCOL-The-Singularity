import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  OperatorLoginResponseSchema,
  OperatorSessionSchema,
  type OperatorLoginRequest,
  type OperatorLoginResponse,
  type OperatorSession
} from "@ffp/shared-types";

const ISSUER = "ffp-layer-zero-api";
const DEFAULT_OPERATOR_USERNAME = "operator";
const DEFAULT_OPERATOR_PASSWORD = "operator";
const DEFAULT_TOKEN_SECRET = "furge-local-operator-secret";
const DEFAULT_TOKEN_TTL_SECONDS = 8 * 60 * 60;
const MAX_FAILED_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

type FailedAttemptRecord = {
  count: number;
  expiresAt: number;
};

type OperatorTokenClaims = {
  iss: string;
  sub: string;
  role: "operator";
  iat: number;
  exp: number;
};

export class OperatorAuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
  }
}

export function createPasswordHash(password: string, salt = randomBytes(16).toString("hex")): string {
  const derivedKey = scryptSync(password, salt, 32).toString("hex");
  return `scrypt:${salt}:${derivedKey}`;
}

export function createOperatorAuth(env: NodeJS.ProcessEnv = process.env) {
  const failedAttempts = new Map<string, FailedAttemptRecord>();
  const username = env.OPERATOR_USERNAME ?? DEFAULT_OPERATOR_USERNAME;
  const passwordHash = env.OPERATOR_PASSWORD_HASH;
  const password = env.OPERATOR_PASSWORD ?? (env.NODE_ENV === "production" ? undefined : DEFAULT_OPERATOR_PASSWORD);
  const tokenSecret = env.OPERATOR_JWT_SECRET ?? (env.NODE_ENV === "production" ? undefined : DEFAULT_TOKEN_SECRET);
  const tokenTtlSeconds = Number(env.OPERATOR_TOKEN_TTL_SECONDS ?? DEFAULT_TOKEN_TTL_SECONDS);

  const ensureConfigured = () => {
    if (!tokenSecret || (!passwordHash && !password)) {
      throw new OperatorAuthError("Operator authentication is not configured", 503);
    }
  };

  const verifyPassword = (candidate: string): boolean => {
    if (passwordHash?.startsWith("scrypt:")) {
      const [, salt, expectedHex] = passwordHash.split(":");
      if (!salt || !expectedHex) {
        return false;
      }

      const actual = Buffer.from(scryptSync(candidate, salt, 32).toString("hex"));
      const expected = Buffer.from(expectedHex);
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    }

    if (!password) {
      return false;
    }

    const actual = Buffer.from(candidate);
    const expected = Buffer.from(password);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  };

  const makeClaims = (): OperatorTokenClaims => {
    const issuedAt = Math.floor(Date.now() / 1000);
    return {
      iss: ISSUER,
      sub: username,
      role: "operator",
      iat: issuedAt,
      exp: issuedAt + tokenTtlSeconds
    };
  };

  const issueToken = (): OperatorLoginResponse => {
    ensureConfigured();
    const claims = makeClaims();
    const encodedPayload = toBase64Url(JSON.stringify(claims));
    const signature = sign(encodedPayload, tokenSecret as string);
    const session = OperatorSessionSchema.parse({
      username: claims.sub,
      role: claims.role,
      issuedAt: new Date(claims.iat * 1000).toISOString(),
      expiresAt: new Date(claims.exp * 1000).toISOString()
    });

    return OperatorLoginResponseSchema.parse({
      token: `${encodedPayload}.${signature}`,
      session
    });
  };

  const trackFailure = (key: string): void => {
    const now = Date.now();
    const existing = failedAttempts.get(key);
    if (!existing || existing.expiresAt <= now) {
      failedAttempts.set(key, { count: 1, expiresAt: now + RATE_LIMIT_WINDOW_MS });
      return;
    }

    failedAttempts.set(key, { count: existing.count + 1, expiresAt: existing.expiresAt });
  };

  const assertRateLimit = (key: string): void => {
    const existing = failedAttempts.get(key);
    if (!existing) {
      return;
    }

    if (existing.expiresAt <= Date.now()) {
      failedAttempts.delete(key);
      return;
    }

    if (existing.count >= MAX_FAILED_ATTEMPTS) {
      throw new OperatorAuthError("Too many failed login attempts", 429);
    }
  };

  const clearFailures = (key: string): void => {
    failedAttempts.delete(key);
  };

  return {
    login(input: OperatorLoginRequest, ipAddress = "unknown"): OperatorLoginResponse {
      ensureConfigured();
      const rateLimitKey = `${ipAddress}:${input.username}`;
      assertRateLimit(rateLimitKey);

      if (input.username !== username || !verifyPassword(input.password)) {
        trackFailure(rateLimitKey);
        throw new OperatorAuthError("Invalid operator credentials", 401);
      }

      clearFailures(rateLimitKey);
      return issueToken();
    },
    authenticate(authorizationHeader?: string): OperatorSession {
      ensureConfigured();
      if (!authorizationHeader?.startsWith("Bearer ")) {
        throw new OperatorAuthError("Missing operator bearer token", 401);
      }

      const token = authorizationHeader.slice("Bearer ".length).trim();
      const [encodedPayload, signature] = token.split(".");
      if (!encodedPayload || !signature) {
        throw new OperatorAuthError("Malformed operator bearer token", 401);
      }

      const expected = sign(encodedPayload, tokenSecret as string);
      const actual = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expected);
      if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) {
        throw new OperatorAuthError("Invalid operator bearer token", 401);
      }

      const claims = JSON.parse(fromBase64Url(encodedPayload)) as OperatorTokenClaims;
      if (claims.iss !== ISSUER || claims.sub !== username || claims.role !== "operator") {
        throw new OperatorAuthError("Operator bearer token is not valid for this service", 401);
      }

      if (claims.exp <= Math.floor(Date.now() / 1000)) {
        throw new OperatorAuthError("Operator bearer token has expired", 401);
      }

      return OperatorSessionSchema.parse({
        username: claims.sub,
        role: claims.role,
        issuedAt: new Date(claims.iat * 1000).toISOString(),
        expiresAt: new Date(claims.exp * 1000).toISOString()
      });
    }
  };
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}