"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthModeService = exports.DEFAULT_SYSTEM_CONFIG_ID = exports.BOOTSTRAP_USER_ID = void 0;
const config_1 = require("../config");
exports.BOOTSTRAP_USER_ID = "bootstrap-admin";
exports.DEFAULT_SYSTEM_CONFIG_ID = "default";
const createAuthModeService = (prisma, options) => {
    const authEnabledTtlMs = options?.authEnabledTtlMs ?? 5000;
    let authEnabledCache = null;
    const getSystemConfigAuthEnabled = async () => {
        return prisma.systemConfig.findUnique({
            where: { id: exports.DEFAULT_SYSTEM_CONFIG_ID },
            select: { authEnabled: true },
        });
    };
    const ensureSystemConfig = async () => {
        // Read first. The default row is created once (at startup, or on the
        // first request that hits this path) and then never needs writing on a
        // read path like /auth/status. Doing an upsert on every call took a
        // write lock per request, which under SQLite serialises readers behind
        // the writer and surfaces as `database is locked` timeouts (issue #182).
        // Fall back to upsert only when the row is genuinely missing — upsert
        // (not create) keeps the concurrent first-write race safe.
        const existing = await prisma.systemConfig.findUnique({
            where: { id: exports.DEFAULT_SYSTEM_CONFIG_ID },
        });
        if (existing)
            return existing;
        return prisma.systemConfig.upsert({
            where: { id: exports.DEFAULT_SYSTEM_CONFIG_ID },
            update: {},
            create: {
                id: exports.DEFAULT_SYSTEM_CONFIG_ID,
                authEnabled: (0, config_1.authModeEnablesAuth)(config_1.config.authMode),
                authOnboardingCompleted: false,
                registrationEnabled: false,
                oidcJitProvisioningEnabled: null,
                authLoginRateLimitEnabled: true,
                authLoginRateLimitWindowMs: 15 * 60 * 1000,
                authLoginRateLimitMax: 20,
            },
        });
    };
    const getAuthEnabled = async () => {
        // Non-local modes are resolved purely from AUTH_MODE and never consult the
        // runtime toggle: hybrid/oidc_enforced force auth on, `disabled` forces it
        // off (every request runs as the shared bootstrap acting user).
        if (config_1.config.authMode !== "local") {
            const now = Date.now();
            const value = (0, config_1.authModeEnablesAuth)(config_1.config.authMode);
            authEnabledCache = { value, fetchedAt: now };
            return value;
        }
        const now = Date.now();
        if (authEnabledCache &&
            now - authEnabledCache.fetchedAt < authEnabledTtlMs) {
            return authEnabledCache.value;
        }
        const existingSystemConfig = await getSystemConfigAuthEnabled();
        if (existingSystemConfig) {
            authEnabledCache = {
                value: existingSystemConfig.authEnabled,
                fetchedAt: now,
            };
            return existingSystemConfig.authEnabled;
        }
        const systemConfig = await ensureSystemConfig();
        authEnabledCache = { value: systemConfig.authEnabled, fetchedAt: now };
        return systemConfig.authEnabled;
    };
    const clearAuthEnabledCache = () => {
        authEnabledCache = null;
    };
    const getBootstrapActingUser = async () => {
        return prisma.user.upsert({
            where: { id: exports.BOOTSTRAP_USER_ID },
            update: {},
            create: {
                id: exports.BOOTSTRAP_USER_ID,
                email: "bootstrap@excalidash.local",
                username: null,
                passwordHash: "",
                name: "Bootstrap Admin",
                role: "ADMIN",
                mustResetPassword: true,
                isActive: false,
            },
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
    return {
        ensureSystemConfig,
        getAuthEnabled,
        clearAuthEnabledCache,
        getBootstrapActingUser,
    };
};
exports.createAuthModeService = createAuthModeService;
