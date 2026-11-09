"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAccountPasswordResetRoutes = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
const audit_1 = require("../utils/audit");
const config_1 = require("../config");
const schemas_1 = require("./schemas");
const localPassword_1 = require("./localPassword");
const tokenSecurity_1 = require("./tokenSecurity");
const passwordReset_1 = require("../mail/templates/passwordReset");
const registerAccountPasswordResetRoutes = (deps) => {
    const { router, prisma, loginAttemptRateLimiter, ensureAuthEnabled, config, mailer, } = deps;
    const buildResetUrl = (token) => {
        const configuredOrigin = config.frontendUrl?.split(",")[0]?.trim();
        const origin = configuredOrigin
            ? /^https?:\/\//i.test(configuredOrigin)
                ? configuredOrigin
                : `http://${configuredOrigin}`
            : "http://localhost:6767";
        return `${origin.replace(/\/$/, "")}/reset-password-confirm#token=${encodeURIComponent(token)}`;
    };
    router.get("/password-reset-capability", (_req, res) => {
        const deliveryAvailable = config.nodeEnv !== "production" || Boolean(mailer?.enabled);
        return res.json({
            enabled: config.enablePasswordReset && deliveryAvailable,
        });
    });
    router.post("/password-reset-request", loginAttemptRateLimiter, async (req, res) => {
        if (!(await ensureAuthEnabled(res)))
            return;
        if (!config.enablePasswordReset) {
            return res.status(404).json({
                error: "Not found",
                message: "Password reset feature is not enabled",
            });
        }
        if (config.nodeEnv === "production" && !mailer?.enabled) {
            console.error("[mail] Password reset is enabled, but mail delivery is not configured");
            return res.status(503).json({
                error: "Service unavailable",
                message: "Password reset is temporarily unavailable",
            });
        }
        try {
            const parsed = schemas_1.passwordResetRequestSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    error: "Validation error",
                    message: "Invalid email address",
                });
            }
            const { email } = parsed.data;
            const ipAddress = req.ip || req.connection.remoteAddress || undefined;
            const userAgent = req.headers["user-agent"] || undefined;
            const response = res.json({
                message: "If an account with that email exists, a password reset link has been sent.",
            });
            // Perform lookup, token creation, and delivery only after the neutral
            // response has been sent. Otherwise database and mail latency reveal
            // whether the address belongs to an active local account.
            void (async () => {
                const user = await prisma.user.findUnique({ where: { email } });
                if (!user || !user.isActive || !(0, localPassword_1.canUseLocalPasswordFlows)(user))
                    return;
                const resetToken = crypto_1.default.randomBytes(32).toString("hex");
                const expiresAt = new Date();
                expiresAt.setHours(expiresAt.getHours() + 1);
                await prisma.passwordResetToken.updateMany({
                    where: { userId: user.id, used: false },
                    data: { used: true },
                });
                await prisma.passwordResetToken.create({
                    data: {
                        userId: user.id,
                        token: (0, tokenSecurity_1.hashTokenForStorage)(resetToken),
                        expiresAt,
                    },
                });
                if (config.enableAuditLogging) {
                    await (0, audit_1.logAuditEvent)({
                        userId: user.id,
                        action: "password_reset_requested",
                        ipAddress,
                        userAgent,
                    });
                }
                const resetUrl = buildResetUrl(resetToken);
                if (config.nodeEnv === "development") {
                    console.log(`[DEV] Password reset token for ${email}: ${resetToken}`);
                    console.log(`[DEV] Reset URL: ${resetUrl}`);
                }
                if (!mailer?.enabled)
                    return;
                const message = (0, passwordReset_1.buildPasswordResetEmail)({
                    resetUrl,
                    expiresInMinutes: 60,
                });
                const result = await mailer.send({
                    to: email,
                    ...message,
                    idempotencyKey: `password-reset/${crypto_1.default.randomUUID()}`,
                });
                if (result.delivered === false) {
                    console.error(`[mail] Password reset email was not delivered: ${result.reason}`);
                }
            })().catch((error) => {
                const reason = error instanceof Error ? error.message : String(error);
                console.error(`[mail] Password reset processing failed: ${reason}`);
            });
            return response;
        }
        catch (error) {
            console.error("Password reset request error:", error);
            return res.status(500).json({
                error: "Internal server error",
                message: "Failed to process password reset request",
            });
        }
    });
    router.post("/password-reset-confirm", loginAttemptRateLimiter, async (req, res) => {
        if (!(await ensureAuthEnabled(res)))
            return;
        if (!config.enablePasswordReset) {
            return res.status(404).json({
                error: "Not found",
                message: "Password reset feature is not enabled",
            });
        }
        try {
            const parsed = schemas_1.passwordResetConfirmSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    error: "Validation error",
                    message: "Invalid reset data",
                });
            }
            const { token, password } = parsed.data;
            const resetToken = await prisma.passwordResetToken.findFirst({
                where: {
                    token: (0, tokenSecurity_1.hashTokenForStorage)(token),
                },
                include: { user: true },
            });
            if (!resetToken || resetToken.used) {
                return res.status(400).json({
                    error: "Invalid token",
                    message: "Password reset token is invalid or has already been used",
                });
            }
            if (new Date() > resetToken.expiresAt) {
                return res.status(400).json({
                    error: "Expired token",
                    message: "Password reset token has expired",
                });
            }
            if (!resetToken.user.isActive) {
                return res.status(403).json({
                    error: "Forbidden",
                    message: "Account is inactive",
                });
            }
            if (!(0, localPassword_1.canUseLocalPasswordFlows)(resetToken.user)) {
                await prisma.passwordResetToken.update({
                    where: { id: resetToken.id },
                    data: { used: true },
                });
                return res.status(400).json({
                    error: "Bad request",
                    message: "Password reset is not available for this account",
                });
            }
            const saltRounds = 10;
            const passwordHash = await bcrypt_1.default.hash(password, saltRounds);
            await prisma.user.update({
                where: { id: resetToken.userId },
                data: { passwordHash, mustResetPassword: false },
            });
            await prisma.passwordResetToken.update({
                where: { id: resetToken.id },
                data: { used: true },
            });
            if (config.enableRefreshTokenRotation) {
                try {
                    await prisma.refreshToken.updateMany({
                        where: { userId: resetToken.userId, revoked: false },
                        data: { revoked: true },
                    });
                }
                catch {
                    if (config_1.config.isDev) {
                        console.debug("Refresh token revocation skipped (feature disabled or table missing)");
                    }
                }
            }
            if (config.enableAuditLogging) {
                await (0, audit_1.logAuditEvent)({
                    userId: resetToken.userId,
                    action: "password_changed",
                    ipAddress: req.ip || req.connection.remoteAddress || undefined,
                    userAgent: req.headers["user-agent"] || undefined,
                });
            }
            return res.json({ message: "Password has been reset successfully" });
        }
        catch (error) {
            console.error("Password reset confirm error:", error);
            return res.status(500).json({
                error: "Internal server error",
                message: "Failed to reset password",
            });
        }
    });
};
exports.registerAccountPasswordResetRoutes = registerAccountPasswordResetRoutes;
