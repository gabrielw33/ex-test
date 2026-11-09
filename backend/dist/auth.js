"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ms_1 = __importDefault(require("ms"));
const client_1 = require("./generated/client");
const config_1 = require("./config");
const auth_1 = require("./middleware/auth");
const security_1 = require("./security");
const express_rate_limit_1 = __importStar(require("express-rate-limit"));
const accountRoutes_1 = require("./auth/accountRoutes");
const resendMailer_1 = require("./mail/resendMailer");
const adminRoutes_1 = require("./auth/adminRoutes");
const coreRoutes_1 = require("./auth/coreRoutes");
const oidcRoutes_1 = require("./auth/oidcRoutes");
const prisma_1 = require("./db/prisma");
const authMode_1 = require("./auth/authMode");
const csrfClient_1 = require("./security/csrfClient");
const cookies_1 = require("./auth/cookies");
const apiKeys_1 = require("./auth/apiKeys");
const isStringArray = (value) => Array.isArray(value) && value.every((entry) => typeof entry === "string");
const isJwtPayload = (decoded) => {
    if (typeof decoded !== "object" || decoded === null) {
        return false;
    }
    const payload = decoded;
    const authProviderOk = typeof payload.authProvider === "undefined" ||
        payload.authProvider === "local" ||
        payload.authProvider === "oidc";
    const oidcGroupsOk = typeof payload.oidcGroups === "undefined" ||
        isStringArray(payload.oidcGroups);
    return (typeof payload.userId === "string" &&
        typeof payload.email === "string" &&
        (payload.type === "access" || payload.type === "refresh") &&
        authProviderOk &&
        oidcGroupsOk);
};
const normalizeOrigins = (rawOrigins) => {
    const fallback = "http://localhost:6767";
    if (!rawOrigins || rawOrigins.trim().length === 0) {
        return [fallback];
    }
    const ensureProtocol = (origin) => /^https?:\/\//i.test(origin) ? origin : `http://${origin}`;
    const removeTrailingSlash = (origin) => origin.endsWith("/") ? origin.slice(0, -1) : origin;
    const parsed = rawOrigins
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
        .map(ensureProtocol)
        .map(removeTrailingSlash);
    return parsed.length > 0 ? parsed : [fallback];
};
const allowedOrigins = normalizeOrigins(config_1.config.frontendUrl);
const isDev = config_1.config.nodeEnv !== "production";
const isLocalDevOrigin = (origin) => {
    return (/^http:\/\/localhost:\d+$/i.test(origin) ||
        /^http:\/\/127\.0\.0\.1:\d+$/i.test(origin));
};
const isAllowedAuthOrigin = (origin) => {
    if (!origin)
        return true;
    if (allowedOrigins.includes(origin))
        return true;
    if (isDev && isLocalDevOrigin(origin))
        return true;
    return false;
};
const createAuthRouter = (deps) => {
    const { prisma, requireAuth, optionalAuth, authModeService } = deps;
    const router = express_1.default.Router();
    const ensureSystemConfig = authModeService.ensureSystemConfig;
    const ensureAuthEnabled = async (res) => {
        const systemConfig = await ensureSystemConfig();
        const authEnabled = config_1.config.authMode !== "local"
            ? (0, config_1.authModeEnablesAuth)(config_1.config.authMode)
            : systemConfig.authEnabled;
        if (!authEnabled) {
            res
                .status(404)
                .json({ error: "Not found", message: "Authentication is disabled" });
            return false;
        }
        return true;
    };
    const DEFAULT_LOGIN_RATE_LIMIT = {
        enabled: true,
        windowMs: 15 * 60 * 1000,
        max: 20,
    };
    let loginRateLimitConfig = {
        ...DEFAULT_LOGIN_RATE_LIMIT,
    };
    let loginAttemptLimiter = null;
    let loginLimiterInitPromise = null;
    let loginIdentifierKeyIndex = new Map();
    const parseLoginRateLimitConfig = (systemConfig) => {
        const enabled = typeof systemConfig.authLoginRateLimitEnabled === "boolean"
            ? systemConfig.authLoginRateLimitEnabled
            : DEFAULT_LOGIN_RATE_LIMIT.enabled;
        const windowMs = Number.isFinite(Number(systemConfig.authLoginRateLimitWindowMs)) &&
            Number(systemConfig.authLoginRateLimitWindowMs) > 0
            ? Number(systemConfig.authLoginRateLimitWindowMs)
            : DEFAULT_LOGIN_RATE_LIMIT.windowMs;
        const max = Number.isFinite(Number(systemConfig.authLoginRateLimitMax)) &&
            Number(systemConfig.authLoginRateLimitMax) > 0
            ? Number(systemConfig.authLoginRateLimitMax)
            : DEFAULT_LOGIN_RATE_LIMIT.max;
        return { enabled, windowMs, max };
    };
    const resolveAuthIdentifier = (req) => {
        const body = (req.body || {});
        const raw = (typeof body.email === "string" && body.email) ||
            (typeof body.username === "string" && body.username) ||
            (typeof body.identifier === "string" && body.identifier) ||
            null;
        if (!raw)
            return null;
        const trimmed = raw.trim().toLowerCase();
        return trimmed.length > 0 ? trimmed.slice(0, 255) : null;
    };
    const resolveRateLimitIp = (req) => (req.ip || req.connection.remoteAddress || "unknown").slice(0, 255);
    const trackIdentifierRateLimitKey = (identifier, key) => {
        if (!loginIdentifierKeyIndex.has(identifier) &&
            loginIdentifierKeyIndex.size >= 5000) {
            const oldestIdentifier = loginIdentifierKeyIndex.keys().next().value;
            if (typeof oldestIdentifier === "string") {
                loginIdentifierKeyIndex.delete(oldestIdentifier);
            }
        }
        const existing = loginIdentifierKeyIndex.get(identifier) ?? new Set();
        if (existing.size >= 50) {
            const oldestKey = existing.values().next().value;
            if (typeof oldestKey === "string") {
                existing.delete(oldestKey);
            }
        }
        existing.add(key);
        loginIdentifierKeyIndex.set(identifier, existing);
    };
    const buildLoginAttemptLimiter = (cfg) => {
        const store = new express_rate_limit_1.MemoryStore();
        loginIdentifierKeyIndex = new Map();
        const limiter = (0, express_rate_limit_1.default)({
            windowMs: cfg.windowMs,
            max: cfg.max,
            message: {
                error: "Too many requests",
                message: "Too many login attempts, please try again later",
            },
            standardHeaders: true,
            legacyHeaders: false,
            validate: { trustProxy: false, xForwardedForHeader: false },
            store,
            keyGenerator: (req) => {
                const identifier = resolveAuthIdentifier(req);
                const ip = resolveRateLimitIp(req);
                if (identifier) {
                    const key = `login:${identifier}:ip:${ip}`;
                    trackIdentifierRateLimitKey(identifier, key);
                    return key;
                }
                return `login-ip:${ip}`;
            },
        });
        loginAttemptLimiter = limiter;
    };
    const initLoginAttemptLimiter = async () => {
        const systemConfig = await ensureSystemConfig();
        loginRateLimitConfig = parseLoginRateLimitConfig(systemConfig);
        buildLoginAttemptLimiter(loginRateLimitConfig);
    };
    const ensureLoginAttemptLimiter = async () => {
        if (loginAttemptLimiter)
            return;
        if (!loginLimiterInitPromise) {
            loginLimiterInitPromise = initLoginAttemptLimiter().finally(() => {
                loginLimiterInitPromise = null;
            });
        }
        await loginLimiterInitPromise;
    };
    const applyLoginRateLimitConfig = (systemConfig) => {
        loginRateLimitConfig = parseLoginRateLimitConfig(systemConfig);
        buildLoginAttemptLimiter(loginRateLimitConfig);
        return loginRateLimitConfig;
    };
    const resetLoginAttemptKey = async (identifier) => {
        await ensureLoginAttemptLimiter();
        const normalizedIdentifier = identifier.trim().toLowerCase();
        const keys = loginIdentifierKeyIndex.get(normalizedIdentifier);
        try {
            if (!keys || keys.size === 0) {
                await loginAttemptLimiter?.resetKey(`login:${normalizedIdentifier}`);
                return;
            }
            for (const key of keys) {
                await loginAttemptLimiter?.resetKey(key);
            }
            loginIdentifierKeyIndex.delete(normalizedIdentifier);
        }
        catch (error) {
            if (config_1.config.isDev) {
                console.debug("Rate limit reset skipped:", error);
            }
        }
    };
    const loginAttemptRateLimiter = async (req, res, next) => {
        await ensureLoginAttemptLimiter();
        if (!loginRateLimitConfig.enabled)
            return next();
        return loginAttemptLimiter(req, res, next);
    };
    const accountActionRateLimiter = (0, express_rate_limit_1.default)({
        windowMs: 5 * 60 * 1000,
        max: 60,
        message: {
            error: "Too many requests",
            message: "Too many requests, please try again later",
        },
        standardHeaders: true,
        legacyHeaders: false,
        validate: { trustProxy: false, xForwardedForHeader: false },
    });
    const generateTempPassword = () => {
        const buf = crypto_1.default.randomBytes(18);
        return buf.toString("base64").replace(/[+/=]/g, "").slice(0, 24);
    };
    const findUserByIdentifier = async (identifier) => {
        const trimmed = identifier.trim();
        if (trimmed.length === 0)
            return null;
        const looksLikeEmail = trimmed.includes("@");
        if (looksLikeEmail) {
            return prisma.user.findUnique({
                where: { email: trimmed.toLowerCase() },
            });
        }
        return prisma.user.findFirst({
            where: { OR: [{ username: trimmed }, { email: trimmed.toLowerCase() }] },
        });
    };
    const requireAdmin = (req, res) => {
        if (!req.user) {
            res
                .status(401)
                .json({ error: "Unauthorized", message: "User not authenticated" });
            return false;
        }
        if (req.user.role !== "ADMIN") {
            res
                .status(403)
                .json({ error: "Forbidden", message: "Admin access required" });
            return false;
        }
        return true;
    };
    const requireCsrf = (req, res) => {
        if ((0, apiKeys_1.isNonBrowserApiKeyBearerRequest)(req)) {
            return true;
        }
        const origin = req.headers["origin"];
        const referer = req.headers["referer"];
        const originValue = Array.isArray(origin) ? origin[0] : origin;
        const refererValue = Array.isArray(referer) ? referer[0] : referer;
        if (originValue) {
            if (!isAllowedAuthOrigin(originValue)) {
                res.status(403).json({
                    error: "CSRF origin mismatch",
                    message: "Origin not allowed",
                });
                return false;
            }
        }
        else if (refererValue) {
            const refererOrigin = (0, security_1.getOriginFromReferer)(refererValue);
            if (!refererOrigin || !isAllowedAuthOrigin(refererOrigin)) {
                res.status(403).json({
                    error: "CSRF referer mismatch",
                    message: "Referer not allowed",
                });
                return false;
            }
        }
        const headerName = (0, security_1.getCsrfTokenHeader)();
        const tokenHeader = req.headers[headerName];
        const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
        if (!token) {
            res.status(403).json({
                error: "CSRF token missing",
                message: `Missing ${headerName} header`,
            });
            return false;
        }
        const clientIds = (0, csrfClient_1.getCsrfValidationClientIds)(req);
        const isValidToken = clientIds.some((clientId) => (0, security_1.validateCsrfToken)(clientId, token));
        if (!isValidToken) {
            res.status(403).json({
                error: "CSRF token invalid",
                message: "Invalid or expired CSRF token. Please refresh and try again.",
            });
            return false;
        }
        return true;
    };
    const countActiveAdmins = async () => {
        return prisma.user.count({ where: { role: "ADMIN", isActive: true } });
    };
    const generateTokens = (userId, email, options) => {
        const authProvider = options?.authProvider ?? "local";
        const sanitizedOidcGroups = authProvider === "oidc"
            ? Array.from(new Set((options?.oidcGroups ?? [])
                .map((group) => group.trim())
                .filter((group) => group.length > 0))).slice(0, 100)
            : undefined;
        const tokenPayload = {
            userId,
            email,
            impersonatorId: options?.impersonatorId,
            authProvider,
            oidcGroups: sanitizedOidcGroups,
        };
        const signOptions = {
            expiresIn: config_1.config.jwtAccessExpiresIn,
            jwtid: crypto_1.default.randomUUID(),
        };
        const accessToken = jsonwebtoken_1.default.sign({ ...tokenPayload, type: "access" }, config_1.config.jwtSecret, signOptions);
        const refreshSignOptions = {
            expiresIn: config_1.config.jwtRefreshExpiresIn,
            jwtid: crypto_1.default.randomUUID(),
        };
        const refreshToken = jsonwebtoken_1.default.sign({ ...tokenPayload, type: "refresh" }, config_1.config.jwtSecret, refreshSignOptions);
        return { accessToken, refreshToken };
    };
    const resolveExpiresAt = (expiresIn, fallbackMs) => {
        const parsed = (0, ms_1.default)(expiresIn);
        const ttlMs = typeof parsed === "number" && parsed > 0 ? parsed : fallbackMs;
        return new Date(Date.now() + ttlMs);
    };
    const isMissingRefreshTokenTableError = (error) => {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
            if (error.code === "P2021") {
                return true;
            }
        }
        const message = typeof error === "object" && error && "message" in error
            ? String(error.message)
            : "";
        return /no such table:\s*RefreshToken/i.test(message);
    };
    const getRefreshTokenExpiresAt = () => resolveExpiresAt(config_1.config.jwtRefreshExpiresIn, 7 * 24 * 60 * 60 * 1000);
    (0, oidcRoutes_1.registerOidcRoutes)({
        router,
        prisma,
        ensureAuthEnabled,
        ensureSystemConfig,
        sanitizeText: security_1.sanitizeText,
        generateTokens,
        setAuthCookies: cookies_1.setAuthCookies,
        getRefreshTokenExpiresAt,
        isMissingRefreshTokenTableError,
        config: config_1.config,
    });
    const mailer = (0, resendMailer_1.createMailerFromConfig)(config_1.config.mail);
    (0, coreRoutes_1.registerCoreRoutes)({
        router,
        prisma,
        requireAuth,
        optionalAuth,
        loginAttemptRateLimiter,
        ensureAuthEnabled,
        ensureSystemConfig,
        findUserByIdentifier,
        sanitizeText: security_1.sanitizeText,
        requireCsrf,
        isJwtPayload,
        config: config_1.config,
        generateTokens,
        getRefreshTokenExpiresAt,
        isMissingRefreshTokenTableError,
        bootstrapUserId: authMode_1.BOOTSTRAP_USER_ID,
        defaultSystemConfigId: authMode_1.DEFAULT_SYSTEM_CONFIG_ID,
        clearAuthEnabledCache: authModeService.clearAuthEnabledCache,
        setAuthCookies: cookies_1.setAuthCookies,
        setAccessTokenCookie: cookies_1.setAccessTokenCookie,
        clearAuthCookies: cookies_1.clearAuthCookies,
        readRefreshTokenFromRequest: (req) => (0, cookies_1.readCookie)(req, cookies_1.REFRESH_TOKEN_COOKIE_NAME),
    });
    (0, adminRoutes_1.registerAdminRoutes)({
        router,
        prisma,
        requireAuth,
        accountActionRateLimiter,
        ensureAuthEnabled,
        ensureSystemConfig,
        parseLoginRateLimitConfig,
        applyLoginRateLimitConfig,
        resetLoginAttemptKey,
        requireAdmin,
        findUserByIdentifier,
        countActiveAdmins,
        sanitizeText: security_1.sanitizeText,
        generateTempPassword,
        generateTokens,
        getRefreshTokenExpiresAt,
        config: config_1.config,
        defaultSystemConfigId: authMode_1.DEFAULT_SYSTEM_CONFIG_ID,
        setAuthCookies: cookies_1.setAuthCookies,
        requireCsrf,
    });
    (0, accountRoutes_1.registerAccountRoutes)({
        mailer,
        router,
        prisma,
        requireAuth,
        loginAttemptRateLimiter,
        accountActionRateLimiter,
        ensureAuthEnabled,
        sanitizeText: security_1.sanitizeText,
        config: config_1.config,
        generateTokens,
        getRefreshTokenExpiresAt,
        setAuthCookies: cookies_1.setAuthCookies,
        requireCsrf,
    });
    return router;
};
const authRouter = createAuthRouter({
    prisma: prisma_1.prisma,
    requireAuth: auth_1.requireAuth,
    optionalAuth: auth_1.optionalAuth,
    authModeService: auth_1.authModeService,
});
exports.default = authRouter;
