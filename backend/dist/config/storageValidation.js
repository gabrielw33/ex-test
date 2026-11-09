"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateS3Configuration = exports.resolveFileUploadMaxMb = void 0;
/**
 * Fail-fast validation for the storage-related environment variables.
 * Kept out of config.ts so that file stays lean; the read helpers here are
 * the same process.env boundary wrappers config.ts uses.
 */
const env_1 = require("./env");
/**
 * Parse and validate FILE_UPLOAD_MAX_MB (the only per-image size cap).
 * Empty/unset falls back to 100; a non-positive or non-numeric value stops
 * startup with an actionable message rather than silently disabling uploads.
 */
const resolveFileUploadMaxMb = () => {
    const raw = (0, env_1.readRaw)("FILE_UPLOAD_MAX_MB");
    if (raw === undefined || raw.trim().length === 0)
        return 100;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid FILE_UPLOAD_MAX_MB: expected a positive number of megabytes, got '${raw}'.`);
    }
    return parsed;
};
exports.resolveFileUploadMaxMb = resolveFileUploadMaxMb;
/**
 * Fail fast when S3 is half-configured: any S3/AWS-adjacent variable set
 * without S3_BUCKET means storage silently falls back to database bytes,
 * which is almost never what the operator intended. Better to stop with an
 * actionable message than to appear "up" while writing blobs to the DB.
 */
const validateS3Configuration = () => {
    if ((0, env_1.readOptionalString)("S3_BUCKET"))
        return;
    const keyPrefix = (0, env_1.readRaw)("S3_KEY_PREFIX")?.trim();
    const s3Adjacent = [
        ["S3_ENDPOINT", (0, env_1.readOptionalString)("S3_ENDPOINT")],
        ["S3_PUBLIC_URL", (0, env_1.readOptionalString)("S3_PUBLIC_URL")],
        ["AWS_ACCESS_KEY_ID", (0, env_1.readOptionalString)("AWS_ACCESS_KEY_ID")],
        ["AWS_SECRET_ACCESS_KEY", (0, env_1.readOptionalString)("AWS_SECRET_ACCESS_KEY")],
    ];
    const set = s3Adjacent
        .filter(([, value]) => Boolean(value))
        .map(([name]) => name);
    if (keyPrefix && keyPrefix !== "excalidash") {
        set.push("S3_KEY_PREFIX");
    }
    if (set.length > 0) {
        throw new Error(`S3 is half-configured: ${set.join(", ")} set without S3_BUCKET. ` +
            "Set S3_BUCKET to enable S3 storage, or remove the other S3_*/AWS_* variables to use database storage.");
    }
};
exports.validateS3Configuration = validateS3Configuration;
