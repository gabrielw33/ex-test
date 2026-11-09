"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveUpdateCheckConfig = exports.resolveLinkShareConfig = exports.parseDrawingsCacheTtlMs = exports.parseTrustProxy = void 0;
/**
 * Small derived-config resolvers built on the typed env loader. Extracted from
 * config.ts to keep that module under the repo line-count limit.
 */
const env_1 = require("./env");
/** Parse TRUST_PROXY exactly as backend/src/index.ts does today. */
const parseTrustProxy = () => {
    const raw = ((0, env_1.readRaw)("TRUST_PROXY") ?? "false").trim();
    if (raw === "true")
        return true;
    if (raw === "false")
        return false;
    const hops = Number.parseInt(raw, 10);
    return Number.isFinite(hops) && hops > 0 ? hops : false;
};
exports.parseTrustProxy = parseTrustProxy;
const parseDrawingsCacheTtlMs = () => {
    const parsed = Number((0, env_1.readRaw)("DRAWINGS_CACHE_TTL_MS"));
    if (!Number.isFinite(parsed) || parsed <= 0)
        return 5_000;
    return parsed;
};
exports.parseDrawingsCacheTtlMs = parseDrawingsCacheTtlMs;
const parseLinkShareTtl = (name, defaultMs) => {
    const raw = (0, env_1.readRaw)(name);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
};
const resolveLinkShareConfig = () => ({
    editDefaultTtlMs: parseLinkShareTtl("LINK_SHARE_EDIT_DEFAULT_TTL_MS", 7 * 24 * 60 * 60 * 1000),
    viewDefaultTtlMs: parseLinkShareTtl("LINK_SHARE_VIEW_DEFAULT_TTL_MS", 30 * 24 * 60 * 60 * 1000),
    maxTtlMs: parseLinkShareTtl("LINK_SHARE_MAX_TTL_MS", 90 * 24 * 60 * 60 * 1000),
});
exports.resolveLinkShareConfig = resolveLinkShareConfig;
const resolveUpdateCheckConfig = () => {
    const outboundRaw = ((0, env_1.readRaw)("UPDATE_CHECK_OUTBOUND") ?? "true")
        .trim()
        .toLowerCase();
    const outbound = outboundRaw === "true" || outboundRaw === "1" || outboundRaw === "yes";
    const tokenRaw = ((0, env_1.readRaw)("UPDATE_CHECK_GITHUB_TOKEN") ?? "").trim();
    return {
        outbound,
        githubToken: tokenRaw.length > 0 ? tokenRaw : null,
    };
};
exports.resolveUpdateCheckConfig = resolveUpdateCheckConfig;
