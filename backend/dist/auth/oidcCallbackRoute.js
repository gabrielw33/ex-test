"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerOidcCallbackRoute = void 0;
const client_1 = require("../generated/client");
const audit_1 = require("../utils/audit");
const tokenSecurity_1 = require("./tokenSecurity");
const oidcRouteHelpers_1 = require("./oidcRouteHelpers");
const registerOidcCallbackRoute = (deps) => {
    const { router, prisma, ensureAuthEnabled, ensureSystemConfig, sanitizeText, generateTokens, setAuthCookies, getRefreshTokenExpiresAt, isMissingRefreshTokenTableError, config, clearOidcFlowCookie, redirectToLoginWithError, getOidcClient, buildOidcClient, } = deps;
    const userSelect = {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        mustResetPassword: true,
        isActive: true,
    };
    const ensureTrashCollection = async (tx, userId) => {
        const trashCollectionId = `trash:${userId}`;
        const existingTrash = await tx.collection.findFirst({
            where: { id: trashCollectionId, userId },
            select: { id: true },
        });
        if (!existingTrash) {
            await tx.collection.create({
                data: { id: trashCollectionId, name: "Trash", userId },
            });
        }
    };
    router.get("/oidc/callback", async (req, res) => {
        const cookieValue = (() => {
            const cookieHeader = req.headers.cookie;
            if (!cookieHeader)
                return null;
            for (const part of cookieHeader.split(";")) {
                const [rawKey, ...rawValueParts] = part.split("=");
                if (!rawKey || rawValueParts.length === 0)
                    continue;
                if (rawKey.trim() !== oidcRouteHelpers_1.OIDC_FLOW_COOKIE_NAME)
                    continue;
                const rawValue = rawValueParts.join("=").trim();
                try {
                    return decodeURIComponent(rawValue);
                }
                catch {
                    return rawValue;
                }
            }
            return null;
        })();
        const flow = (0, oidcRouteHelpers_1.decodeFlowPayload)(cookieValue, config.jwtSecret);
        clearOidcFlowCookie(req, res);
        if (!flow) {
            return redirectToLoginWithError(req, res, "missing_flow");
        }
        try {
            if (!(await ensureAuthEnabled(res)))
                return;
            if (typeof req.query.error === "string") {
                return redirectToLoginWithError(req, res, "provider_error", flow.returnTo);
            }
            const client = await getOidcClient();
            const params = client.callbackParams(req);
            const checks = {
                state: flow.state,
                nonce: flow.nonce,
                code_verifier: flow.codeVerifier,
            };
            let tokenSet;
            try {
                tokenSet = await client.callback(config.oidc.redirectUri, params, checks);
            }
            catch (error) {
                const mismatch = (0, oidcRouteHelpers_1.parseJwtAlgMismatchError)(error);
                const hasExplicitAlgOverride = Boolean(config.oidc.idTokenSignedResponseAlg);
                const canRetryWithObservedAlg = !hasExplicitAlgOverride &&
                    mismatch !== null &&
                    (0, oidcRouteHelpers_1.canUseIdTokenSigningAlg)(mismatch.got, Boolean(config.oidc.clientSecret));
                if (!canRetryWithObservedAlg) {
                    throw error;
                }
                console.warn(`OIDC callback id_token alg mismatch (expected ${mismatch.expected}, got ${mismatch.got}); retrying once with ${mismatch.got}.`);
                const retryClient = await buildOidcClient(mismatch.got);
                tokenSet = await retryClient.callback(config.oidc.redirectUri, params, checks);
            }
            const idTokenClaims = tokenSet.claims();
            let userinfoClaims = {};
            const emailMissingFromIdToken = !(0, oidcRouteHelpers_1.readStringClaim)(idTokenClaims, config.oidc.emailClaim) &&
                !(0, oidcRouteHelpers_1.readStringClaim)(idTokenClaims, "email");
            if (emailMissingFromIdToken) {
                try {
                    userinfoClaims = (await client.userinfo(tokenSet));
                }
                catch (userinfoError) {
                    console.error("OIDC: userinfo request failed, falling back to ID token claims only:", userinfoError);
                }
            }
            const claims = {
                ...userinfoClaims,
                ...idTokenClaims,
            };
            const issuer = client.issuer.issuer;
            const subject = (0, oidcRouteHelpers_1.readStringClaim)(claims, "sub");
            if (!subject) {
                return redirectToLoginWithError(req, res, "missing_subject", flow.returnTo);
            }
            const rawEmail = (0, oidcRouteHelpers_1.readStringClaim)(claims, config.oidc.emailClaim) ??
                (0, oidcRouteHelpers_1.readStringClaim)(claims, "email");
            if (!rawEmail) {
                return redirectToLoginWithError(req, res, "missing_email", flow.returnTo);
            }
            const normalizedEmail = (0, oidcRouteHelpers_1.normalizeEmail)(rawEmail);
            const systemConfig = await ensureSystemConfig();
            const jitProvisioningEnabled = typeof systemConfig.oidcJitProvisioningEnabled === "boolean"
                ? systemConfig.oidcJitProvisioningEnabled
                : config.oidc.jitProvisioning;
            // Trust email verification only from the signed ID token, never from the
            // unsigned UserInfo response — otherwise a provider/tenant that lets a
            // user assert email_verified could match an existing account by email.
            const emailVerified = (0, oidcRouteHelpers_1.readBooleanClaim)(idTokenClaims, config.oidc.emailVerifiedClaim);
            if (config.oidc.requireEmailVerified && emailVerified !== true) {
                return redirectToLoginWithError(req, res, "unverified_email", flow.returnTo);
            }
            const oidcGroups = Array.from(new Set((0, oidcRouteHelpers_1.normalizeClaimGroups)((0, oidcRouteHelpers_1.readClaimByPath)(claims, config.oidc.groupsClaim))));
            const adminGroups = new Set(config.oidc.adminGroups);
            const shouldBeAdmin = adminGroups.size > 0 &&
                oidcGroups.some((group) => adminGroups.has(group));
            const user = await prisma.$transaction(async (tx) => {
                const linkedIdentity = await tx.authIdentity.findUnique({
                    where: { issuer_subject: { issuer, subject } },
                    include: { user: { select: userSelect } },
                });
                if (linkedIdentity) {
                    await tx.authIdentity.update({
                        where: { id: linkedIdentity.id },
                        data: { lastLoginAt: new Date(), emailAtLink: normalizedEmail },
                    });
                    return linkedIdentity.user;
                }
                const existingUser = await tx.user.findUnique({
                    where: { email: normalizedEmail },
                    select: userSelect,
                });
                if (existingUser && !existingUser.isActive) {
                    return existingUser;
                }
                let resolvedUser;
                if (existingUser) {
                    resolvedUser = existingUser;
                }
                else {
                    if (!jitProvisioningEnabled) {
                        throw new Error("OIDC provisioning disabled");
                    }
                    const activeUsers = await tx.user.count({
                        where: { isActive: true },
                    });
                    const defaultName = (0, oidcRouteHelpers_1.readStringClaim)(claims, "name") ??
                        (0, oidcRouteHelpers_1.readStringClaim)(claims, "preferred_username") ??
                        normalizedEmail.split("@")[0] ??
                        "User";
                    const sanitizedName = sanitizeText(defaultName, 100) || "User";
                    const role = activeUsers === 0 && config.oidc.firstUserAdmin ? "ADMIN" : "USER";
                    resolvedUser = await tx.user.create({
                        data: {
                            email: normalizedEmail,
                            username: null,
                            passwordHash: "",
                            name: sanitizedName,
                            role,
                            mustResetPassword: false,
                            isActive: true,
                        },
                        select: userSelect,
                    });
                    await ensureTrashCollection(tx, resolvedUser.id);
                }
                const existingProviderIdentity = await tx.authIdentity.findUnique({
                    where: {
                        provider_userId: {
                            provider: oidcRouteHelpers_1.OIDC_PROVIDER_KEY,
                            userId: resolvedUser.id,
                        },
                    },
                    select: { id: true, issuer: true, subject: true },
                });
                if (existingProviderIdentity) {
                    await tx.authIdentity.update({
                        where: { id: existingProviderIdentity.id },
                        data: {
                            issuer,
                            subject,
                            emailAtLink: normalizedEmail,
                            lastLoginAt: new Date(),
                        },
                    });
                }
                else {
                    await tx.authIdentity.create({
                        data: {
                            userId: resolvedUser.id,
                            provider: oidcRouteHelpers_1.OIDC_PROVIDER_KEY,
                            issuer,
                            subject,
                            emailAtLink: normalizedEmail,
                            lastLoginAt: new Date(),
                        },
                    });
                }
                if (adminGroups.size > 0) {
                    const nextRole = shouldBeAdmin ? "ADMIN" : "USER";
                    if (resolvedUser.role !== nextRole) {
                        resolvedUser = await tx.user.update({
                            where: { id: resolvedUser.id },
                            data: { role: nextRole },
                            select: userSelect,
                        });
                    }
                }
                return resolvedUser;
            });
            if (!user.isActive) {
                return redirectToLoginWithError(req, res, "account_inactive", flow.returnTo);
            }
            const { accessToken, refreshToken } = generateTokens(user.id, user.email, { authProvider: "oidc", oidcGroups });
            setAuthCookies(req, res, { accessToken, refreshToken });
            if (config.enableRefreshTokenRotation) {
                const expiresAt = getRefreshTokenExpiresAt();
                try {
                    await prisma.refreshToken.create({
                        data: {
                            userId: user.id,
                            token: (0, tokenSecurity_1.hashTokenForStorage)(refreshToken),
                            expiresAt,
                        },
                    });
                }
                catch (error) {
                    if (isMissingRefreshTokenTableError(error)) {
                        return redirectToLoginWithError(req, res, "callback_failed", flow.returnTo);
                    }
                    throw error;
                }
            }
            if (config.enableAuditLogging) {
                await (0, audit_1.logAuditEvent)({
                    userId: user.id,
                    action: "oidc_login",
                    ipAddress: req.ip || req.connection.remoteAddress || undefined,
                    userAgent: req.headers["user-agent"] || undefined,
                    details: { provider: config.oidc.providerName, issuer },
                });
            }
            return res.redirect(flow.returnTo || "/");
        }
        catch (error) {
            if (error instanceof Error &&
                /OIDC provisioning disabled/i.test(error.message)) {
                return redirectToLoginWithError(req, res, "provisioning_disabled", flow.returnTo);
            }
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002") {
                return redirectToLoginWithError(req, res, "callback_failed", flow.returnTo);
            }
            console.error("OIDC callback error:", error);
            return redirectToLoginWithError(req, res, "callback_failed", flow.returnTo);
        }
    });
};
exports.registerOidcCallbackRoute = registerOidcCallbackRoute;
