"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBootstrapRequired = exports.upsertAuthModeState = exports.buildAuthStatusPayload = exports.ensureBootstrapUserExists = exports.getAuthOnboardingStatus = void 0;
const accessPolicy_1 = require("./accessPolicy");
const getAuthOnboardingStatus = async (prisma, systemConfig) => {
    const [activeUsers, drawingsCount, collectionsCount] = await Promise.all([
        prisma.user.count({ where: { isActive: true } }),
        prisma.drawing.count(),
        prisma.collection.count(),
    ]);
    const hasLegacyData = drawingsCount > 0 || collectionsCount > 0;
    const needsChoice = !systemConfig.authEnabled &&
        activeUsers === 0 &&
        !systemConfig.authOnboardingCompleted;
    return {
        activeUsers,
        hasLegacyData,
        needsChoice,
        mode: hasLegacyData ? "migration" : "fresh",
    };
};
exports.getAuthOnboardingStatus = getAuthOnboardingStatus;
const ensureBootstrapUserExists = async (prisma, bootstrapUserId) => {
    const bootstrap = await prisma.user.findUnique({
        where: { id: bootstrapUserId },
        select: { id: true },
    });
    if (bootstrap)
        return;
    await prisma.user.create({
        data: {
            id: bootstrapUserId,
            email: "bootstrap@excalidash.local",
            username: null,
            passwordHash: "",
            name: "Bootstrap Admin",
            role: "ADMIN",
            mustResetPassword: true,
            isActive: false,
        },
    });
};
exports.ensureBootstrapUserExists = ensureBootstrapUserExists;
const buildAuthStatusPayload = ({ authMode, oidc, systemConfig, effectiveAuthEnabled, oidcJitProvisioningEnabled, onboarding, bootstrapRequired, passwordPolicy, user, }) => {
    const onboardingRequired = authMode === "local" ? onboarding.needsChoice : false;
    const onboardingMode = authMode === "local" ? onboarding.mode : null;
    const exposedUser = effectiveAuthEnabled ? user : null;
    return {
        enabled: effectiveAuthEnabled,
        authenticated: Boolean(exposedUser),
        authEnabled: effectiveAuthEnabled,
        authMode,
        oidcEnabled: oidc.enabled,
        oidcEnforced: oidc.enforced,
        oidcProvider: oidc.providerName,
        oidcJitProvisioningEnabled,
        registrationEnabled: effectiveAuthEnabled
            ? (0, accessPolicy_1.getEffectiveRegistrationEnabled)(authMode, systemConfig.registrationEnabled)
            : false,
        bootstrapRequired: effectiveAuthEnabled ? bootstrapRequired : false,
        authOnboardingRequired: onboardingRequired,
        authOnboardingMode: onboardingMode,
        authOnboardingRecommended: onboardingRequired ? "enable" : null,
        passwordPolicy,
        user: exposedUser
            ? {
                id: exposedUser.id,
                username: exposedUser.username ?? null,
                email: exposedUser.email,
                name: exposedUser.name,
                role: exposedUser.role,
                mustResetPassword: exposedUser.mustResetPassword ?? false,
                impersonatorId: exposedUser.impersonatorId,
            }
            : null,
    };
};
exports.buildAuthStatusPayload = buildAuthStatusPayload;
const upsertAuthModeState = async ({ prisma, defaultSystemConfigId, registrationEnabled, authEnabled, authOnboardingCompleted = true, }) => prisma.systemConfig.upsert({
    where: { id: defaultSystemConfigId },
    update: { authEnabled, authOnboardingCompleted },
    create: {
        id: defaultSystemConfigId,
        authEnabled,
        authOnboardingCompleted,
        registrationEnabled,
    },
});
exports.upsertAuthModeState = upsertAuthModeState;
const getBootstrapRequired = ({ authEnabled, oidcEnforced, bootstrapUser, activeUsers, }) => Boolean(authEnabled &&
    !oidcEnforced &&
    bootstrapUser &&
    bootstrapUser.isActive === false) && activeUsers === 0;
exports.getBootstrapRequired = getBootstrapRequired;
