"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHttpsRedirectUrl = exports.createHttpsRedirectPolicy = void 0;
const parseAllowedOrigin = (origin) => {
    try {
        const parsed = new URL(origin);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return null;
        }
        return {
            host: parsed.host.toLowerCase(),
            protocol: parsed.protocol,
        };
    }
    catch {
        return null;
    }
};
const readHeader = (req, name) => {
    const normalizedName = name.toLowerCase();
    const directHeader = req.header?.(normalizedName) ?? req.get?.(normalizedName);
    if (typeof directHeader === "string") {
        const trimmed = directHeader.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    const rawHeader = req.headers?.[normalizedName];
    const value = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};
const getForwardedProto = (req) => {
    const raw = readHeader(req, "x-forwarded-proto");
    if (!raw)
        return null;
    const firstHop = raw.split(",")[0]?.trim().toLowerCase() || "";
    return firstHop.length > 0 ? firstHop : null;
};
const createHttpsRedirectPolicy = (allowedOrigins) => {
    const parsedOrigins = allowedOrigins
        .map((origin) => parseAllowedOrigin(origin))
        .filter((origin) => origin !== null);
    const hostProtocols = new Map();
    for (const origin of parsedOrigins) {
        const existing = hostProtocols.get(origin.host) ?? new Set();
        existing.add(origin.protocol);
        hostProtocols.set(origin.host, existing);
    }
    const canonicalHttpsHost = parsedOrigins.find((origin) => origin.protocol === "https:")?.host ?? null;
    return {
        shouldEnforceHttps: canonicalHttpsHost !== null,
        canonicalHttpsHost,
        hostProtocols,
    };
};
exports.createHttpsRedirectPolicy = createHttpsRedirectPolicy;
const getHttpsRedirectUrl = (req, policy) => {
    if (!policy.shouldEnforceHttps)
        return null;
    const requestPath = (req.originalUrl || req.url || "/").split("?", 1)[0];
    if (requestPath === "/health")
        return null;
    if (req.secure || getForwardedProto(req) === "https")
        return null;
    const rawHost = readHeader(req, "host")?.toLowerCase() ?? "";
    const protocols = rawHost ? policy.hostProtocols.get(rawHost) : undefined;
    const targetHost = protocols?.has("https:")
        ? rawHost
        : protocols
            ? null
            : policy.canonicalHttpsHost;
    if (!targetHost)
        return null;
    const path = (req.originalUrl || req.url || "/").startsWith("/")
        ? req.originalUrl || req.url || "/"
        : "/";
    return `https://${targetHost}${path}`;
};
exports.getHttpsRedirectUrl = getHttpsRedirectUrl;
