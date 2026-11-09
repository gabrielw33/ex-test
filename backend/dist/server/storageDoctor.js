"use strict";
/**
 * Startup "storage doctor": prints a single boxed STORAGE block summarising
 * how file/image blobs and the database are configured, so an operator can
 * confirm at a glance whether they are on sqlite+db-bytes or postgres+S3.
 *
 * Split into a pure renderer (`buildStorageSummary`) and a thin wiring
 * function (`runStorageDoctor`). The renderer takes plain data — no network,
 * no module singletons — so it unit-tests deterministically. The reachability
 * probe (a best-effort S3 HeadBucket) is performed by `runStorageDoctor` and
 * passed in as a result; a failed probe prints an actionable WARNING and never
 * throws, so a misconfigured S3 endpoint cannot crash startup.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runStorageDoctor = exports.buildStorageSummary = exports.parseDatabaseTarget = void 0;
/**
 * Parse a Prisma connection string into a provider + credential-free target.
 * sqlite → the file path; postgres/mysql → host:port/dbname (user/password
 * are deliberately dropped).
 */
const parseDatabaseTarget = (databaseUrl) => {
    if (!databaseUrl || databaseUrl.trim().length === 0) {
        return { provider: "unknown", target: "<unset>" };
    }
    if (databaseUrl.startsWith("file:")) {
        return { provider: "sqlite", target: databaseUrl.replace(/^file:/, "") };
    }
    try {
        const parsed = new URL(databaseUrl);
        const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
        const provider = scheme === "postgres" || scheme === "postgresql"
            ? "postgresql"
            : scheme === "mysql"
                ? "mysql"
                : scheme;
        const host = parsed.hostname || "localhost";
        const port = parsed.port ? `:${parsed.port}` : "";
        const dbName = parsed.pathname.replace(/^\//, "") || "<default>";
        return { provider, target: `${host}${port}/${dbName}` };
    }
    catch {
        return { provider: "unknown", target: "<unparseable>" };
    }
};
exports.parseDatabaseTarget = parseDatabaseTarget;
/**
 * Build the STORAGE summary as an array of plain content lines (no box
 * borders). Pure: given the same deps it always returns the same lines.
 */
const buildStorageSummary = (deps) => {
    const { config, s3Enabled, probe } = deps;
    const lines = [];
    const db = (0, exports.parseDatabaseTarget)(config.databaseUrl);
    lines.push(`Database:      ${db.provider} (${db.target})`);
    if (s3Enabled && config.s3.bucket) {
        lines.push("File storage:  s3");
        lines.push(`  Bucket:      ${config.s3.bucket}`);
        lines.push(`  Region:      ${config.s3.region}`);
        lines.push(`  Endpoint:    ${config.s3.endpoint ?? "AWS default"}`);
        lines.push(`  Public URL:  ${config.s3.publicUrl ?? "(virtual-hosted-style)"}`);
        lines.push(`  Path style:  ${config.s3.forcePathStyle ? "on" : "off"}`);
        if (probe && probe.ok) {
            lines.push("  Reachable:   yes (HeadBucket ok)");
        }
        else if (probe && !probe.ok) {
            lines.push("  Reachable:   NO");
            lines.push(`  WARNING: could not reach bucket '${config.s3.bucket}': ${probe.error ?? "unknown error"}`);
            lines.push("  Likely a bad credential, endpoint, or missing bucket. S3 uploads will fail until fixed.");
        }
        // getPublicUrl's per-request warning is surfaced here instead, once.
        if (config.s3.endpoint && !config.s3.publicUrl) {
            lines.push("  WARNING: custom S3_ENDPOINT set without S3_PUBLIC_URL; public image URLs may not resolve.");
            lines.push("  Set S3_PUBLIC_URL to the public base URL of your bucket or CDN.");
        }
    }
    else {
        lines.push("File storage:  database (default)");
        lines.push("  Image blobs are stored in the database (DrawingFile.data).");
    }
    lines.push(`Limits:        FILE_UPLOAD_MAX_MB=${config.fileUploadMaxMb} (per image), BODY_LIMIT_MB=${config.bodyLimitMb} (scene JSON)`);
    const schedule = config.backups.schedule;
    lines.push(schedule && schedule.trim().length > 0
        ? `Backups:       on (${schedule})`
        : "Backups:       off");
    return lines;
};
exports.buildStorageSummary = buildStorageSummary;
/**
 * Wrap content lines in a titled ASCII box for the startup log.
 */
const renderStorageBox = (title, lines) => {
    const width = Math.max(title.length, ...lines.map((l) => l.length)) + 2;
    const top = `+${"-".repeat(width)}+`;
    const pad = (text) => `| ${text.padEnd(width - 1)}|`;
    return [
        top,
        pad(title),
        pad("-".repeat(title.length)),
        ...lines.map(pad),
        top,
    ].join("\n");
};
/**
 * Run the doctor: probe S3 when enabled, render the box, print it once.
 * Never throws — a probe failure becomes a WARNING line, not a crash.
 */
const runStorageDoctor = async (deps) => {
    const logger = deps.logger ?? console;
    const s3Enabled = deps.isS3Enabled();
    let probe = null;
    if (s3Enabled) {
        try {
            probe = await deps.probeBucket();
        }
        catch (error) {
            probe = {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    const lines = (0, exports.buildStorageSummary)({ config: deps.config, s3Enabled, probe });
    logger.log(`\n${renderStorageBox("STORAGE", lines)}\n`);
};
exports.runStorageDoctor = runStorageDoctor;
