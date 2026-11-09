"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNonBrowserApiKeyBearerRequest = exports.hasBearerApiKey = exports.parseApiKeyScopes = exports.serializeApiKeyScopes = exports.apiKeyHashMatches = exports.extractApiKeyId = exports.isApiKeyToken = exports.hashApiKey = exports.generateApiKey = exports.DEFAULT_API_KEY_SCOPES = exports.API_KEY_PREFIX = void 0;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../config");
const API_KEY_SCRYPT_PEPPER = config_1.config.apiKeyHashPepper;
const API_KEY_SCRYPT_N = 1 << 14;
const API_KEY_SCRYPT_R = 8;
const API_KEY_SCRYPT_P = 1;
const API_KEY_SCRYPT_KEYLEN = 32;
const API_KEY_SCRYPT_MAXMEM = 32 * 1024 * 1024;
exports.API_KEY_PREFIX = "exd_";
exports.DEFAULT_API_KEY_SCOPES = [
    "drawings:read",
    "drawings:write",
    "collections:read",
    "collections:write",
];
const generateApiKey = () => {
    const keyId = crypto_1.default.randomBytes(12).toString("base64url");
    const secret = crypto_1.default.randomBytes(32).toString("base64url");
    const token = `${exports.API_KEY_PREFIX}${keyId}_${secret}`;
    return {
        token,
        keyId,
        prefix: token.slice(0, 16),
        tokenHash: (0, exports.hashApiKey)(token),
    };
};
exports.generateApiKey = generateApiKey;
const hashApiKey = (token) => crypto_1.default
    .scryptSync(token, API_KEY_SCRYPT_PEPPER, API_KEY_SCRYPT_KEYLEN, {
    N: API_KEY_SCRYPT_N,
    r: API_KEY_SCRYPT_R,
    p: API_KEY_SCRYPT_P,
    maxmem: API_KEY_SCRYPT_MAXMEM,
})
    .toString("hex");
exports.hashApiKey = hashApiKey;
const isApiKeyToken = (token) => token.startsWith(exports.API_KEY_PREFIX);
exports.isApiKeyToken = isApiKeyToken;
const extractApiKeyId = (token) => {
    if (!(0, exports.isApiKeyToken)(token))
        return null;
    const withoutPrefix = token.slice(exports.API_KEY_PREFIX.length);
    const separatorIndex = withoutPrefix[16] === "_" ? 16 : withoutPrefix.indexOf("_");
    if (separatorIndex <= 0)
        return null;
    const keyId = withoutPrefix.slice(0, separatorIndex);
    return /^[A-Za-z0-9_-]{8,64}$/.test(keyId) ? keyId : null;
};
exports.extractApiKeyId = extractApiKeyId;
const apiKeyHashMatches = (token, storedHash) => {
    const computed = Buffer.from((0, exports.hashApiKey)(token), "hex");
    const stored = Buffer.from(storedHash, "hex");
    if (computed.length !== stored.length)
        return false;
    return crypto_1.default.timingSafeEqual(computed, stored);
};
exports.apiKeyHashMatches = apiKeyHashMatches;
const serializeApiKeyScopes = (scopes = exports.DEFAULT_API_KEY_SCOPES) => scopes.join(",");
exports.serializeApiKeyScopes = serializeApiKeyScopes;
const parseApiKeyScopes = (raw) => (raw || "")
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
exports.parseApiKeyScopes = parseApiKeyScopes;
const hasBearerApiKey = (authorizationHeader) => {
    const header = Array.isArray(authorizationHeader)
        ? authorizationHeader[0]
        : authorizationHeader;
    if (typeof header !== "string")
        return false;
    const [scheme, token] = header.split(" ");
    return (scheme === "Bearer" && typeof token === "string" && (0, exports.isApiKeyToken)(token));
};
exports.hasBearerApiKey = hasBearerApiKey;
const isNonBrowserApiKeyBearerRequest = (req) => {
    if (!(0, exports.hasBearerApiKey)(req.headers.authorization))
        return false;
    return !req.headers.origin && !req.headers.referer;
};
exports.isNonBrowserApiKeyBearerRequest = isNonBrowserApiKeyBearerRequest;
