"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAdminSettingsRoutes = void 0;
const audit_1 = require("../utils/audit");
const accessPolicy_1 = require("./accessPolicy");
const schemas_1 = require("./schemas");
const registerAdminSettingsRoutes = (deps) => {
    const { router, prisma, requireAuth, ensureAuthEnabled, ensureSystemConfig, parseLoginRateLimitConfig, applyLoginRateLimitConfig, resetLoginAttemptKey, requireAdmin, config, defaultSystemConfigId, requireCsrf, } = deps;
    router.post("/registration/toggle", requireAuth, async (req, res) => {
        try {
            if (!(await ensureAuthEnabled(res)))
                return;
            if (!requireCsrf(req, res))
                return;
            if (!requireAdmin(req, res))
                return;
            if (config.authMode === "oidc_enforced") {
                return res.status(409).json({
                    error: "Conflict",
                    message: "Local self-sign-up is unavailable in OIDC enforced mode. Use invited users and the OIDC auto-provisioning setting instead.",
                });
            }
            const parsed = schemas_1.registrationToggleSchema.safeParse(req.body);
            if (!parsed.success) {
                return res
                    .status(400)
                    .json({ error: "Bad request", message: "Invalid toggle payload" });
            }
            const updated = await prisma.systemConfig.upsert({
                where: { id: defaultSystemConfigId },
                update: { registrationEnabled: parsed.data.enabled },
                create: {
                    id: defaultSystemConfigId,
                    registrationEnabled: parsed.data.enabled,
                },
            });
            res.json({ registrationEnabled: updated.registrationEnabled });
        }
        catch (error) {
            console.error("Registration toggle error:", error);
            res.status(500).json({
                error: "Internal server error",
                message: "Failed to update registration setting",
            });
        }
    });
    router.post("/oidc/jit-provisioning", requireAuth, async (req, res) => {
        try {
            if (!(await ensureAuthEnabled(res)))
                return;
            if (!requireCsrf(req, res))
                return;
            if (!requireAdmin(req, res))
                return;
            if (!config.oidc.enabled) {
                return res
                    .status(409)
                    .json({ error: "Conflict", message: "OIDC is not enabled." });
            }
            const parsed = schemas_1.oidcJitProvisioningToggleSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    error: "Bad request",
                    message: "Invalid OIDC provisioning payload",
                });
            }
            const updated = await prisma.systemConfig.upsert({
                where: { id: defaultSystemConfigId },
                update: { oidcJitProvisioningEnabled: parsed.data.enabled },
                create: {
                    id: defaultSystemConfigId,
                    oidcJitProvisioningEnabled: parsed.data.enabled,
                },
            });
            res.json({
                oidcJitProvisioningEnabled: (0, accessPolicy_1.getEffectiveOidcJitProvisioning)({
                    oidcEnabled: config.oidc.enabled,
                    defaultJitProvisioningEnabled: config.oidc.jitProvisioning,
                }, updated),
            });
        }
        catch (error) {
            console.error("OIDC JIT provisioning toggle error:", error);
            res.status(500).json({
                error: "Internal server error",
                message: "Failed to update OIDC provisioning setting",
            });
        }
    });
    router.get("/rate-limit/login", requireAuth, async (req, res) => {
        try {
            if (!(await ensureAuthEnabled(res)))
                return;
            if (!requireAdmin(req, res))
                return;
            const systemConfig = await ensureSystemConfig();
            const cfg = parseLoginRateLimitConfig(systemConfig);
            res.json({ config: cfg });
        }
        catch (error) {
            console.error("Get login rate limit config error:", error);
            res.status(500).json({
                error: "Internal server error",
                message: "Failed to fetch login rate limit config",
            });
        }
    });
    router.put("/rate-limit/login", requireAuth, async (req, res) => {
        try {
            if (!(await ensureAuthEnabled(res)))
                return;
            if (!requireCsrf(req, res))
                return;
            if (!requireAdmin(req, res))
                return;
            const parsed = schemas_1.loginRateLimitUpdateSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    error: "Validation error",
                    message: "Invalid rate limit config",
                });
            }
            const updated = await prisma.systemConfig.update({
                where: { id: defaultSystemConfigId },
                data: {
                    authLoginRateLimitEnabled: parsed.data.enabled,
                    authLoginRateLimitWindowMs: parsed.data.windowMs,
                    authLoginRateLimitMax: parsed.data.max,
                },
            });
            const nextConfig = applyLoginRateLimitConfig(updated);
            if (config.enableAuditLogging) {
                await (0, audit_1.logAuditEvent)({
                    userId: req.user.id,
                    action: "admin_login_rate_limit_updated",
                    resource: "system_config",
                    ipAddress: req.ip || req.connection.remoteAddress || undefined,
                    userAgent: req.headers["user-agent"] || undefined,
                    details: { ...nextConfig },
                });
            }
            res.json({ config: nextConfig });
        }
        catch (error) {
            console.error("Update login rate limit config error:", error);
            res.status(500).json({
                error: "Internal server error",
                message: "Failed to update login rate limit config",
            });
        }
    });
    router.post("/rate-limit/login/reset", requireAuth, async (req, res) => {
        try {
            if (!(await ensureAuthEnabled(res)))
                return;
            if (!requireCsrf(req, res))
                return;
            if (!requireAdmin(req, res))
                return;
            const parsed = schemas_1.loginRateLimitResetSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    error: "Validation error",
                    message: "Invalid reset payload",
                });
            }
            const identifier = parsed.data.identifier.trim().toLowerCase();
            await resetLoginAttemptKey(identifier);
            if (config.enableAuditLogging) {
                await (0, audit_1.logAuditEvent)({
                    userId: req.user.id,
                    action: "admin_login_rate_limit_reset",
                    resource: `rate_limit:login:${identifier}`,
                    ipAddress: req.ip || req.connection.remoteAddress || undefined,
                    userAgent: req.headers["user-agent"] || undefined,
                    details: { identifier },
                });
            }
            res.json({ ok: true });
        }
        catch (error) {
            console.error("Reset login rate limit error:", error);
            res.status(500).json({
                error: "Internal server error",
                message: "Failed to reset login rate limit",
            });
        }
    });
};
exports.registerAdminSettingsRoutes = registerAdminSettingsRoutes;
