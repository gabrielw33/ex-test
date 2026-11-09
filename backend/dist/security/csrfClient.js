"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCsrfValidationClientIds = exports.getLegacyClientId = exports.getCsrfClientCookieValue = exports.parseCookies = exports.CSRF_CLIENT_COOKIE_NAME = void 0;
exports.CSRF_CLIENT_COOKIE_NAME = "excalidash-csrf-client";
const parseCookies = (cookieHeader) => {
    if (!cookieHeader)
        return {};
    const cookies = {};
    for (const part of cookieHeader.split(";")) {
        const [rawKey, ...rawValueParts] = part.split("=");
        const key = rawKey?.trim();
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
exports.parseCookies = parseCookies;
const getCsrfClientCookieValue = (req) => {
    const cookies = (0, exports.parseCookies)(req.headers.cookie);
    const value = cookies[exports.CSRF_CLIENT_COOKIE_NAME];
    if (!value)
        return null;
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(value))
        return null;
    return value;
};
exports.getCsrfClientCookieValue = getCsrfClientCookieValue;
const getLegacyClientId = (req) => {
    const ip = req.ip || req.connection.remoteAddress || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";
    return `${ip}:${userAgent}`.slice(0, 256);
};
exports.getLegacyClientId = getLegacyClientId;
const getCsrfValidationClientIds = (req) => {
    const candidates = [];
    const cookieValue = (0, exports.getCsrfClientCookieValue)(req);
    if (cookieValue) {
        candidates.push(`cookie:${cookieValue}`);
    }
    const legacyClientId = (0, exports.getLegacyClientId)(req);
    if (!candidates.includes(legacyClientId)) {
        candidates.push(legacyClientId);
    }
    return candidates;
};
exports.getCsrfValidationClientIds = getCsrfValidationClientIds;
