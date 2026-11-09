"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduledBackups = exports.createSqliteBackup = exports.cronMatches = exports.parseCronSchedule = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const Database = require("better-sqlite3");
const parseDatabasePath = (databaseUrl) => {
    if (!databaseUrl || !databaseUrl.startsWith("file:"))
        return null;
    const raw = databaseUrl.replace(/^file:/, "");
    return path_1.default.resolve(raw);
};
const timestampForFilename = (date) => date.toISOString().replace(/[:.]/g, "-");
const parseCronPart = (raw, min, max) => {
    const values = new Set();
    const addRange = (start, end, step = 1) => {
        if (step <= 0)
            throw new Error("Cron step must be positive");
        for (let value = start; value <= end; value += step)
            values.add(value);
    };
    for (const token of raw.split(",")) {
        const trimmed = token.trim();
        if (!trimmed)
            continue;
        const [rangeToken, stepToken] = trimmed.split("/");
        const step = stepToken ? Number(stepToken) : 1;
        if (!Number.isInteger(step) || step <= 0)
            throw new Error(`Invalid cron step: ${trimmed}`);
        if (rangeToken === "*") {
            addRange(min, max, step);
            continue;
        }
        if (rangeToken.includes("-")) {
            const [startRaw, endRaw] = rangeToken.split("-");
            const start = Number(startRaw);
            const end = Number(endRaw);
            if (!Number.isInteger(start) ||
                !Number.isInteger(end) ||
                start < min ||
                end > max ||
                start > end) {
                throw new Error(`Invalid cron range: ${trimmed}`);
            }
            addRange(start, end, step);
            continue;
        }
        const value = Number(rangeToken);
        if (!Number.isInteger(value) || value < min || value > max) {
            throw new Error(`Invalid cron value: ${trimmed}`);
        }
        values.add(value);
    }
    if (values.size === 0)
        throw new Error(`Invalid empty cron field: ${raw}`);
    return values;
};
const parseCronSchedule = (raw) => {
    const parts = raw.trim().split(/\s+/);
    const normalized = parts.length === 5 ? ["0", ...parts] : parts;
    if (normalized.length !== 6) {
        throw new Error("BACKUP_SCHEDULE must be a 5- or 6-field cron expression");
    }
    return {
        seconds: parseCronPart(normalized[0], 0, 59),
        minutes: parseCronPart(normalized[1], 0, 59),
        hours: parseCronPart(normalized[2], 0, 23),
        daysOfMonth: parseCronPart(normalized[3], 1, 31),
        months: parseCronPart(normalized[4], 1, 12),
        daysOfWeek: parseCronPart(normalized[5], 0, 7),
        daysOfMonthRestricted: normalized[3] !== "*",
        daysOfWeekRestricted: normalized[5] !== "*",
    };
};
exports.parseCronSchedule = parseCronSchedule;
const cronMatches = (cron, date) => {
    const day = date.getDay();
    const domMatch = cron.daysOfMonth.has(date.getDate());
    const dowMatch = cron.daysOfWeek.has(day) || (day === 0 && cron.daysOfWeek.has(7));
    // Standard cron: when both day-of-month and day-of-week are restricted the
    // job runs if EITHER matches; otherwise the constrained field applies.
    const dayMatch = cron.daysOfMonthRestricted && cron.daysOfWeekRestricted
        ? domMatch || dowMatch
        : domMatch && dowMatch;
    return (cron.seconds.has(date.getSeconds()) &&
        cron.minutes.has(date.getMinutes()) &&
        cron.hours.has(date.getHours()) &&
        cron.months.has(date.getMonth() + 1) &&
        dayMatch);
};
exports.cronMatches = cronMatches;
const pruneOldBackups = async (backupDir, retentionDays) => {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0)
        return;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const entries = await fs_1.default.promises.readdir(backupDir, { withFileTypes: true });
    await Promise.allSettled(entries
        .filter((entry) => entry.isFile() && /^excalidash-sqlite-.*\.db$/.test(entry.name))
        .map(async (entry) => {
        const filePath = path_1.default.join(backupDir, entry.name);
        const stat = await fs_1.default.promises.stat(filePath);
        if (stat.mtimeMs < cutoff)
            await fs_1.default.promises.unlink(filePath);
    }));
};
const createSqliteBackup = async ({ prisma, databaseUrl, backupDir, retentionDays, }) => {
    const databasePath = parseDatabasePath(databaseUrl);
    if (!databasePath) {
        console.warn("[backup] Scheduled backups currently support SQLite file: DATABASE_URL values only.");
        return null;
    }
    // Backups contain a full copy of the database (password hashes, API-key
    // hashes, OIDC secrets), so restrict the directory and files to the owner.
    await fs_1.default.promises.mkdir(backupDir, { recursive: true, mode: 0o700 });
    await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(PASSIVE)");
    const target = path_1.default.join(backupDir, `excalidash-sqlite-${timestampForFilename(new Date())}.db`);
    const source = new Database(databasePath, {
        readonly: true,
        fileMustExist: true,
    });
    try {
        await source.backup(target);
    }
    finally {
        source.close();
    }
    await fs_1.default.promises.chmod(target, 0o600);
    await pruneOldBackups(backupDir, retentionDays);
    console.log(`[backup] Wrote SQLite backup: ${target}`);
    return target;
};
exports.createSqliteBackup = createSqliteBackup;
const startScheduledBackups = (options) => {
    if (!options.schedule)
        return null;
    let cron;
    try {
        cron = (0, exports.parseCronSchedule)(options.schedule);
    }
    catch (error) {
        console.error("[backup] Invalid BACKUP_SCHEDULE; scheduled backups disabled:", error);
        return null;
    }
    let lastRunKey = null;
    let running = false;
    const tick = async () => {
        const now = new Date();
        if (!(0, exports.cronMatches)(cron, now))
            return;
        const runKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`;
        if (runKey === lastRunKey || running)
            return;
        lastRunKey = runKey;
        running = true;
        try {
            await (0, exports.createSqliteBackup)(options);
        }
        catch (error) {
            console.error("[backup] Scheduled backup failed:", error);
        }
        finally {
            running = false;
        }
    };
    const interval = setInterval(tick, 1000);
    interval.unref();
    console.log(`[backup] Scheduled SQLite backups enabled (${options.schedule}) -> ${options.backupDir}`);
    return () => clearInterval(interval);
};
exports.startScheduledBackups = startScheduledBackups;
