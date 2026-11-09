"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeDrawingData = exports.getCurrentLatestPrismaMigrationName = exports.openReadonlySqliteDb = exports.resolveSafeUploadedFilePath = exports.replaceImportedDrawing = exports.assertImportedFilesAvailable = exports.getRequiredImportedFileIds = exports.assertImportedScene = exports.parseOptionalJson = exports.findSqliteTable = exports.toPublicTrashCollectionId = exports.isTrashCollectionId = exports.getUserTrashCollectionId = exports.normalizeNonEmptyId = exports.findFirstDuplicate = exports.makeUniqueName = exports.sanitizePathSegment = exports.getSafeZipEntry = exports.assertSafeZipArchive = exports.assertSafeArchivePath = exports.excalidashManifestSchemaV1 = exports.ImportValidationError = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const zod_1 = require("zod");
const security_1 = require("../../security");
Object.defineProperty(exports, "sanitizeDrawingData", { enumerable: true, get: function () { return security_1.sanitizeDrawingData; } });
const snapshotCodec_1 = require("../../snapshots/snapshotCodec");
class ImportValidationError extends Error {
    status;
    constructor(message, status = 400) {
        super(message);
        this.name = "ImportValidationError";
        this.status = status;
    }
}
exports.ImportValidationError = ImportValidationError;
exports.excalidashManifestSchemaV1 = zod_1.z.object({
    format: zod_1.z.literal("excalidash"),
    formatVersion: zod_1.z.literal(1),
    exportedAt: zod_1.z.string().min(1),
    excalidashBackendVersion: zod_1.z.string().optional(),
    userId: zod_1.z.string().optional(),
    unorganizedFolder: zod_1.z.string().min(1),
    collections: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string().min(1),
        name: zod_1.z.string(),
        folder: zod_1.z.string().min(1),
        createdAt: zod_1.z.string().optional(),
        updatedAt: zod_1.z.string().optional(),
    })),
    drawings: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string().min(1),
        name: zod_1.z.string(),
        filePath: zod_1.z.string().min(1),
        collectionId: zod_1.z.string().nullable(),
        version: zod_1.z.number().int().optional(),
        createdAt: zod_1.z.string().optional(),
        updatedAt: zod_1.z.string().optional(),
    })),
});
const getZipEntries = (zip) => Object.values(zip.files).filter((entry) => !entry.dir);
const normalizeArchivePath = (filePath) => path_1.default.posix.normalize(filePath.replace(/\\/g, "/"));
const assertSafeArchivePath = (filePath) => {
    const normalized = normalizeArchivePath(filePath);
    if (normalized.length === 0 ||
        path_1.default.posix.isAbsolute(normalized) ||
        normalized === ".." ||
        normalized.startsWith("../") ||
        normalized.includes("\0")) {
        throw new ImportValidationError(`Unsafe archive path: ${filePath}`);
    }
};
exports.assertSafeArchivePath = assertSafeArchivePath;
const assertSafeZipArchive = (zip, maxEntries) => {
    const entries = getZipEntries(zip);
    if (entries.length > maxEntries) {
        throw new ImportValidationError("Archive contains too many files");
    }
    for (const entry of entries) {
        (0, exports.assertSafeArchivePath)(entry.name);
    }
};
exports.assertSafeZipArchive = assertSafeZipArchive;
const getSafeZipEntry = (zip, filePath) => {
    const normalizedPath = normalizeArchivePath(filePath);
    (0, exports.assertSafeArchivePath)(normalizedPath);
    return zip.file(normalizedPath);
};
exports.getSafeZipEntry = getSafeZipEntry;
const sanitizePathSegment = (input, fallback) => {
    const value = typeof input === "string" ? input.trim() : "";
    const cleaned = value
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
        .replace(/\s+/g, " ")
        .slice(0, 120)
        .trim();
    const withoutLeadingDots = cleaned.replace(/^\.+/, "").trim();
    if (withoutLeadingDots.length === 0)
        return fallback;
    if (withoutLeadingDots === "." || withoutLeadingDots === "..")
        return fallback;
    return withoutLeadingDots;
};
exports.sanitizePathSegment = sanitizePathSegment;
const makeUniqueName = (base, used) => {
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) {
        candidate = `${base}__${n}`;
        n += 1;
    }
    used.add(candidate);
    return candidate;
};
exports.makeUniqueName = makeUniqueName;
const findFirstDuplicate = (values) => {
    const seen = new Set();
    for (const value of values) {
        if (seen.has(value))
            return value;
        seen.add(value);
    }
    return null;
};
exports.findFirstDuplicate = findFirstDuplicate;
const normalizeNonEmptyId = (value) => {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};
exports.normalizeNonEmptyId = normalizeNonEmptyId;
const getUserTrashCollectionId = (userId) => `trash:${userId}`;
exports.getUserTrashCollectionId = getUserTrashCollectionId;
const isTrashCollectionId = (collectionId, userId) => Boolean(collectionId) &&
    (collectionId === "trash" ||
        collectionId === (0, exports.getUserTrashCollectionId)(userId));
