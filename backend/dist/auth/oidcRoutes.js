"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerOidcRoutes = void 0;
const openid_client_1 = require("openid-client");
const oidcClient_1 = require("./oidcClient");
const oidcCallbackRoute_1 = require("./oidcCallbackRoute");
const oidcRouteHelpers_1 = require("./oidcRouteHelpers");
const registerOidcRoutes = (deps) => {
    const { router, ensureAuthEnabled, config } = deps;
    if (!config.oidc.enabled) {
        return;
    }
    const { buildOidcClient, getOidcClient } = (0, oidcClient_1.createOidcClientFactory)(config);
    const clearOidcFlowCookie = (req, res) => {
        res.clearCookie(oidcRouteHelpers_1.OIDC_FLOW_COOKIE_NAME, {
            httpOnly: true,
            sameSite: "lax",
            secure: (0, oidcRouteHelpers_1.requestUsesHttps)(req),
            path: "/",
        });
    };
    const setOidcFlowCookie = (req, res, payload) => {
        const encoded = (0, oidcRouteHelpers_1.encodeFlowPayload)(payload, config.jwtSecret);
        res.cookie(oidcRouteHelpers_1.OIDC_FLOW_COOKIE_NAME, encoded, {
            httpOnly: true,
            sameSite: "lax",
            secure: (0, oidcRouteHelpers_1.requestUsesHttps)(req),
            path: "/",
            maxAge: oidcRouteHelpers_1.OIDC_FLOW_TTL_MS,
        });
    };
    const redirectToLoginWithError = (req, res, errorCode, returnTo) => {
        const search = new URLSearchParams();
        search.set("oidcError", errorCode);
        search.set("oidcErrorMessage", (0, oidcRouteHelpers_1.getOidcErrorMessage)(errorCode));
        if (returnTo) {
            search.set("returnTo", (0, oidcRouteHelpers_1.sanitizeReturnTo)(returnTo));
        }
        clearOidcFlowCookie(req, res);
        return res.redirect(`/login?${search.toString()}`);
    };
    router.get("/oidc/start", async (req, res) => {
        try {
            if (!(await ensureAuthEnabled(res)))
                return;
            const client = await getOidcClient();
            const state = openid_client_1.generators.state();
            const nonce = openid_client_1.generators.nonce();
            const codeVerifier = openid_client_1.generators.codeVerifier();
            const codeChallenge = openid_client_1.generators.codeChallenge(codeVerifier);
            const returnTo = (0, oidcRouteHelpers_1.sanitizeReturnTo)(req.query.returnTo);
            setOidcFlowCookie(req, res, {
                state,
                nonce,
                codeVerifier,
                returnTo,
                expiresAt: Date.now() + oidcRouteHelpers_1.OIDC_FLOW_TTL_MS,
            });
            const authorizationUrl = client.authorizationUrl({
                scope: config.oidc.scopes,
                response_type: "code",
                state,
                nonce,
                code_challenge: codeChallenge,
                code_challenge_method: "S256",
            });
            return res.redirect(authorizationUrl);
        }
        catch (error) {
            console.error("OIDC start error:", error);
            return redirectToLoginWithError(req, res, "callback_failed");
        }
    });
    (0, oidcCallbackRoute_1.registerOidcCallbackRoute)({
        ...deps,
        clearOidcFlowCookie,
        redirectToLoginWithError,
        getOidcClient,
        buildOidcClient,
    });
};
exports.registerOidcRoutes = registerOidcRoutes;
