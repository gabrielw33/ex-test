"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLegacySqliteImportRoutes = void 0;
const uuid_1 = require("uuid");
const shared_1 = require("./shared");
const fileProcessing_1 = require("../../fileProcessing");
const registerLegacySqliteImportRoutes = (deps) => {
    const { app, prisma, requireAuth, asyncHandler, upload, uploadDir, backendRoot, sanitizeText, validateImportedDrawing, ensureTrashCollection, invalidateDrawingsCache, removeFileIfExists, verifyDatabaseIntegrityAsync, MAX_IMPORT_COLLECTIONS, MAX_IMPORT_DRAWINGS, } = deps;
    app.post("/import/sqlite/legacy/verify", requireAuth, upload.single("db"), asyncHandler(async (req, res) => {
        if (!req.user)
            return res.status(401).json({ error: "Unauthorized" });
        if (!req.file)
            return res.status(400).json({ error: "No file uploaded" });
        let stagedPath;
        try {
            stagedPath = await (0, shared_1.resolveSafeUploadedFilePath)({ filename: req.file.filename }, uploadDir);
        }
        catch (error) {
            if (error instanceof shared_1.ImportValidationError) {
                return res
                    .status(error.status)
                    .json({ error: "Invalid upload", message: error.message });
            }
            throw error;
        }
        try {
            const isValid = await verifyDatabaseIntegrityAsync(stagedPath);
            if (!isValid)
                return res.status(400).json({ error: "Invalid database format" });
            let db = null;
            try {
                db = (0, shared_1.openReadonlySqliteDb)(stagedPath);
                const tables = db
                    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
                    .all()
                    .map((row) => String(row.name));
                const drawingTable = (0, shared_1.findSqliteTable)(tables, ["Drawing", "drawings"]);
                const collectionTable = (0, shared_1.findSqliteTable)(tables, [
                    "Collection",
                    "collections",
                ]);
                if (!drawingTable) {
                    return res.status(400).json({
                        error: "Invalid legacy DB",
                        message: "Missing Drawing table",
                    });
                }
                const drawingsCount = Number(db.prepare(`SELECT COUNT(1) as c FROM "${drawingTable}"`).get()
                    ?.c ?? 0);
                const collectionsCount = collectionTable
                    ? Number(db
                        .prepare(`SELECT COUNT(1) as c FROM "${collectionTable}"`)
                        .get()?.c ?? 0)
                    : 0;
                if (drawingsCount > MAX_IMPORT_DRAWINGS) {
                    return res.status(400).json({
                        error: "Invalid legacy DB",
                        message: `Too many drawings (max ${MAX_IMPORT_DRAWINGS})`,
                    });
                }
                if (collectionsCount > MAX_IMPORT_COLLECTIONS) {
                    return res.status(400).json({
                        error: "Invalid legacy DB",
                        message: `Too many collections (max ${MAX_IMPORT_COLLECTIONS})`,
                    });
                }
                const duplicateDrawingIdRow = db
                    .prepare(`SELECT id FROM "${drawingTable}" WHERE id IS NOT NULL GROUP BY id HAVING COUNT(1) > 1 LIMIT 1`)
                    .get();
                if (duplicateDrawingIdRow?.id) {
                    return res.status(400).json({
                        error: "Invalid legacy DB",
                        message: `Duplicate drawing id in legacy DB: ${String(duplicateDrawingIdRow.id)}`,
                    });
                }
                if (collectionTable) {
                    const duplicateCollectionIdRow = db
                        .prepare(`SELECT id FROM "${collectionTable}" WHERE id IS NOT NULL GROUP BY id HAVING COUNT(1) > 1 LIMIT 1`)
                        .get();
                    if (duplicateCollectionIdRow?.id) {
                        return res.status(400).json({
                            error: "Invalid legacy DB",
                            message: `Duplicate collection id in legacy DB: ${String(duplicateCollectionIdRow.id)}`,
                        });
                    }
                }
                let latestMigration = null;
                const migrationsTable = (0, shared_1.findSqliteTable)(tables, [
                    "_prisma_migrations",
                ]);
                if (migrationsTable) {
                    try {
                        const row = db
                            .prepare(`SELECT migration_name as name, finished_at as finishedAt FROM "${migrationsTable}" ORDER BY finished_at DESC LIMIT 1`)
                            .get();
                        if (row?.name)
                            latestMigration = String(row.name);
                    }
                    catch {
                        latestMigration = null;
                    }
                }
                return res.json({
                    valid: true,
                    drawings: drawingsCount,
                    collections: collectionsCount,
                    latestMigration,
                    currentLatestMigration: await (0, shared_1.getCurrentLatestPrismaMigrationName)(backendRoot),
                });
            }
            catch {
                return res.status(500).json({
                    error: "Legacy DB support unavailable",
                    message: "Failed to open the SQLite database for inspection. If you're on Node < 22, you may need to rebuild native dependencies (e.g. `cd backend && npm rebuild better-sqlite3`).",
                });
            }
            finally {
                try {
                    db?.close?.();
                }
                catch { }
            }
        }
        finally {
            await removeFileIfExists(stagedPath);
        }
    }));
    app.post("/import/sqlite/legacy", requireAuth, upload.single("db"), asyncHandler(async (req, res) => {
        if (!req.user)
            return res.status(401).json({ error: "Unauthorized" });
        if (!req.file)
            return res.status(400).json({ error: "No file uploaded" });
        let stagedPath;
        try {
            stagedPath = await (0, shared_1.resolveSafeUploadedFilePath)({ filename: req.file.filename }, uploadDir);
        }
        catch (error) {
            if (error instanceof shared_1.ImportValidationError) {
                return res
                    .status(error.status)
                    .json({ error: "Invalid upload", message: error.message });
            }
            throw error;
        }
        try {
            const isValid = await verifyDatabaseIntegrityAsync(stagedPath);
            if (!isValid)
                return res.status(400).json({ error: "Invalid database format" });
            let legacyDb = null;
            try {
                legacyDb = (0, shared_1.openReadonlySqliteDb)(stagedPath);
                const tables = legacyDb
                    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
                    .all()
                    .map((row) => String(row.name));
                const drawingTable = (0, shared_1.findSqliteTable)(tables, ["Drawing", "drawings"]);
                const collectionTable = (0, shared_1.findSqliteTable)(tables, [
                    "Collection",
                    "collections",
                ]);
                if (!drawingTable) {
                    return res.status(400).json({
                        error: "Invalid legacy DB",
                        message: "Missing Drawing table",
                    });
                }
                const importedCollections = collectionTable
                    ? legacyDb.prepare(`SELECT * FROM "${collectionTable}"`).all()
                    : [];
                const importedDrawings = legacyDb
                    .prepare(`SELECT * FROM "${drawingTable}"`)
                    .all();
                if (importedCollections.length > MAX_IMPORT_COLLECTIONS) {
                    return res.status(400).json({
                        error: "Invalid legacy DB",
                        message: `Too many collections (max ${MAX_IMPORT_COLLECTIONS})`,
                    });
                }
                if (importedDrawings.length > MAX_IMPORT_DRAWINGS) {
                    return res.status(400).json({
                        error: "Invalid legacy DB",
                        message: `Too many drawings (max ${MAX_IMPORT_DRAWINGS})`,
                    });
                }
                const importedCollectionIds = importedCollections
                    .map((c) => (0, shared_1.normalizeNonEmptyId)(c?.id))
                    .filter((id) => id !== null);
                const duplicateCollectionId = (0, shared_1.findFirstDuplicate)(importedCollectionIds);
                if (duplicateCollectionId) {
                    return res.status(400).json({
                        error: "Invalid legacy DB",
                        message: `Duplicate collection id in legacy DB: ${duplicateCollectionId}`,
                    });
                }
                const importedDrawingIds = importedDrawings
                    .map((d) => (0, shared_1.normalizeNonEmptyId)(d?.id))
                    .filter((id) => id !== null);
                const duplicateDrawingId = (0, shared_1.findFirstDuplicate)(importedDrawingIds);
                if (duplicateDrawingId) {
                    return res.status(400).json({
                        error: "Invalid legacy DB",
                        message: `Duplicate drawing id in legacy DB: ${duplicateDrawingId}`,
                    });
                }
                const preparedDrawings = [];
                for (const d of importedDrawings) {
                    const importPayload = {
                        name: typeof d.name === "string" ? d.name : "Untitled Drawing",
                        elements: (0, shared_1.parseOptionalJson)(d.elements, undefined),
                        appState: (0, shared_1.parseOptionalJson)(d.appState, {}),
                        files: (0, shared_1.parseOptionalJson)(d.files, {}),
                        preview: typeof d.preview === "string" ? d.preview : null,
                        collectionId: null,
                    };
                    (0, shared_1.assertImportedScene)(importPayload);
                    if (!validateImportedDrawing(importPayload)) {
                        return res.status(400).json({
                            error: "Invalid imported drawing",
                            message: "Legacy database contains invalid drawing data",
                        });
                    }
                    preparedDrawings.push({
                        importedId: typeof d.id === "string" ? d.id : null,
                        name: sanitizeText(importPayload.name, 255) || "Untitled Drawing",
                        sanitized: (0, shared_1.sanitizeDrawingData)(importPayload),
                        collectionIdRaw: d.collectionId,
                        collectionNameRaw: d.collectionName,
                        versionRaw: d.version,
                    });
                }
                const knownFileIdsBeforeImport = new Map();
                const finalDrawingIdMap = new Map();
                for (let i = 0; i < preparedDrawings.length; i++) {
                    const d = preparedDrawings[i];
                    let finalId;
                    if (!d.importedId) {
                        finalId = (0, uuid_1.v4)();
                        d.importedId = finalId;
                    }
                    else {
                        const existing = await prisma.drawing.findUnique({
                            where: { id: d.importedId },
                            select: { userId: true },
                        });
                        finalId =
                            existing && existing.userId !== req.user.id
                                ? (0, uuid_1.v4)()
                                : d.importedId;
                    }
                    finalDrawingIdMap.set(i, finalId);
                    const knownFiles = await prisma.drawingFile.findMany({
                        where: { drawingId: finalId },
                        select: { fileId: true },
                    });
                    knownFileIdsBeforeImport.set(i, new Set(knownFiles.map((file) => file.fileId)));
                }
                const S3_UPLOAD_CONCURRENCY = 8;
                const processedFilesMap = new Map();
                for (let start = 0; start < preparedDrawings.length; start += S3_UPLOAD_CONCURRENCY) {
                    const batch = preparedDrawings
                        .slice(start, start + S3_UPLOAD_CONCURRENCY)
                        .map((d, offset) => {
                        const i = start + offset;
                        const files = d.sanitized.files || {};
                        const finalId = finalDrawingIdMap.get(i);
                        return (0, fileProcessing_1.internDrawingFiles)(files, req.user.id, finalId, prisma).then((processed) => ({ i, processed }));
                    });
                    const results = await Promise.all(batch);
                    for (const { i, processed } of results) {
                        processedFilesMap.set(i, processed);
                    }
                }
                const result = await prisma.$transaction(async (tx) => {
                    const trashCollectionId = (0, shared_1.getUserTrashCollectionId)(req.user.id);
                    const hasTrash = importedDrawings.some((d) => String(d.collectionId || "") === "trash");
                    if (hasTrash)
                        await ensureTrashCollection(tx, req.user.id);
                    const collectionIdMap = new Map();
                    let collectionsCreated = 0;
                    let collectionsUpdated = 0;
                    let collectionIdConflicts = 0;
                    let drawingsCreated = 0;
                    let drawingsUpdated = 0;
                    let drawingIdConflicts = 0;
                    for (const c of importedCollections) {
                        const importedId = typeof c.id === "string" ? c.id : null;
                        const name = typeof c.name === "string" ? c.name : "Collection";
                        if (importedId === "trash" || name === "Trash") {
                            collectionIdMap.set(importedId || "trash", trashCollectionId);
                            continue;
                        }
                        if (!importedId) {
                            const newId = (0, uuid_1.v4)();
                            await tx.collection.create({
                                data: {
                                    id: newId,
                                    name: sanitizeText(name, 100) || "Collection",
                                    userId: req.user.id,
                                },
                            });
                            collectionIdMap.set(`__name:${name}`, newId);
                            collectionsCreated += 1;
                            continue;
                        }
                        const existing = await tx.collection.findUnique({
                            where: { id: importedId },
                        });
                        if (!existing) {
                            await tx.collection.create({
                                data: {
                                    id: importedId,
                                    name: sanitizeText(name, 100) || "Collection",
                                    userId: req.user.id,
                                },
                            });
                            collectionIdMap.set(importedId, importedId);
                            collectionsCreated += 1;
                            continue;
                        }
                        if (existing.userId === req.user.id) {
                            await tx.collection.update({
                                where: { id: importedId },
                                data: { name: sanitizeText(name, 100) || "Collection" },
                            });
                            collectionIdMap.set(importedId, importedId);
                            collectionsUpdated += 1;
                            continue;
                        }
                        const newId = (0, uuid_1.v4)();
                        await tx.collection.create({
                            data: {
                                id: newId,
                                name: sanitizeText(name, 100) || "Collection",
                                userId: req.user.id,
                            },
                        });
                        collectionIdMap.set(importedId, newId);
                        collectionsCreated += 1;
                        collectionIdConflicts += 1;
                    }
                    const resolveImportedCollectionId = (rawCollectionId, rawCollectionName) => {
                        const id = typeof rawCollectionId === "string" ? rawCollectionId : null;
                        const name = typeof rawCollectionName === "string"
                            ? rawCollectionName
                            : null;
                        if (id === "trash" || name === "Trash")
                            return trashCollectionId;
                        if (id && collectionIdMap.has(id))
                            return collectionIdMap.get(id);
                        if (name && collectionIdMap.has(`__name:${name}`))
                            return collectionIdMap.get(`__name:${name}`);
                        return null;
                    };
                    for (let i = 0; i < preparedDrawings.length; i++) {
                        const d = preparedDrawings[i];
                        const processedFiles = processedFilesMap.get(i) ?? {};
                        const resolvedCollectionId = resolveImportedCollectionId(d.collectionIdRaw, d.collectionNameRaw);
                        const existing = d.importedId
                            ? await tx.drawing.findUnique({ where: { id: d.importedId } })
                            : null;
                        const finalId = finalDrawingIdMap.get(i) ?? d.importedId ?? (0, uuid_1.v4)();
                        await (0, shared_1.assertImportedFilesAvailable)(tx, finalId, (0, shared_1.getRequiredImportedFileIds)(d.sanitized.files, processedFiles, finalId, knownFileIdsBeforeImport.get(i)));
                        if (!existing) {
                            await tx.drawing.create({
                                data: {
                                    id: finalId,
                                    name: d.name,
                                    elements: JSON.stringify(d.sanitized.elements),
                                    appState: JSON.stringify(d.sanitized.appState),
                                    files: JSON.stringify(processedFiles),
                                    preview: d.sanitized.preview ?? null,
                                    version: Number.isFinite(Number(d.versionRaw))
                                        ? Number(d.versionRaw)
                                        : 1,
                                    userId: req.user.id,
                                    collectionId: resolvedCollectionId ?? null,
                                },
                            });
                            drawingsCreated += 1;
                            continue;
                        }
                        if (existing.userId === req.user.id) {
                            await (0, shared_1.replaceImportedDrawing)(tx, existing, {
                                name: d.name,
                                elements: JSON.stringify(d.sanitized.elements),
                                appState: JSON.stringify(d.sanitized.appState),
                                files: JSON.stringify(processedFiles),
                                preview: d.sanitized.preview ?? null,
                                collectionId: resolvedCollectionId ?? null,
                            });
                            drawingsUpdated += 1;
                            continue;
                        }
                        const createId = finalId === d.importedId ? (0, uuid_1.v4)() : finalId;
                        if (createId !== finalId) {
                            console.warn(`[import/legacy] race conflict on drawing ${d.importedId}; ` +
                                `creating under ${createId}; S3 objects keyed under ` +
                                `${d.importedId} are now orphans`);
                        }
                        await tx.drawing.create({
                            data: {
                                id: createId,
                                name: d.name,
                                elements: JSON.stringify(d.sanitized.elements),
                                appState: JSON.stringify(d.sanitized.appState),
                                files: JSON.stringify(processedFiles),
                                preview: d.sanitized.preview ?? null,
                                version: Number.isFinite(Number(d.versionRaw))
                                    ? Number(d.versionRaw)
                                    : 1,
                                userId: req.user.id,
                                collectionId: resolvedCollectionId ?? null,
                            },
                        });
                        drawingsCreated += 1;
                        drawingIdConflicts += 1;
                    }
                    return {
                        collections: {
                            created: collectionsCreated,
                            updated: collectionsUpdated,
                            idConflicts: collectionIdConflicts,
                        },
                        drawings: {
                            created: drawingsCreated,
                            updated: drawingsUpdated,
                            idConflicts: drawingIdConflicts,
                        },
                    };
                });
                invalidateDrawingsCache();
                return res.json({ success: true, ...result });
            }
            catch (error) {
                if (error instanceof shared_1.ImportValidationError) {
                    return res.status(error.status).json({
                        error: "Invalid imported drawing",
                        message: error.message,
                    });
                }
                return res.status(500).json({
                    error: "Legacy DB support unavailable",
                    message: "Failed to open the SQLite database for import. If you're on Node < 22, you may need to rebuild native dependencies (e.g. `cd backend && npm rebuild better-sqlite3`).",
                });
            }
            finally {
                try {
                    legacyDb?.close?.();
                }
                catch { }
            }
        }
        finally {
            await removeFileIfExists(stagedPath);
        }
    }));
};
exports.registerLegacySqliteImportRoutes = registerLegacySqliteImportRoutes;
