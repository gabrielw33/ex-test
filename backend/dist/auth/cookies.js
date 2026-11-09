"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readCookie = exports.parseCookieHeader = exports.clearAuthCookies = exports.setAccessTokenCookie = exports.setAuthCookies = exports.REFRESH_TOKEN_COOKIE_NAME = exports.ACCESS_TOKEN_COOKIE_NAME = void 0;
const ms_1 = __importDefault(require("ms"));
const config_1 = require("../config");
exports.ACCESS_TOKEN_COOKIE_NAME = "excalidash-access-token";
exports.REFRESH_TOKEN_COOKIE_NAME = "excalidash-refresh-token";
const DEFAULT_ACCESS_TTL_MS = 15 * 60 * 1000;
const DEFAULT_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const parseDurationToMs = (value, fallbackMs) => {
    const parsed = (0, ms_1.default)(value);
    if (typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0) {
        return parsed;
    }
    return fallbackMs;
};
const ACCESS_TOKEN_COOKIE_MAX_AGE_MS = parseDurationToMs(config_1.config.jwtAccessExpiresIn, DEFAULT_ACCESS_TTL_MS);
const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = parseDurationToMs(config_1.config.jwtRefreshExpiresIn, DEFAULT_REFRESH_TTL_MS);
const canTrustProxyHeaders = (req) => {
    const trustProxy = req.app?.get?.("trust proxy");
    if (trustProxy === true)
        return true;
    if (typeof trustProxy === "number")
        return trustProxy > 0;
    if (typeof trustProxy === "function")
        return true;
    return false;
};
const requestUsesHttps = (req) => {
    if (req.secure)
        return true;
    if (!canTrustProxyHeaders(req))
        return false;
    const forwardedProto = req.headers["x-forwarded-proto"];
    const raw = Array.isArray(forwardedProto)
        ? forwardedProto[0]
        : forwardedProto;
    const firstHop = String(raw || "")
        .split(",")[0]
        .trim()
        .toLowerCase();
    return firstHop === "https";
};
const shouldUseSecureCookies = (req) => requestUsesHttps(req);
const baseCookieOptions = (req) => ({
    httpOnly: true,
    secure: shouldUseSecureCookies(req),
    sameSite: "lax",
    path: "/",
});
const setAuthCookies = (req, res, tokens) => {
    res.cookie(exports.ACCESS_TOKEN_COOKIE_NAME, tokens.accessToken, {
        ...baseCookieOptions(req),
        maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
    });
    res.cookie(exports.REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken, {
        ...baseCookieOptions(req),
        maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
    });
};
exports.setAuthCookies = setAuthCookies;
const setAccessTokenCookie = (req, res, accessToken) => {
    res.cookie(exports.ACCESS_TOKEN_COOKIE_NAME, accessToken, {
        ...baseCookieOptions(req),
        maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
    });
};
exports.setAccessTokenCookie = setAccessTokenCookie;
const clearAuthCookies = (req, res) => {
    const options = baseCookieOptions(req);
    res.clearCookie(exports.ACCESS_TOKEN_COOKIE_NAME, options);
    res.clearCookie(exports.REFRESH_TOKEN_COOKIE_NAME, options);
};
exports.clearAuthCookies = clearAuthCookies;
const parseCookieHeader = (cookieHeader) => {
    if (!cookieHeader)
        return {};
    const cookies = {};
    for (const part of cookieHeader.split(";")) {
        const [rawKey, ...rawValueParts] = part.split("=");
        if (!rawKey || rawValueParts.length === 0)
            continue;
        const key = rawKey.trim();
        if (!key)
            continue;
        const rawValue = rawValueParts.join("=").trim();
        try {
            cookies[key] = decodeURIComponent(rawValue);
        }
        catch {
            cookies[key] = rawValue;
        }
    }
    return cookies;
};
exports.parseCookieHeader = parseCookieHeader;
const readCookie = (req, cookieName) => {
    const cookies = (0, exports.parseCookieHeader)(req.headers.cookie);
    const value = cookies[cookieName];
    if (!value || value.trim().length === 0)
        return null;
    return value;
};
exports.readCookie = readCookie;
