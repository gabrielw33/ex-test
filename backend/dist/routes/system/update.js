"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUpdateRoutes = exports.__setUpdateTtlForTests = exports.__resetUpdateCacheForTests = exports.computeIsUpdateAvailable = exports.fetchLatest = void 0;
const semver_1 = require("../../utils/semver");
const config_1 = require("../../config");
let UPDATE_CHECK_TTL_MS = 10 * 60 * 1000;
let cache = null;
const parseChannel = (raw) => {
    const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    return normalized === "prerelease" ? "prerelease" : "stable";
};
const envOutboundEnabled = () => config_1.config.updateCheck.outbound;
const envGithubToken = () => config_1.config.updateCheck.githubToken;
const sameDevVersion = (a, b) => a.major === b.major &&
    a.minor === b.minor &&
    a.patch === b.patch &&
    [a, b].every((version) => version.prerelease.length === 2 &&
        version.prerelease[0] === "dev" &&
        /^[0-9a-f]{7,40}$/.test(version.prerelease[1]));
const pickLatestRelease = (releases, channel) => {
    const candidates = releases
        .filter((r) => r && !r.draft)
        .filter((r) => {
        if (channel === "prerelease")
            return true;
        if (r.prerelease)
            return false;
        const tag = typeof r.tag_name === "string" ? r.tag_name : "";
        const parsed = (0, semver_1.parseSemver)(tag);
        return Boolean(parsed && parsed.prerelease.length === 0);
    })
        .map((r) => {
        const tag = typeof r.tag_name === "string" ? r.tag_name : "";
        const parsed = (0, semver_1.parseSemver)(tag);
        return { r, parsed };
    })
        .filter((x) => Boolean(x.parsed));
    if (candidates.length === 0)
        return null;
    let best = candidates[0];
    for (const candidate of candidates.slice(1)) {
        // Commit hashes identify builds, not their chronological order.
        const order = sameDevVersion(candidate.parsed, best.parsed)
            ? (Date.parse(candidate.r.published_at ?? "") || 0) -
                (Date.parse(best.r.published_at ?? "") || 0)
            : (0, semver_1.compareSemver)(candidate.parsed, best.parsed);
        if (order > 0) {
            best = candidate;
        }
    }
    return best.r;
};
const normalizeVersion = (raw) => {
    const parsed = (0, semver_1.parseSemver)(raw);
    if (!parsed)
        return null;
    const base = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
    return parsed.prerelease.length > 0
        ? `${base}-${parsed.prerelease.join(".")}`
        : base;
};
const fetchLatest = async (channel) => {
    const now = Date.now();
    if (cache &&
        cache.channel === channel &&
        now - cache.fetchedAt < UPDATE_CHECK_TTL_MS) {
        return cache.response;
    }
    if (!envOutboundEnabled()) {
        const response = {
            channel,
            outboundEnabled: false,
            latestVersion: null,
            latestUrl: null,
            publishedAt: null,
            isUpdateAvailable: null,
        };
        cache = { channel, fetchedAt: now, etag: null, response };
        return response;
    }
    const headers = {
        Accept: "application/vnd.github+json",
        "User-Agent": "ExcaliDash-UpdateCheck",
    };
    const token = envGithubToken();
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    if (cache && cache.channel === channel && cache.etag) {
        headers["If-None-Match"] = cache.etag;
    }
    const url = "https://api.github.com/repos/ZimengXiong/ExcaliDash/releases" +
        (channel === "stable" ? "/latest" : "?per_page=100");
    const resp = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10_000),
    });
    if (resp.status === 304 && cache && cache.channel === channel) {
        cache = { ...cache, fetchedAt: now };
        return cache.response;
    }
    if (!resp.ok) {
        const response = {
            channel,
            outboundEnabled: true,
            latestVersion: null,
            latestUrl: null,
            publishedAt: null,
            isUpdateAvailable: null,
            error: `GitHub API error: HTTP ${resp.status}`,
        };
        cache = { channel, fetchedAt: now, etag: null, response };
        return response;
    }
    const etag = resp.headers.get("etag");
    const json = (await resp.json());
    const releases = Array.isArray(json)
        ? json
        : channel === "stable" && json && typeof json === "object"
            ? [json]
            : [];
    const latest = pickLatestRelease(releases, channel);
    const latestVersion = latest?.tag_name
        ? normalizeVersion(latest.tag_name)
        : null;
    const response = {
        channel,
        outboundEnabled: true,
        latestVersion,
        latestUrl: typeof latest?.html_url === "string" ? latest.html_url : null,
        publishedAt: typeof latest?.published_at === "string" ? latest.published_at : null,
        isUpdateAvailable: null, // computed once we know currentVersion
    };
    cache = { channel, fetchedAt: now, etag, response };
    return response;
};
exports.fetchLatest = fetchLatest;
const computeIsUpdateAvailable = (currentVersion, latestVersion) => {
    if (!currentVersion || !latestVersion)
        return null;
    const currentParsed = (0, semver_1.parseSemver)(currentVersion);
    const latestParsed = (0, semver_1.parseSemver)(latestVersion);
    if (!currentParsed || !latestParsed)
        return null;
    // The selected release is the newest published dev build. A different hash
    // means a channel update; its lexical SemVer precedence is meaningless.
    if (sameDevVersion(currentParsed, latestParsed)) {
        return currentParsed.prerelease[1] !== latestParsed.prerelease[1];
    }
    return (0, semver_1.compareSemver)(latestParsed, currentParsed) > 0;
};
exports.computeIsUpdateAvailable = computeIsUpdateAvailable;
const __resetUpdateCacheForTests = () => {
    cache = null;
};
exports.__resetUpdateCacheForTests = __resetUpdateCacheForTests;
const __setUpdateTtlForTests = (ttlMs) => {
    UPDATE_CHECK_TTL_MS = ttlMs;
};
exports.__setUpdateTtlForTests = __setUpdateTtlForTests;
const registerUpdateRoutes = (app, deps) => {
    app.get("/system/update", deps.asyncHandler(async (req, res) => {
        const channel = parseChannel(req.query.channel);
        const currentVersion = deps.getBackendVersion() || null;
        const latest = await (0, exports.fetchLatest)(channel);
        const isUpdateAvailable = (0, exports.computeIsUpdateAvailable)(currentVersion, latest.latestVersion);
        const payload = {
            ...latest,
            currentVersion,
            isUpdateAvailable,
        };
        res.status(200).json(payload);
    }));
};
exports.registerUpdateRoutes = registerUpdateRoutes;
