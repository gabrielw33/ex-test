"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readCsv = exports.readBoolean = exports.readNumber = exports.readOptionalString = exports.readString = exports.readRaw = void 0;
/**
 * Typed environment loader. Along with the dotenv/DATABASE_URL lines in
 * ../config.ts, this module is the ONLY place that reads process.env. Every
 * read resolves through the registry (getSpec) so unknown names throw.
 */
const registry_1 = require("./registry");
const warnedAliases = new Set();
/**
 * Resolve the raw string value for a registered var, falling back through
 * declared aliases (logging a deprecation warning once per alias).
 */
const readRaw = (name) => {
    const spec = (0, registry_1.getSpec)(name);
    let value = process.env[name];
    if (value === undefined && spec.aliases) {
        for (const alias of spec.aliases) {
            const aliasValue = process.env[alias];
            if (aliasValue !== undefined) {
                if (!warnedAliases.has(alias)) {
                    console.warn(`${alias} is deprecated, use ${name}`);
                    warnedAliases.add(alias);
                }
                value = aliasValue;
                break;
            }
        }
    }
    return value;
};
exports.readRaw = readRaw;
/** Untrimmed optional read with default (matches legacy getOptionalEnv). */
const readString = (name, defaultValue) => (0, exports.readRaw)(name) || defaultValue;
exports.readString = readString;
/** Trimmed optional read, null when unset/blank (matches legacy getOptionalTrimmedEnv). */
const readOptionalString = (name) => {
    const raw = (0, exports.readRaw)(name);
    if (!raw)
        return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
};
exports.readOptionalString = readOptionalString;
/** Positive-number read with default (matches legacy getRequiredEnvNumber). */
const readNumber = (name, defaultValue) => {
    const value = (0, exports.readRaw)(name);
    if (!value)
        return defaultValue;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid value for environment variable ${name}: must be a positive number`);
    }
    return parsed;
};
exports.readNumber = readNumber;
/** Boolean read with default (matches legacy getOptionalBoolean). */
const readBoolean = (name, defaultValue) => {
    const value = (0, exports.readRaw)(name);
    if (!value)
        return defaultValue;
    return value.toLowerCase() === "true" || value === "1";
};
exports.readBoolean = readBoolean;
/** Comma-separated list read, empty array when unset (matches legacy parseCsvEnvList). */
const readCsv = (name) => {
    const raw = (0, exports.readRaw)(name);
    if (!raw)
        return [];
    return raw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
};
exports.readCsv = readCsv;
