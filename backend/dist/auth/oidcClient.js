"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOidcClientFactory = void 0;
const openid_client_1 = require("openid-client");
const oidcRouteHelpers_1 = require("./oidcRouteHelpers");
const createOidcClientFactory = (config) => {
    let oidcClientPromise = null;
    const selectTokenEndpointAuthMethod = (opts) => {
        const supported = opts.supported?.filter(Boolean);
        if (opts.configured) {
            if (supported &&
                supported.length > 0 &&
                !supported.includes(opts.configured)) {
                throw new Error(`OIDC_TOKEN_ENDPOINT_AUTH_METHOD=${opts.configured} is configured, but provider does not advertise support for it. ` +
                    `Supported methods: ${supported.join(", ")}`);
            }
            return opts.configured;
        }
        if (!opts.hasClientSecret) {
            const method = "none";
            if (supported && supported.length > 0 && !supported.includes(method)) {
                throw new Error(`OIDC is configured without OIDC_CLIENT_SECRET (public client), but the provider does not advertise support for token endpoint auth method "${method}". ` +
                    `Fix: configure the client as public at your IdP (token endpoint auth = none), or set OIDC_CLIENT_SECRET for a confidential client.`);
            }
            return method;
        }
        const preferred = ["client_secret_basic", "client_secret_post"];
        for (const candidate of preferred) {
            if (!supported ||
                supported.length === 0 ||
                supported.includes(candidate)) {
                return candidate;
            }
        }
        throw new Error(`OIDC provider does not advertise support for client_secret-based token endpoint auth methods (tried: ${preferred.join(", ")}). ` +
            `If your provider requires JWT-based client auth (private_key_jwt/client_secret_jwt), ExcaliDash currently does not expose configuration for that.`);
    };
    const buildOidcClient = async (idTokenSignedResponseAlgOverride = null) => {
        if (!config.oidc.issuerUrl ||
            !config.oidc.clientId ||
            !config.oidc.redirectUri) {
            throw new Error("OIDC is enabled but provider configuration is incomplete");
        }
        const discoveryUrl = config.oidc.discoveryUrl || config.oidc.issuerUrl;
        const clientIssuer = await openid_client_1.Issuer.discover(discoveryUrl);
        const expectedIssuer = (0, oidcRouteHelpers_1.canonicalizeIssuerUrl)(config.oidc.issuerUrl);
        const discoveredIssuerRaw = typeof clientIssuer?.issuer === "string"
            ? clientIssuer.issuer
            : typeof clientIssuer?.metadata?.issuer === "string"
                ? clientIssuer.metadata.issuer
                : null;
        const discoveredIssuer = discoveredIssuerRaw
            ? (0, oidcRouteHelpers_1.canonicalizeIssuerUrl)(discoveredIssuerRaw)
            : null;
        if (!discoveredIssuer || discoveredIssuer !== expectedIssuer) {
            if (discoveredIssuer && discoveredIssuer !== expectedIssuer) {
                console.warn(`[OIDC] Issuer mismatch between discovery (${discoveredIssuerRaw}) and configured OIDC_ISSUER_URL (${config.oidc.issuerUrl}); using configured issuer for token validation.`);
            }
            if (typeof clientIssuer === "object" && clientIssuer) {
                if (typeof clientIssuer.metadata === "object" &&
                    clientIssuer.metadata !== null) {
                    clientIssuer.metadata.issuer = expectedIssuer;
                }
                else {
                    clientIssuer.metadata = { issuer: expectedIssuer };
                }
                const issuerDescriptor = Object.getOwnPropertyDescriptor(clientIssuer, "issuer");
                if (!issuerDescriptor || issuerDescriptor.writable) {
                    clientIssuer.issuer = expectedIssuer;
                }
            }
        }
        const supportedMethods = clientIssuer?.metadata
            ?.token_endpoint_auth_methods_supported;
        const tokenEndpointAuthMethod = selectTokenEndpointAuthMethod({
            hasClientSecret: Boolean(config.oidc.clientSecret),
            supported: supportedMethods,
            configured: config.oidc.tokenEndpointAuthMethod,
        });
        const defaultIdTokenAlg = (0, oidcRouteHelpers_1.resolveIdTokenSignedResponseAlg)(config.oidc.idTokenSignedResponseAlg, Boolean(config.oidc.clientSecret), clientIssuer?.metadata ?? {});
        const idTokenSignedResponseAlg = idTokenSignedResponseAlgOverride || defaultIdTokenAlg;
        const clientConfig = {
            client_id: config.oidc.clientId,
            redirect_uris: [config.oidc.redirectUri],
            response_types: ["code"],
            token_endpoint_auth_method: tokenEndpointAuthMethod,
            id_token_signed_response_alg: idTokenSignedResponseAlg,
        };
        if (config.oidc.clientSecret) {
            clientConfig.client_secret = config.oidc.clientSecret;
        }
        return new clientIssuer.Client(clientConfig);
    };
    const getOidcClient = async () => {
        if (!oidcClientPromise) {
            oidcClientPromise = buildOidcClient();
        }
        try {
            return await oidcClientPromise;
        }
        catch (error) {
            oidcClientPromise = null;
            throw error;
        }
    };
    return { buildOidcClient, getOidcClient };
};
exports.createOidcClientFactory = createOidcClientFactory;