exports.isTrashCollectionId = isTrashCollectionId;
const toPublicTrashCollectionId = (collectionId, userId) => (0, exports.isTrashCollectionId)(collectionId, userId) ? "trash" : (collectionId ?? null);
exports.toPublicTrashCollectionId = toPublicTrashCollectionId;
const findSqliteTable = (tables, candidates) => {
    const byLower = new Map(tables.map((t) => [t.toLowerCase(), t]));
    for (const candidate of candidates) {
        const found = byLower.get(candidate.toLowerCase());
        if (found)
            return found;
    }
    return null;
};
exports.findSqliteTable = findSqliteTable;
const parseOptionalJson = (raw, fallback) => {
    if (typeof raw === "string") {
        try {
            return JSON.parse(raw);
        }
        catch {
            throw new ImportValidationError("Legacy drawing contains invalid JSON");
        }
    }
    if (typeof raw === "object" && raw !== null) {
        return raw;
    }
    return fallback;
};
exports.parseOptionalJson = parseOptionalJson;
// Validate source fields before defaults or sanitization can disguise a
// corrupt drawing as an empty scene and overwrite a same-ID live drawing.
const assertImportedScene = (scene) => {
    const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
    if (!Array.isArray(scene.elements) ||
        !isRecord(scene.appState) ||
        !isRecord(scene.files)) {
        throw new ImportValidationError("Drawing contains invalid scene fields");
    }
};
exports.assertImportedScene = assertImportedScene;
const getRequiredImportedFileIds = (sourceFiles, processedFiles, drawingId, knownBefore) => Object.entries(processedFiles)
    .filter(([fileId, file]) => {
    const processedUrl = file?.dataURL;
    const sourceUrl = sourceFiles[fileId]
        ?.dataURL;
    return (knownBefore.has(fileId) ||
        processedUrl === `/api/files/${drawingId}/${fileId}` ||
        (typeof sourceUrl === "string" &&
            sourceUrl.startsWith("data:") &&
            typeof processedUrl === "string" &&
            processedUrl !== sourceUrl));
})
    .map(([fileId]) => fileId);
exports.getRequiredImportedFileIds = getRequiredImportedFileIds;
const assertImportedFilesAvailable = async (tx, drawingId, requiredFileIds) => {
    if (requiredFileIds.length === 0)
        return;
    const stored = await tx.drawingFile.count({
        where: { drawingId, fileId: { in: requiredFileIds } },
    });
    if (stored !== requiredFileIds.length) {
        throw new ImportValidationError("Drawing image bytes changed during import; please try again", 409);
    }
};
exports.assertImportedFilesAvailable = assertImportedFilesAvailable;
const replaceImportedDrawing = async (tx, existing, data) => {
    await tx.drawingSnapshot.create({
        data: {
            drawingId: existing.id,
            version: existing.version,
            elements: (0, snapshotCodec_1.encodeSnapshotField)(existing.elements),
            appState: (0, snapshotCodec_1.encodeSnapshotField)(existing.appState),
            files: (0, snapshotCodec_1.encodeSnapshotField)(existing.files),
        },
    });
    const updated = await tx.drawing.updateMany({
        where: {
            id: existing.id,
            userId: existing.userId,
            version: existing.version,
        },
        data: { ...data, version: { increment: 1 } },
    });
    if (updated.count !== 1) {
        throw new ImportValidationError("Drawing changed during import; please try again", 409);
    }
};
exports.replaceImportedDrawing = replaceImportedDrawing;
const isPathInsideDirectory = (candidatePath, rootDir) => {
    const relativePath = path_1.default.relative(rootDir, candidatePath);
    return (relativePath === "" ||
        (!relativePath.startsWith("..") && !path_1.default.isAbsolute(relativePath)));
};
const isSafeMulterTempFilename = (value) => /^[a-f0-9]{32}$/.test(value);
const resolveSafeUploadedFilePath = async (fileMeta, uploadRoot) => {
    const absoluteUploadRoot = path_1.default.resolve(uploadRoot);
    let canonicalUploadRoot = absoluteUploadRoot;
    try {
        canonicalUploadRoot = await fs_1.promises.realpath(absoluteUploadRoot);
    }
    catch {
        throw new ImportValidationError("Invalid upload path");
    }
    const filename = typeof fileMeta.filename === "string" ? fileMeta.filename : "";
    if (!isSafeMulterTempFilename(filename)) {
        throw new ImportValidationError("Invalid upload path");
    }
    const joinedPath = path_1.default.resolve(canonicalUploadRoot, filename);
    if (!isPathInsideDirectory(joinedPath, canonicalUploadRoot)) {
        throw new ImportValidationError("Invalid upload path");
    }
    return joinedPath;
};
exports.resolveSafeUploadedFilePath = resolveSafeUploadedFilePath;
const openReadonlySqliteDb = (filePath) => {
    try {
        const { DatabaseSync } = require("node:sqlite");
        return new DatabaseSync(filePath, {
            readOnly: true,
            enableForeignKeyConstraints: false,
        });
    }
    catch {
        const Database = require("better-sqlite3");
        return new Database(filePath, { readonly: true, fileMustExist: true });
    }
};
exports.openReadonlySqliteDb = openReadonlySqliteDb;
const getCurrentLatestPrismaMigrationName = async (backendRoot) => {
    const readMigrationDirs = async (migrationsDir) => {
        const entries = await fs_1.promises.readdir(migrationsDir, {
            withFileTypes: true,
        });
        return entries
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .filter((name) => /^\d{14}_.+/.test(name))
            .sort();
    };
    try {
        const providerMigrationsDir = path_1.default.resolve(backendRoot, "prisma/migrations/sqlite");
        let dirs = [];
        try {
            dirs = await readMigrationDirs(providerMigrationsDir);
        }
        catch {
            dirs = [];
        }
        if (dirs.length === 0) {
            dirs = await readMigrationDirs(path_1.default.resolve(backendRoot, "prisma/migrations"));
        }
        if (dirs.length === 0)
            return null;
        return dirs[dirs.length - 1] || null;
    }
    catch {
        return null;
    }
};
exports.getCurrentLatestPrismaMigrationName = getCurrentLatestPrismaMigrationName;
