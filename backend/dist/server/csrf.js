"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCsrfProtection = void 0;
const crypto_1 = __importDefault(require("crypto"));
const security_1 = require("../security");
const csrfClient_1 = require("../security/csrfClient");
const apiKeys_1 = require("../auth/apiKeys");
const CSRF_CLIENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const registerCsrfProtection = ({ app, isAllowedOrigin, maxRequestsPerWindow, rateLimitWindowMs, enableDebugLogging, }) => {
    const canTrustProxyHeaders = (req) => {
        const trustProxy = req.app.get("trust proxy");
        if (trustProxy === true)
            return true;
        if (typeof trustProxy === "number")
            return trustProxy > 0;
        if (typeof trustProxy === "function")
            return true;
        return false;
    };
    const requestUsesHttps = (req) => {
        if (req.secure)
            return true;
        if (!canTrustProxyHeaders(req))
            return false;
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
    const setCsrfClientCookie = (req, res, value) => {
        const secure = requestUsesHttps(req) ? "; Secure" : "";
        res.append("Set-Cookie", `${csrfClient_1.CSRF_CLIENT_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CSRF_CLIENT_COOKIE_MAX_AGE_SECONDS}${secure}`);
    };
    const getClientIdForTokenIssue = (req, res) => {
        const existingCookieValue = (0, csrfClient_1.getCsrfClientCookieValue)(req);
        if (existingCookieValue) {
            return {
                clientId: `cookie:${existingCookieValue}`,
                strategy: "cookie",
            };
        }
        const generatedCookieValue = crypto_1.default.randomUUID().replace(/-/g, "");
        setCsrfClientCookie(req, res, generatedCookieValue);
        return {
            clientId: `cookie:${generatedCookieValue}`,
            strategy: "cookie",
        };
    };
    const getClientIdForTokenIssueDebug = (req, res) => {
        const { clientId, strategy } = getClientIdForTokenIssue(req, res);
        if (enableDebugLogging) {
            const validationCandidates = (0, csrfClient_1.getCsrfValidationClientIds)(req);
            const ip = req.ip || req.connection.remoteAddress || "unknown";
            console.log("[CSRF DEBUG] getClientId", {
                method: req.method,
                path: req.path,
                ip,
                remoteAddress: req.connection.remoteAddress,
                "x-forwarded-for": req.headers["x-forwarded-for"],
                "x-real-ip": req.headers["x-real-ip"],
                hasCsrfCookie: Boolean((0, csrfClient_1.getCsrfClientCookieValue)(req)),
                clientIdPreview: clientId.slice(0, 60) + "...",
                trustProxySetting: req.app.get("trust proxy"),
                strategy,
                validationCandidatesPreview: validationCandidates.map((candidate) => `${candidate.slice(0, 60)}...`),
            });
        }
        return clientId;
    };
    const csrfRateLimit = new Map();
    let csrfCleanupCounter = 0;
    app.get("/csrf-token", (req, res) => {
        const ip = req.ip || req.connection.remoteAddress || "unknown";
        const now = Date.now();
        const clientLimit = csrfRateLimit.get(ip);
        if (clientLimit && now < clientLimit.resetTime) {
            if (clientLimit.count >= maxRequestsPerWindow) {
                return res.status(429).json({
                    error: "Rate limit exceeded",
                    message: "Too many CSRF token requests",
                });
            }
            clientLimit.count++;
        }
        else {
            csrfRateLimit.set(ip, { count: 1, resetTime: now + rateLimitWindowMs });
        }
        csrfCleanupCounter += 1;
        if (csrfCleanupCounter % 100 === 0) {
            for (const [key, data] of csrfRateLimit.entries()) {
                if (now > data.resetTime)
                    csrfRateLimit.delete(key);
            }
        }
        const clientId = getClientIdForTokenIssueDebug(req, res);
        const token = (0, security_1.createCsrfToken)(clientId);
        res.json({
            token,
            header: (0, security_1.getCsrfTokenHeader)(),
        });
    });
    const csrfProtectionMiddleware = (req, res, next) => {
        const safeMethods = ["GET", "HEAD", "OPTIONS"];
        if (safeMethods.includes(req.method)) {
            return next();
        }
        if ((0, apiKeys_1.isNonBrowserApiKeyBearerRequest)(req)) {
            return next();
        }
        const origin = req.headers["origin"];
        const referer = req.headers["referer"];
        const originValue = Array.isArray(origin) ? origin[0] : origin;
        const refererValue = Array.isArray(referer) ? referer[0] : referer;
        if (originValue) {
            if (!isAllowedOrigin(originValue)) {
                return res.status(403).json({
                    error: "CSRF origin mismatch",
                    message: "Origin not allowed",
                });
            }
        }
        else if (refererValue) {
            const refererOrigin = (0, security_1.getOriginFromReferer)(refererValue);
            if (!refererOrigin || !isAllowedOrigin(refererOrigin)) {
                return res.status(403).json({
                    error: "CSRF referer mismatch",
                    message: "Referer not allowed",
                });
            }
        }
        const clientIdCandidates = (0, csrfClient_1.getCsrfValidationClientIds)(req);
        const headerName = (0, security_1.getCsrfTokenHeader)();
        const tokenHeader = req.headers[headerName];
        const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
        if (!token) {
            return res.status(403).json({
                error: "CSRF token missing",
                message: `Missing ${headerName} header`,
            });
        }
        const isValidToken = clientIdCandidates.some((clientId) => (0, security_1.validateCsrfToken)(clientId, token));
        if (!isValidToken) {
            return res.status(403).json({
                error: "CSRF token invalid",
                message: "Invalid or expired CSRF token. Please refresh and try again.",
            });
        }
        next();
    };
    app.use((req, res, next) => {
        if (req.path.startsWith("/auth/")) {
            return next();
        }
        csrfProtectionMiddleware(req, res, next);
    });
};
exports.registerCsrfProtection = registerCsrfProtection;
