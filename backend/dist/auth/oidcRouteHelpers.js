"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOidcErrorMessage = exports.canonicalizeIssuerUrl = exports.normalizeClaimGroups = exports.readClaimByPath = exports.readBooleanClaim = exports.readStringClaim = exports.decodeFlowPayload = exports.encodeFlowPayload = exports.sanitizeReturnTo = exports.canUseIdTokenSigningAlg = exports.parseJwtAlgMismatchError = exports.resolveIdTokenSignedResponseAlg = exports.normalizeEmail = exports.requestUsesHttps = exports.OIDC_FLOW_TTL_MS = exports.OIDC_PROVIDER_KEY = exports.OIDC_FLOW_COOKIE_NAME = void 0;
const crypto_1 = __importDefault(require("crypto"));
exports.OIDC_FLOW_COOKIE_NAME = "excalidash-oidc-flow";
exports.OIDC_PROVIDER_KEY = "oidc";
exports.OIDC_FLOW_TTL_MS = 10 * 60 * 1000;
const requestUsesHttps = (req) => {
    if (req.secure)
        return true;
    const forwardedProto = req.headers["x-forwarded-proto"];
    const raw = Array.isArray(forwardedProto)
        ? forwardedProto[0]
        : forwardedProto;
    const firstHop = String(raw || "")
        .split(",")[0]
        .trim()
        .toLowerCase();
    return firstHop === "https";
};
exports.requestUsesHttps = requestUsesHttps;
const normalizeEmail = (value) => value.trim().toLowerCase();
exports.normalizeEmail = normalizeEmail;
const resolveIdTokenSignedResponseAlg = (configuredAlg, hasClientSecret, issuerMetadata) => {
    if (configuredAlg)
        return configuredAlg;
    const advertised = issuerMetadata.id_token_signing_alg_values_supported;
    if (Array.isArray(advertised)) {
        const supported = advertised
            .filter((value) => typeof value === "string" && value.trim().length > 0)
            .map((value) => value.trim());
        if (supported.length > 0) {
            const preferred = [
                "RS256",
                "PS256",
                "ES256",
                "EdDSA",
                "RS384",
                "PS384",
                "ES384",
                "RS512",
                "PS512",
                "ES512",
            ];
            for (const candidate of preferred) {
                if (supported.includes(candidate)) {
                    return candidate;
                }
            }
            const firstAsymmetric = supported.find((alg) => !/^HS/i.test(alg) && alg.toLowerCase() !== "none");
            if (firstAsymmetric)
                return firstAsymmetric;
            const hsSupported = supported.filter((alg) => /^HS/i.test(alg));
            if (hsSupported.length > 0) {
                if (!hasClientSecret) {
                    throw new Error("OIDC provider only advertises HS* ID token signing algorithms, but OIDC_CLIENT_SECRET is not configured. " +
                        "Fix: set OIDC_CLIENT_SECRET for a confidential client, or configure your provider/client to sign ID tokens with an asymmetric algorithm (for example RS256).");
                }
                const preferredHs = ["HS256", "HS384", "HS512"];
                for (const candidate of preferredHs) {
                    if (hsSupported.includes(candidate))
                        return candidate;
                }
                return hsSupported[0];
            }
        }
    }
    return "RS256";
};
exports.resolveIdTokenSignedResponseAlg = resolveIdTokenSignedResponseAlg;
const parseJwtAlgMismatchError = (error) => {
    if (!(error instanceof Error))
        return null;
    const match = error.message.match(/expected\s+([A-Za-z0-9_-]+)\s*,\s*got:\s*([A-Za-z0-9_-]+)/i);
    if (!match)
        return null;
    return {
        expected: String(match[1]).toUpperCase(),
        got: String(match[2]).toUpperCase(),
    };
};
exports.parseJwtAlgMismatchError = parseJwtAlgMismatchError;
const canUseIdTokenSigningAlg = (alg, hasClientSecret) => {
    if (alg.toLowerCase() === "none")
        return false;
    if (/^HS/i.test(alg))
        return hasClientSecret;
    return true;
};
exports.canUseIdTokenSigningAlg = canUseIdTokenSigningAlg;
const sanitizeReturnTo = (rawValue) => {
    if (typeof rawValue !== "string")
        return "/";
    const value = rawValue.trim();
    if (!value.startsWith("/"))
        return "/";
    if (value.startsWith("//"))
        return "/";
    if (/[\r\n]/.test(value))
        return "/";
    if (value.length > 2048)
        return "/";
    return value;
};
exports.sanitizeReturnTo = sanitizeReturnTo;
const base64UrlEncode = (value) => {
    const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : value;
    return buffer
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
};
const base64UrlDecode = (value) => {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, "base64");
};
const signFlowPayload = (encodedPayload, secret) => base64UrlEncode(crypto_1.default.createHmac("sha256", secret).update(encodedPayload, "utf8").digest());
const encodeFlowPayload = (payload, secret) => {
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = signFlowPayload(encodedPayload, secret);
    return `${encodedPayload}.${signature}`;
};
exports.encodeFlowPayload = encodeFlowPayload;
const decodeFlowPayload = (cookieValue, secret) => {
    if (!cookieValue)
        return null;
    const [encodedPayload, providedSignature] = cookieValue.split(".");
    if (!encodedPayload || !providedSignature)
        return null;
    try {
        const expectedSignature = signFlowPayload(encodedPayload, secret);
        const expectedBuffer = Buffer.from(expectedSignature, "utf8");
        const providedBuffer = Buffer.from(providedSignature, "utf8");
        if (expectedBuffer.length !== providedBuffer.length)
            return null;
        if (!crypto_1.default.timingSafeEqual(expectedBuffer, providedBuffer))
            return null;
        const parsed = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
        if (typeof parsed.state !== "string" ||
            typeof parsed.nonce !== "string" ||
            typeof parsed.codeVerifier !== "string" ||
            typeof parsed.returnTo !== "string" ||
            typeof parsed.expiresAt !== "number") {
            return null;
        }
        if (Date.now() > parsed.expiresAt)
            return null;
        return {
            state: parsed.state,
            nonce: parsed.nonce,
            codeVerifier: parsed.codeVerifier,
            returnTo: (0, exports.sanitizeReturnTo)(parsed.returnTo),
            expiresAt: parsed.expiresAt,
        };
    }
    catch {
        return null;
    }
};
exports.decodeFlowPayload = decodeFlowPayload;
const readStringClaim = (claims, key) => {
    const value = claims[key];
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};
exports.readStringClaim = readStringClaim;
const readBooleanClaim = (claims, key) => {
    const value = claims[key];
    if (typeof value === "boolean")
        return value;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true" || normalized === "1")
            return true;
        if (normalized === "false" || normalized === "0")
            return false;
    }
    return null;
};
exports.readBooleanClaim = readBooleanClaim;
const readClaimByPath = (claims, keyPath) => {
    const segments = keyPath
        .split(".")
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);
    if (segments.length === 0)
        return undefined;
    let current = claims;
    for (const segment of segments) {
        if (typeof current !== "object" || current === null)
            return undefined;
        current = current[segment];
    }
    return current;
};
exports.readClaimByPath = readClaimByPath;
const normalizeClaimGroups = (value) => {
    if (Array.isArray(value)) {
        return value
            .filter((entry) => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);
    }
    if (typeof value === "string") {
        return value
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);
    }
    return [];
};
exports.normalizeClaimGroups = normalizeClaimGroups;
const canonicalizeIssuerUrl = (issuer) => {
    const trimmed = issuer.trim();
    if (!trimmed)
        return trimmed;
    try {
        const parsed = new URL(trimmed);
        parsed.pathname = parsed.pathname.replace(/\/+$/, "");
        return parsed.toString().replace(/\/+$/, "");
    }
    catch {
        return trimmed.replace(/\/+$/, "");
    }
};
exports.canonicalizeIssuerUrl = canonicalizeIssuerUrl;
const getOidcErrorMessage = (errorCode) => {
    switch (errorCode) {
        case "missing_flow":
            return "Missing or expired OIDC login flow. Please try again.";
        case "provider_error":
            return "OIDC provider returned an error.";
        case "missing_subject":
            return "OIDC response is missing required subject claim.";
        case "missing_email":
            return "OIDC response is missing required email claim.";
        case "unverified_email":
            return "OIDC account email is not verified.";
        case "account_inactive":
            return "Your account is inactive.";
        case "provisioning_disabled":
            return "No account found. Ask an admin to create your account or enable OIDC auto-provisioning.";
        case "callback_failed":
            return "OIDC callback validation failed.";
        default:
            return "OIDC sign-in failed.";
    }
};
exports.getOidcErrorMessage = getOidcErrorMessage;
