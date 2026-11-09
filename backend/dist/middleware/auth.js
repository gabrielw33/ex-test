"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = exports.requireAuth = exports.authModeService = exports.createAuthMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const prisma_1 = require("../db/prisma");
const authMode_1 = require("../auth/authMode");
const cookies_1 = require("../auth/cookies");
const apiKeys_1 = require("../auth/apiKeys");
const isStringArray = (value) => Array.isArray(value) && value.every((entry) => typeof entry === "string");
const isJwtPayload = (decoded) => {
    if (typeof decoded !== "object" || decoded === null) {
        return false;
    }
    const payload = decoded;
    const impersonatorOk = typeof payload.impersonatorId === "undefined" ||
        typeof payload.impersonatorId === "string";
    const authProviderOk = typeof payload.authProvider === "undefined" ||
        payload.authProvider === "local" ||
        payload.authProvider === "oidc";
    const oidcGroupsOk = typeof payload.oidcGroups === "undefined" ||
        isStringArray(payload.oidcGroups);
    return (typeof payload.userId === "string" &&
        typeof payload.email === "string" &&
        (payload.type === "access" || payload.type === "refresh") &&
        impersonatorOk &&
        authProviderOk &&
        oidcGroupsOk);
};
const extractToken = (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader && typeof authHeader === "string") {
        const parts = authHeader.split(" ");
        if (parts.length === 2 && parts[0] === "Bearer") {
            return parts[1] ? { token: parts[1], source: "bearer" } : null;
        }
    }
    const cookieToken = (0, cookies_1.readCookie)(req, cookies_1.ACCESS_TOKEN_COOKIE_NAME);
    return cookieToken ? { token: cookieToken, source: "cookie" } : null;
};
const hasRefreshTokenCookie = (req) => (0, cookies_1.readCookie)(req, cookies_1.REFRESH_TOKEN_COOKIE_NAME) !== null;
const verifyToken = (token) => {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret);
        if (!isJwtPayload(decoded)) {
            return null;
        }
        if (decoded.type !== "access") {
            return null;
        }
        return decoded;
    }
    catch {
        return null;
    }
};
const normalizeRequestPath = (req) => {
    const raw = (req.originalUrl || req.url || "").split("?")[0] || "";
    return raw.replace(/^\/api(?=\/)/, "");
};
const isAllowedWhileMustResetPassword = (req) => {
    const path = normalizeRequestPath(req);
    if (req.method === "GET" && path === "/auth/me")
        return true;
    if (req.method === "POST" && path === "/auth/change-password")
        return true;
    if (req.method === "POST" && path === "/auth/must-reset-password")
        return true;
    return false;
};
const getApiKeyRouteResource = (req) => {
    const path = normalizeRequestPath(req);
    const segments = path.split("/").filter(Boolean);
    const method = req.method;
    if (segments[0] === "drawings") {
        if (segments.length === 1 && ["GET", "HEAD", "POST"].includes(method)) {
            return "drawings";
        }
        if (segments.length === 2 &&
            segments[1] !== "shared" &&
            ["GET", "HEAD", "PUT", "DELETE"].includes(method)) {
            return "drawings";
        }
        return null;
    }
    if (segments[0] === "collections") {
        if (segments.length === 1 && ["GET", "HEAD", "POST"].includes(method)) {
            return "collections";
        }
        if (segments.length === 2 && ["PUT", "DELETE"].includes(method)) {
            return "collections";
        }
        return null;
    }
    return null;
};
const getRequiredApiKeyScope = (req) => {
    const resource = getApiKeyRouteResource(req);
    if (!resource)
        return null;
    const access = req.method === "GET" || req.method === "HEAD" ? "read" : "write";
    return `${resource}:${access}`;
};
const authorizeApiKeyRequest = (req, res, scopes, apiKeyDrawingId) => {
    // Legacy drawing-scoped keys must never gain account-wide access.
    if (apiKeyDrawingId) {
        res.status(403).json({
            error: "Forbidden",
            message: "Drawing-scoped tokens are not supported in this release",
        });
        return false;
    }
    const requiredScope = getRequiredApiKeyScope(req);
    if (requiredScope && scopes.includes(requiredScope)) {
        return true;
    }
    res.status(403).json({
        error: "Forbidden",
        message: "API key is not authorized for this route",
    });
    return false;
};
const createAuthMiddleware = ({ prisma, authModeService, }) => {
    const configuredOidcAdminGroups = new Set(config_1.config.oidc.adminGroups);
    const normalizeGroups = (groups) => Array.from(new Set((groups ?? [])
        .map((group) => group.trim())
        .filter((group) => group.length > 0)));
    const findActiveUser = (userId) => prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            username: true,
            email: true,
            name: true,
            role: true,
            mustResetPassword: true,
            isActive: true,
        },
    });
    const authenticateApiKey = async (token) => {
        const keyId = (0, apiKeys_1.extractApiKeyId)(token);
        if (!keyId)
            return null;
        const apiKey = await prisma.apiKey.findUnique({
            where: { keyId },
            include: { user: true },
        });
        if (!apiKey || apiKey.revokedAt)
            return null;
        if (!(0, apiKeys_1.apiKeyHashMatches)(token, apiKey.tokenHash))
            return null;
        if (!apiKey.user.isActive)
            return null;
        try {
            await prisma.apiKey.update({
                where: { id: apiKey.id },
                data: { lastUsedAt: new Date() },
            });
        }
        catch (error) {
            console.warn("Failed to update API key lastUsedAt:", error);
        }
        return {
            user: apiKey.user,
            scopes: (0, apiKeys_1.parseApiKeyScopes)(apiKey.scopes),
            drawingId: apiKey.drawingId ?? null,
        };
    };
    const shouldReconcileOidcRole = async (payload, userId) => {
        if (configuredOidcAdminGroups.size === 0)
            return false;
        if (payload.impersonatorId)
            return false;
        if (payload.authProvider === "oidc")
            return true;
        if (payload.authProvider === "local")
            return false;
        const linkedOidcIdentity = await prisma.authIdentity.findUnique({
            where: { provider_userId: { provider: "oidc", userId } },
            select: { id: true },
        });
        return Boolean(linkedOidcIdentity);
    };
    const reconcileRoleFromOidcGroups = async (payload, user) => {
        if (!(await shouldReconcileOidcRole(payload, user.id))) {
            return user;
        }
        const oidcGroups = normalizeGroups(payload.oidcGroups);
        const shouldBeAdmin = oidcGroups.some((group) => configuredOidcAdminGroups.has(group));
        const expectedRole = shouldBeAdmin ? "ADMIN" : "USER";
        if (user.role === expectedRole) {
            return user;
        }
        return prisma.user.update({
            where: { id: user.id },
            data: { role: expectedRole },
            select: {
                id: true,
                username: true,
                email: true,
                name: true,
                role: true,
                mustResetPassword: true,
                isActive: true,
            },
        });
    };
    const requireAuth = async (req, res, next) => {
        try {
            const authEnabled = await authModeService.getAuthEnabled();
            if (!authEnabled) {
                const user = await authModeService.getBootstrapActingUser();
                req.user = {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    mustResetPassword: user.mustResetPassword,
                    authCredentialType: "bootstrap",
                };
                req.principal = { kind: "user", userId: user.id };
                return next();
            }
        }
        catch (error) {
            console.error("Error reading auth mode:", error);
            res.status(500).json({
                error: "Internal server error",
                message: "Failed to read authentication mode",
            });
            return;
        }
        const extracted = extractToken(req);
        if (!extracted) {
            res.status(401).json({
                error: "Unauthorized",
                message: "Authentication token required",
            });
            return;
        }
        if (extracted.source === "bearer" && (0, apiKeys_1.isApiKeyToken)(extracted.token)) {
            try {
                const result = await authenticateApiKey(extracted.token);
                if (!result) {
                    res.status(401).json({
                        error: "Unauthorized",
                        message: "Invalid or revoked API key",
                    });
                    return;
                }
                const { user, scopes, drawingId: apiKeyDrawingId } = result;
                if (!authorizeApiKeyRequest(req, res, scopes, apiKeyDrawingId)) {
                    return;
                }
                req.apiKeyDrawingId = apiKeyDrawingId;
                if (user.mustResetPassword && !isAllowedWhileMustResetPassword(req)) {
                    res.status(403).json({
                        error: "Forbidden",
                        code: "MUST_RESET_PASSWORD",
                        message: "You must reset your password before using the app",
                    });
                    return;
                }
                req.user = {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    mustResetPassword: user.mustResetPassword,
                    authCredentialType: "apiKey",
                };
                req.principal = { kind: "user", userId: user.id };
                next();
            }
            catch (error) {
                console.error("Error verifying API key:", error);
                res.status(500).json({
                    error: "Internal server error",
                    message: "Failed to verify API key",
                });
            }
            return;
        }
        const payload = verifyToken(extracted.token);
        if (!payload) {
            res
                .status(401)
                .json({ error: "Unauthorized", message: "Invalid or expired token" });
            return;
        }
        try {
            const user = await findActiveUser(payload.userId);
            if (!user || !user.isActive) {
                res.status(401).json({
                    error: "Unauthorized",
                    message: "User account not found or inactive",
                });
                return;
            }
            const resolvedUser = await reconcileRoleFromOidcGroups(payload, user);
            if (resolvedUser.mustResetPassword &&
                !isAllowedWhileMustResetPassword(req)) {
                res.status(403).json({
                    error: "Forbidden",
                    code: "MUST_RESET_PASSWORD",
                    message: "You must reset your password before using the app",
                });
                return;
            }
            req.user = {
                id: resolvedUser.id,
                username: resolvedUser.username,
                email: resolvedUser.email,
                name: resolvedUser.name,
                role: resolvedUser.role,
                mustResetPassword: resolvedUser.mustResetPassword,
                impersonatorId: payload.impersonatorId,
                authCredentialType: "jwt",
            };
            req.principal = { kind: "user", userId: resolvedUser.id };
            next();
        }
        catch (error) {
            console.error("Error verifying user:", error);
            res.status(500).json({
                error: "Internal server error",
                message: "Failed to verify user",
            });
        }
    };
    const optionalAuth = async (req, res, next) => {
        try {
            const authEnabled = await authModeService.getAuthEnabled();
            if (!authEnabled) {
                const user = await authModeService.getBootstrapActingUser();
                req.user = {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    mustResetPassword: user.mustResetPassword,
                    authCredentialType: "bootstrap",
                };
                req.principal = { kind: "user", userId: user.id };
                return next();
            }
        }
        catch (error) {
            console.error("Error reading auth mode:", error);
            return next();
        }
        const extracted = extractToken(req);
        if (!extracted) {
            if (hasRefreshTokenCookie(req)) {
                req.authError = { code: "ACCESS_TOKEN_MISSING" };
                return next();
            }
            return next();
        }
        if (extracted.source === "bearer" && (0, apiKeys_1.isApiKeyToken)(extracted.token)) {
            try {
                const result = await authenticateApiKey(extracted.token);
                if (result) {
                    // Reject legacy drawing-scoped tokens rather than attach them.
                    if (result.drawingId) {
                        req.authError = { code: "INVALID_ACCESS_TOKEN" };
                        return next();
                    }
                    const requiredScope = getRequiredApiKeyScope(req);
                    if (!requiredScope || !result.scopes.includes(requiredScope)) {
                        req.authError = { code: "INVALID_ACCESS_TOKEN" };
                        return next();
                    }
                    const { user } = result;
                    req.user = {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        name: user.name,
                        role: user.role,
                        mustResetPassword: user.mustResetPassword,
                        authCredentialType: "apiKey",
                    };
                    req.principal = { kind: "user", userId: user.id };
                }
                else {
                    req.authError = { code: "INVALID_ACCESS_TOKEN" };
                }
            }
            catch (error) {
                console.error("Error in optional API key auth:", error);
                req.authError = { code: "INVALID_ACCESS_TOKEN" };
            }
            return next();
        }
        const payload = verifyToken(extracted.token);
        if (!payload) {
            req.authError = { code: "INVALID_ACCESS_TOKEN" };
            return next();
        }
        try {
            const user = await findActiveUser(payload.userId);
            if (user && user.isActive) {
                req.user = {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    mustResetPassword: user.mustResetPassword,
                    impersonatorId: payload.impersonatorId,
                    authCredentialType: "jwt",
                };
                req.principal = { kind: "user", userId: user.id };
            }
        }
        catch (error) {
            console.error("Error in optional auth:", error);
        }
        next();
    };
    return { requireAuth, optionalAuth };
};
exports.createAuthMiddleware = createAuthMiddleware;
const defaultAuthModeService = (0, authMode_1.createAuthModeService)(prisma_1.prisma);
const defaultAuthMiddleware = (0, exports.createAuthMiddleware)({
    prisma: prisma_1.prisma,
    authModeService: defaultAuthModeService,
});
exports.authModeService = defaultAuthModeService;
exports.requireAuth = defaultAuthMiddleware.requireAuth;
exports.optionalAuth = defaultAuthMiddleware.optionalAuth;
