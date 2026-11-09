"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = exports.authModeEnablesAuth = exports.validatePasswordAgainstPolicy = exports.buildPasswordPolicyMessage = void 0;
/**
 * Configuration validation and environment variable management
 */
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const passwordPolicy_1 = require("./config/passwordPolicy");
Object.defineProperty(exports, "buildPasswordPolicyMessage", { enumerable: true, get: function () { return passwordPolicy_1.buildPasswordPolicyMessage; } });
Object.defineProperty(exports, "validatePasswordAgainstPolicy", { enumerable: true, get: function () { return passwordPolicy_1.validatePasswordAgainstPolicy; } });
const production_1 = require("./config/production");
const storageValidation_1 = require("./config/storageValidation");
const env_1 = require("./config/env");
const derived_1 = require("./config/derived");
const mail_1 = require("./config/mail");
const oidcSecret_1 = require("./config/oidcSecret");
dotenv_1.default.config();
// True only for env-enforced (OIDC-backed) modes; `local` uses the runtime toggle, `disabled` turns auth off.
const authModeEnablesAuth = (mode) => mode === "hybrid" || mode === "oidc_enforced";
exports.authModeEnablesAuth = authModeEnablesAuth;
const ALLOWED_OIDC_ID_TOKEN_ALGS = new Set([
    "RS256",
    "RS384",
    "RS512",
    "PS256",
    "PS384",
    "PS512",
    "ES256",
    "ES384",
    "ES512",
    "EdDSA",
    "HS256",
    "HS384",
    "HS512",
]);
const getOptionalOidcSigningAlg = (key) => {
    const raw = (0, env_1.readRaw)(key);
    if (!raw)
        return null;
    const normalized = raw.trim();
    if (normalized.length === 0 || normalized.toLowerCase() === "none") {
        throw new Error(`${key} must not be empty or 'none'`);
    }
    if (!ALLOWED_OIDC_ID_TOKEN_ALGS.has(normalized)) {
        throw new Error(`${key} must be one of: ${Array.from(ALLOWED_OIDC_ID_TOKEN_ALGS).join(", ")}`);
    }
    return normalized;
};
const getOptionalOidcTokenEndpointAuthMethod = (key) => {
    const raw = (0, env_1.readRaw)(key);
    if (!raw)
        return null;
    const normalized = raw.trim().toLowerCase();
    if (normalized.length === 0)
        return null;
    if (normalized === "none" ||
        normalized === "client_secret_basic" ||
        normalized === "client_secret_post") {
        return normalized;
    }
    throw new Error(`${key} must be one of: none, client_secret_basic, client_secret_post`);
};
const resolveJwtSecret = (nodeEnv) => {
    const provided = (0, env_1.readRaw)("JWT_SECRET");
    if (provided && provided.trim().length > 0) {
        return provided;
    }
    if (nodeEnv === "production") {
        throw new Error("Missing required environment variable: JWT_SECRET");
    }
    const generated = crypto_1.default.randomBytes(32).toString("hex");
    console.warn("[security] JWT_SECRET is not set (non-production). Using an ephemeral secret; tokens will be invalidated on restart.");
    return generated;
};
const parseFrontendUrl = (raw) => {
    if (!raw || raw.trim().length === 0)
        return undefined;
    const normalized = raw
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
        .join(",");
    return normalized.length > 0 ? normalized : undefined;
};
const resolveDatabaseUrl = (rawUrl) => {
    const backendRoot = path_1.default.resolve(__dirname, "../");
    const defaultDbPath = path_1.default.resolve(backendRoot, "prisma/dev.db");
    if (!rawUrl || rawUrl.trim().length === 0) {
        return `file:${defaultDbPath}`;
    }
    if (!rawUrl.startsWith("file:")) {
        return rawUrl;
    }
    const filePath = rawUrl.replace(/^file:/, "");
    const prismaDir = path_1.default.resolve(backendRoot, "prisma");
    const normalizedRelative = filePath.replace(/^\.\/?/, "");
    const hasLeadingPrismaDir = normalizedRelative === "prisma" || normalizedRelative.startsWith("prisma/");
    const absolutePath = path_1.default.isAbsolute(filePath)
        ? filePath
        : path_1.default.resolve(hasLeadingPrismaDir ? backendRoot : prismaDir, normalizedRelative);
    return `file:${absolutePath}`;
};
process.env.DATABASE_URL = resolveDatabaseUrl(process.env.DATABASE_URL);
const parseAuthMode = (rawValue) => {
    const normalized = (rawValue || "local").trim().toLowerCase();
    if (normalized === "local" ||
        normalized === "hybrid" ||
        normalized === "oidc_enforced" ||
        normalized === "disabled") {
        return normalized;
    }
    throw new Error("Invalid AUTH_MODE. Expected one of: local, hybrid, oidc_enforced, disabled");
};
const resolveOidcConfig = (authMode) => {
    const issuerUrl = (0, env_1.readOptionalString)("OIDC_ISSUER_URL");
    const discoveryUrl = (0, env_1.readOptionalString)("OIDC_DISCOVERY_URL");
    const clientId = (0, env_1.readOptionalString)("OIDC_CLIENT_ID");
    const clientSecret = (0, oidcSecret_1.resolveOidcClientSecret)();
    const redirectUri = (0, env_1.readOptionalString)("OIDC_REDIRECT_URI");
    const groupsClaim = (0, env_1.readString)("OIDC_GROUPS_CLAIM", "groups").trim();
    const adminGroups = (0, env_1.readCsv)("OIDC_ADMIN_GROUPS");
    const requiredWhenEnabled = {
        OIDC_ISSUER_URL: issuerUrl,
        OIDC_CLIENT_ID: clientId,
        OIDC_REDIRECT_URI: redirectUri,
    };
    if (groupsClaim.length === 0) {
        throw new Error("Invalid OIDC_GROUPS_CLAIM: must be a non-empty claim key/path");
    }
    const enabled = (0, exports.authModeEnablesAuth)(authMode);
    const missingRequired = Object.entries(requiredWhenEnabled)
        .filter(([, value]) => !value)
        .map(([key]) => key);
    if (enabled && missingRequired.length > 0) {
        throw new Error(`AUTH_MODE=${authMode} requires OIDC configuration. Missing: ${missingRequired.join(", ")}`);
    }
    if (!enabled) {
        const hasOidcVars = Object.values(requiredWhenEnabled).some((value) => Boolean(value)) ||
            adminGroups.length > 0;
        if (hasOidcVars) {
            console.warn(`[config] AUTH_MODE=${authMode}; ignoring OIDC_* provider settings.`);
        }
    }
    const idTokenSignedResponseAlg = enabled
        ? getOptionalOidcSigningAlg("OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG")
        : null;
    const tokenEndpointAuthMethod = enabled
        ? getOptionalOidcTokenEndpointAuthMethod("OIDC_TOKEN_ENDPOINT_AUTH_METHOD")
        : null;
    if (enabled &&
        idTokenSignedResponseAlg &&
        /^HS/i.test(idTokenSignedResponseAlg) &&
        !clientSecret) {
        throw new Error("OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG using HS* requires OIDC_CLIENT_SECRET for a confidential client");
    }
    return {
        enabled,
        enforced: authMode === "oidc_enforced",
        providerName: (0, env_1.readString)("OIDC_PROVIDER_NAME", "OIDC"),
        issuerUrl,
        discoveryUrl,
        clientId,
        clientSecret,
        redirectUri,
        idTokenSignedResponseAlg,
        tokenEndpointAuthMethod,
        scopes: (0, env_1.readString)("OIDC_SCOPES", "openid profile email"),
        emailClaim: (0, env_1.readString)("OIDC_EMAIL_CLAIM", "email"),
        emailVerifiedClaim: (0, env_1.readString)("OIDC_EMAIL_VERIFIED_CLAIM", "email_verified"),
        groupsClaim,
        adminGroups,
        requireEmailVerified: (0, env_1.readBoolean)("OIDC_REQUIRE_EMAIL_VERIFIED", true),
        jitProvisioning: (0, env_1.readBoolean)("OIDC_JIT_PROVISIONING", true),
        firstUserAdmin: (0, env_1.readBoolean)("OIDC_FIRST_USER_ADMIN", true),
    };
};
const resolveBackupConfig = () => {
    const backupDir = (0, env_1.readOptionalString)("BACKUP_DIR") || path_1.default.resolve(__dirname, "../backups");
    return {
        schedule: (0, env_1.readOptionalString)("BACKUP_SCHEDULE"),
        dir: backupDir,
        retentionDays: (0, env_1.readNumber)("BACKUP_RETENTION_DAYS", 14),
    };
};
const resolvedAuthMode = parseAuthMode((0, env_1.readRaw)("AUTH_MODE"));
const resolvedNodeEnv = (0, env_1.readString)("NODE_ENV", "development");
(0, storageValidation_1.validateS3Configuration)();
const fileUploadMaxMb = (0, storageValidation_1.resolveFileUploadMaxMb)();
const resolveS3Config = () => ({
    bucket: (0, env_1.readOptionalString)("S3_BUCKET"),
    region: (0, env_1.readString)("S3_REGION", "us-east-1"),
    endpoint: (0, env_1.readOptionalString)("S3_ENDPOINT"),
    publicUrl: (0, env_1.readOptionalString)("S3_PUBLIC_URL"),
    forcePathStyle: (0, env_1.readString)("S3_FORCE_PATH_STYLE", "false").toLowerCase() === "true",
    keyPrefix: (0, env_1.readRaw)("S3_KEY_PREFIX")?.replace(/\/+$/, "") || "excalidash",
    accessKeyId: (0, env_1.readOptionalString)("AWS_ACCESS_KEY_ID"),
    secretAccessKey: (0, env_1.readOptionalString)("AWS_SECRET_ACCESS_KEY"),
});
exports.config = {
    port: (0, env_1.readNumber)("PORT", 8000),
    listenHost: (0, env_1.readString)("BACKEND_HOST", "0.0.0.0"),
    nodeEnv: resolvedNodeEnv,
    buildLabel: (0, env_1.readOptionalString)("APP_BUILD_LABEL"),
    isDev: resolvedNodeEnv === "development",
    isProduction: resolvedNodeEnv === "production",
    databaseUrl: process.env.DATABASE_URL,
    frontendUrl: parseFrontendUrl((0, env_1.readRaw)("FRONTEND_URL")),
    trustProxy: (0, derived_1.parseTrustProxy)(),
    drawingsCacheTtlMs: (0, derived_1.parseDrawingsCacheTtlMs)(),
    authMode: resolvedAuthMode,
    jwtSecret: resolveJwtSecret(resolvedNodeEnv),
    jwtAccessExpiresIn: (0, env_1.readString)("JWT_ACCESS_EXPIRES_IN", "15m"),
    jwtRefreshExpiresIn: (0, env_1.readString)("JWT_REFRESH_EXPIRES_IN", "7d"),
    rateLimitMaxRequests: (0, env_1.readNumber)("RATE_LIMIT_MAX_REQUESTS", 1000),
    rateLimitWindowMs: (0, env_1.readNumber)("RATE_LIMIT_WINDOW_MS", 900000),
    csrfMaxRequests: (0, env_1.readNumber)("CSRF_MAX_REQUESTS", 60),
    csrfRateLimitWindowMs: (0, env_1.readNumber)("CSRF_RATE_LIMIT_WINDOW_MS", 60000),
    snapshotRetentionMs: (0, env_1.readNumber)("SNAPSHOT_RETENTION_DAYS", 2) * 24 * 60 * 60 * 1000,
    uploadMaxBytes: (0, env_1.readNumber)("UPLOAD_MAX_MB", 100) * 1024 * 1024,
    bodyLimitMb: (0, env_1.readNumber)("BODY_LIMIT_MB", 50),
    fileUploadMaxMb,
    fileUploadMaxBytes: fileUploadMaxMb * 1024 * 1024,
    csrfSecret: (0, env_1.readRaw)("CSRF_SECRET") || null,
    debugCsrf: (0, env_1.readRaw)("DEBUG_CSRF") === "true",
    apiKeyHashPepper: (0, env_1.readRaw)("API_KEY_HASH_PEPPER") || "api-key-hash-pepper",
    oidc: resolveOidcConfig(resolvedAuthMode),
    enablePasswordReset: (0, env_1.readBoolean)("ENABLE_PASSWORD_RESET", false),
    enableRefreshTokenRotation: (0, env_1.readBoolean)("ENABLE_REFRESH_TOKEN_ROTATION", true),
    enableAuditLogging: (0, env_1.readBoolean)("ENABLE_AUDIT_LOGGING", false),
    enforceHttpsRedirect: (0, env_1.readBoolean)("ENFORCE_HTTPS_REDIRECT", true),
    disableOnboardingGate: (0, env_1.readRaw)("DISABLE_ONBOARDING_GATE") === "true",
    bootstrapSetupCodeTtlMs: (0, env_1.readNumber)("BOOTSTRAP_SETUP_CODE_TTL_MS", 900000),
    bootstrapSetupCodeMaxAttempts: (0, env_1.readNumber)("BOOTSTRAP_SETUP_CODE_MAX_ATTEMPTS", 10),
    passwordPolicy: (0, passwordPolicy_1.resolvePasswordPolicyConfig)(),
    backups: resolveBackupConfig(),
    s3: resolveS3Config(),
    linkShare: (0, derived_1.resolveLinkShareConfig)(),
    updateCheck: (0, derived_1.resolveUpdateCheckConfig)(),
    mail: (0, mail_1.resolveMailConfig)(),
};
if (exports.config.nodeEnv === "production") {
    (0, production_1.validateProductionConfig)(exports.config);
}
console.log("Configuration validated successfully");
