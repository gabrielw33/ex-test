"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userPreferencesSchema = exports.apiKeyCreateSchema = exports.mustResetPasswordSchema = exports.changePasswordSchema = exports.updateEmailSchema = exports.updateProfileSchema = exports.passwordResetConfirmSchema = exports.passwordResetRequestSchema = exports.loginRateLimitResetSchema = exports.loginRateLimitUpdateSchema = exports.impersonateSchema = exports.adminUpdateUserSchema = exports.adminCreateUserSchema = exports.authOnboardingChoiceSchema = exports.authEnabledToggleSchema = exports.adminRoleUpdateSchema = exports.oidcJitProvisioningToggleSchema = exports.registrationToggleSchema = exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
const config_1 = require("../config");
const passwordPolicyMessage = () => (0, config_1.buildPasswordPolicyMessage)(config_1.config.passwordPolicy);
const passwordSchema = zod_1.z.string().superRefine((value, ctx) => {
    const validationMessage = (0, config_1.validatePasswordAgainstPolicy)(value, config_1.config.passwordPolicy);
    if (!validationMessage)
        return;
    ctx.addIssue({
        code: zod_1.z.ZodIssueCode.custom,
        message: validationMessage,
    });
});
exports.registerSchema = zod_1.z.object({
    username: zod_1.z.string().trim().min(3).max(50).optional(),
    email: zod_1.z.string().email().toLowerCase().trim(),
    password: passwordSchema,
    name: zod_1.z.string().trim().min(1).max(100),
    setupCode: zod_1.z.string().trim().min(1).max(64).optional(),
});
exports.loginSchema = zod_1.z
    .object({
    identifier: zod_1.z.string().trim().min(1).max(255).optional(),
    email: zod_1.z.string().email().toLowerCase().trim().optional(),
    username: zod_1.z.string().trim().min(1).max(255).optional(),
    password: zod_1.z.string(),
})
    .refine((data) => Boolean(data.identifier || data.email || data.username), {
    message: "identifier/email/username is required",
});
exports.registrationToggleSchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
});
exports.oidcJitProvisioningToggleSchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
});
exports.adminRoleUpdateSchema = zod_1.z.object({
    identifier: zod_1.z.string().trim().min(1).max(255),
    role: zod_1.z.enum(["ADMIN", "USER"]),
});
exports.authEnabledToggleSchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
});
exports.authOnboardingChoiceSchema = zod_1.z.object({
    enableAuth: zod_1.z.boolean(),
});
exports.adminCreateUserSchema = zod_1.z
    .object({
    username: zod_1.z.string().trim().min(3).max(50).optional(),
    email: zod_1.z.string().email().toLowerCase().trim(),
    password: passwordSchema.optional(),
    oidcOnly: zod_1.z.boolean().optional(),
    name: zod_1.z.string().trim().min(1).max(100),
    role: zod_1.z.enum(["ADMIN", "USER"]).optional(),
    mustResetPassword: zod_1.z.boolean().optional(),
    isActive: zod_1.z.boolean().optional(),
})
    .superRefine((data, ctx) => {
    if (!data.oidcOnly && !data.password) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["password"],
            message: passwordPolicyMessage(),
        });
    }
});
exports.adminUpdateUserSchema = zod_1.z.object({
    username: zod_1.z.string().trim().min(3).max(50).nullable().optional(),
    name: zod_1.z.string().trim().min(1).max(100).optional(),
    role: zod_1.z.enum(["ADMIN", "USER"]).optional(),
    mustResetPassword: zod_1.z.boolean().optional(),
    isActive: zod_1.z.boolean().optional(),
});
exports.impersonateSchema = zod_1.z
    .object({
    userId: zod_1.z.string().trim().min(1).optional(),
    identifier: zod_1.z.string().trim().min(1).optional(),
})
    .refine((data) => Boolean(data.userId || data.identifier), {
    message: "userId/identifier is required",
});
exports.loginRateLimitUpdateSchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
    windowMs: zod_1.z
        .number()
        .int()
        .min(10_000)
        .max(24 * 60 * 60 * 1000),
    max: zod_1.z.number().int().min(1).max(10_000),
});
exports.loginRateLimitResetSchema = zod_1.z.object({
    identifier: zod_1.z.string().trim().min(1).max(255),
});
exports.passwordResetRequestSchema = zod_1.z.object({
    email: zod_1.z.string().email().toLowerCase().trim(),
});
exports.passwordResetConfirmSchema = zod_1.z.object({
    token: zod_1.z.string().min(1),
    password: passwordSchema,
});
exports.updateProfileSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(100),
});
exports.updateEmailSchema = zod_1.z.object({
    email: zod_1.z.string().email().toLowerCase().trim(),
    currentPassword: zod_1.z.string().min(1).max(100),
});
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string(),
    newPassword: passwordSchema,
});
exports.mustResetPasswordSchema = zod_1.z.object({
    newPassword: passwordSchema,
});
exports.apiKeyCreateSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(100),
    scopes: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.userPreferencesSchema = zod_1.z
    .object({
    theme: zod_1.z.enum(["light", "dark"]).optional(),
    dashboardSortField: zod_1.z.enum(["name", "createdAt", "updatedAt"]).optional(),
    dashboardSortDirection: zod_1.z.enum(["asc", "desc"]).optional(),
    language: zod_1.z.string().trim().min(1).max(35).optional(),
    gridStep: zod_1.z.number().int().min(1).max(100).optional(),
    editorAutoHide: zod_1.z.boolean().optional(),
    compactSidebar: zod_1.z.boolean().optional(),
})
    .strict();
