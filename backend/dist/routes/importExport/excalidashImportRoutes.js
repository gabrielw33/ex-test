"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerExcalidashImportRoutes = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const jszip_1 = __importDefault(require("jszip"));
const uuid_1 = require("uuid");
const shared_1 = require("./shared");
const fileProcessing_1 = require("../../fileProcessing");
const isSafeMulterTempFilename = (value) => /^[a-f0-9]{32}$/.test(value);
const resolveStagedUploadPath = async (file, uploadRoot) => {
    const absoluteUploadRoot = path_1.default.resolve(uploadRoot);
    let canonicalUploadRoot = absoluteUploadRoot;
    try {
        canonicalUploadRoot = await fs_1.promises.realpath(absoluteUploadRoot);
    }
    catch {
        throw new shared_1.ImportValidationError("Invalid upload path");
    }
    const rawPath = typeof file.path === "string" ? file.path : "";
    const rawFilename = typeof file.filename === "string" ? file.filename : "";
    const basename = path_1.default.basename(rawPath || rawFilename);
    if (!isSafeMulterTempFilename(basename)) {
        throw new shared_1.ImportValidationError("Invalid upload path");
    }
    const candidatePath = path_1.default.resolve(canonicalUploadRoot, basename);
    const rootPrefix = canonicalUploadRoot.endsWith(path_1.default.sep)
        ? canonicalUploadRoot
        : `${canonicalUploadRoot}${path_1.default.sep}`;
    if (!candidatePath.startsWith(rootPrefix)) {
        throw new shared_1.ImportValidationError("Invalid upload path");
    }
    return candidatePath;
};
const registerExcalidashImportRoutes = (deps) => {
    const { app, prisma, requireAuth, asyncHandler, upload, uploadDir, sanitizeText, validateImportedDrawing, ensureTrashCollection, invalidateDrawingsCache, removeFileIfExists, MAX_IMPORT_ARCHIVE_ENTRIES, MAX_IMPORT_COLLECTIONS, MAX_IMPORT_DRAWINGS, MAX_IMPORT_MANIFEST_BYTES, MAX_IMPORT_DRAWING_BYTES, MAX_IMPORT_TOTAL_EXTRACTED_BYTES, } = deps;
    app.post("/import/excalidash/verify", requireAuth, upload.single("archive"), asyncHandler(async (req, res) => {
        if (!req.user)
            return res.status(401).json({ error: "Unauthorized" });
        if (!req.file)
            return res.status(400).json({ error: "No file uploaded" });
        let stagedPath;
        try {
            stagedPath = await resolveStagedUploadPath({ filename: req.file.filename }, uploadDir);
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
            const buffer = await fs_1.promises.readFile(stagedPath);
            const zip = await jszip_1.default.loadAsync(buffer);
            try {
                (0, shared_1.assertSafeZipArchive)(zip, MAX_IMPORT_ARCHIVE_ENTRIES);
            }
            catch (error) {
                if (error instanceof shared_1.ImportValidationError) {
                    return res
                        .status(error.status)
                        .json({ error: "Invalid backup", message: error.message });
                }
                throw error;
            }
            const manifestFile = (0, shared_1.getSafeZipEntry)(zip, "excalidash.manifest.json");
            if (!manifestFile) {
                return res.status(400).json({
                    error: "Invalid backup",
                    message: "Missing excalidash.manifest.json",
                });
            }
            const rawManifest = await manifestFile.async("string");
            if (Buffer.byteLength(rawManifest, "utf8") > MAX_IMPORT_MANIFEST_BYTES) {
                return res.status(400).json({
                    error: "Invalid backup manifest",
                    message: "excalidash.manifest.json is too large",
                });
            }
            let manifestJson;
            try {
                manifestJson = JSON.parse(rawManifest);
            }
            catch {
                return res.status(400).json({
                    error: "Invalid backup manifest",
                    message: "excalidash.manifest.json is not valid JSON",
                });
            }
            const parsed = shared_1.excalidashManifestSchemaV1.safeParse(manifestJson);
            if (!parsed.success) {
                return res.status(400).json({
                    error: "Invalid backup manifest",
                    message: "Malformed excalidash.manifest.json",
                });
            }
            const manifest = parsed.data;
            if (manifest.collections.length > MAX_IMPORT_COLLECTIONS) {
                return res.status(400).json({
                    error: "Invalid backup manifest",
                    message: `Too many collections (max ${MAX_IMPORT_COLLECTIONS})`,
                });
            }
            if (manifest.drawings.length > MAX_IMPORT_DRAWINGS) {
                return res.status(400).json({
                    error: "Invalid backup manifest",
                    message: `Too many drawings (max ${MAX_IMPORT_DRAWINGS})`,
                });
            }
            const duplicateCollectionId = (0, shared_1.findFirstDuplicate)(manifest.collections.map((c) => c.id));
            if (duplicateCollectionId) {
                return res.status(400).json({
                    error: "Invalid backup manifest",
                    message: `Duplicate collection id in manifest: ${duplicateCollectionId}`,
                });
            }
            const duplicateDrawingId = (0, shared_1.findFirstDuplicate)(manifest.drawings.map((d) => d.id));
            if (duplicateDrawingId) {
                return res.status(400).json({
                    error: "Invalid backup manifest",
                    message: `Duplicate drawing id in manifest: ${duplicateDrawingId}`,
                });
            }
            const duplicateDrawingPath = (0, shared_1.findFirstDuplicate)(manifest.drawings.map((d) => d.filePath));
            if (duplicateDrawingPath) {
                return res.status(400).json({
                    error: "Invalid backup manifest",
                    message: `Duplicate drawing file path in manifest: ${duplicateDrawingPath}`,
                });
            }
            for (const drawing of manifest.drawings) {
                if (!(0, shared_1.getSafeZipEntry)(zip, drawing.filePath)) {
                    return res.status(400).json({
                        error: "Invalid backup",
                        message: `Missing drawing file: ${drawing.filePath}`,
                    });
                }
            }
            return res.json({
                valid: true,
                formatVersion: manifest.formatVersion,
                exportedAt: manifest.exportedAt,
                excalidashBackendVersion: manifest.excalidashBackendVersion || null,
                collections: manifest.collections.length,
                drawings: manifest.drawings.length,
            });
        }
        finally {
            await removeFileIfExists(stagedPath);
        }
    }));
    app.post("/import/excalidash", requireAuth, upload.single("archive"), asyncHandler(async (req, res) => {
        if (!req.user)
            return res.status(401).json({ error: "Unauthorized" });
        if (!req.file)
            return res.status(400).json({ error: "No file uploaded" });
        let stagedPath;
        try {
            stagedPath = await resolveStagedUploadPath({ filename: req.file.filename }, uploadDir);
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
            const buffer = await fs_1.promises.readFile(stagedPath);
            const zip = await jszip_1.default.loadAsync(buffer);
            try {
                (0, shared_1.assertSafeZipArchive)(zip, MAX_IMPORT_ARCHIVE_ENTRIES);
            }
            catch (error) {
                if (error instanceof shared_1.ImportValidationError) {
                    return res
                        .status(error.status)
                        .json({ error: "Invalid backup", message: error.message });
                }
                throw error;
            }
            const manifestFile = (0, shared_1.getSafeZipEntry)(zip, "excalidash.manifest.json");
            if (!manifestFile) {
                return res.status(400).json({
                    error: "Invalid backup",
                    message: "Missing excalidash.manifest.json",
                });
            }
            const rawManifest = await manifestFile.async("string");
            if (Buffer.byteLength(rawManifest, "utf8") > MAX_IMPORT_MANIFEST_BYTES) {
                return res.status(400).json({
                    error: "Invalid backup manifest",
                    message: "excalidash.manifest.json is too large",
                });
            }
            let manifestJson;
            try {
                manifestJson = JSON.parse(rawManifest);
            }
            catch {
                return res.status(400).json({
                    error: "Invalid backup manifest",
                    message: "excalidash.manifest.json is not valid JSON",
                });
            }
            const parsed = shared_1.excalidashManifestSchemaV1.safeParse(manifestJson);
            if (!parsed.success) {
                return res.status(400).json({
                    error: "Invalid backup manifest",
                    message: "Malformed excalidash.manifest.json",
                });
            }
            const manifest = parsed.data;
            if (manifest.collections.length > MAX_IMPORT_COLLECTIONS) {
                return res.status(400).json({
                    error: "Invalid backup manifest",
                    message: `Too many collections (max ${MAX_IMPORT_COLLECTIONS})`,
                });
            }
            if (manifest.drawings.length > MAX_IMPORT_DRAWINGS) {
                return res.status(400).json({
                    error: "Invalid backup manifest",
                    message: `Too many drawings (max ${MAX_IMPORT_DRAWINGS})`,
                });
            }
            const duplicateCollectionId = (0, shared_1.findFirstDuplicate)(manifest.collections.map((c) => c.id));
            if (duplicateCollectionId) {
                return res.status(400).json({
                    error: "Invalid backup manifest",
                    message: `Duplicate collection id in manifest: ${duplicateCollectionId}`,
                });
            }
            const duplicateDrawingId = (0, shared_1.findFirstDuplicate)(manifest.drawings.map((d) => d.id));
            if (duplicateDrawingId) {
                return res.status(400).json({
                    error: "Invalid backup manifest",
                    message: `Duplicate drawing id in manifest: ${duplicateDrawingId}`,
                });
            }
            const duplicateDrawingPath = (0, shared_1.findFirstDuplicate)(manifest.drawings.map((d) => d.filePath));
            if (duplicateDrawingPath) {
                return res.status(400).json({
                    error: "Invalid backup manifest",
                    message: `Duplicate drawing file path in manifest: ${duplicateDrawingPath}`,
                });
            }
            const preparedDrawings = [];
            let extractedBytes = Buffer.byteLength(rawManifest, "utf8");
            try {
                for (const d of manifest.drawings) {
                    const entry = (0, shared_1.getSafeZipEntry)(zip, d.filePath);
                    if (!entry)
                        throw new shared_1.ImportValidationError(`Missing drawing file: ${d.filePath}`);
                    const raw = await entry.async("string");
                    const rawSize = Buffer.byteLength(raw, "utf8");
                    if (rawSize > MAX_IMPORT_DRAWING_BYTES) {
                        throw new shared_1.ImportValidationError(`Drawing is too large: ${d.filePath}`);
                    }
                    extractedBytes += rawSize;
                    if (extractedBytes > MAX_IMPORT_TOTAL_EXTRACTED_BYTES) {
                        throw new shared_1.ImportValidationError("Backup contents exceed maximum import size");
                    }
                    let parsedJson;
                    try {
                        parsedJson = JSON.parse(raw);
                    }
                    catch {
                        throw new shared_1.ImportValidationError(`Drawing JSON is invalid: ${d.filePath}`);
                    }
                    const imported = {
                        name: d.name,
                        elements: parsedJson?.elements,
                        appState: parsedJson?.appState === undefined ? {} : parsedJson.appState,
                        files: parsedJson?.files === undefined ? {} : parsedJson.files,
                        preview: null,
                        collectionId: d.collectionId,
                    };
                    (0, shared_1.assertImportedScene)(imported);
                    if (!validateImportedDrawing(imported)) {
                        throw new shared_1.ImportValidationError(`Drawing failed validation: ${d.filePath}`);
                    }
                    preparedDrawings.push({
                        id: d.id,
                        name: sanitizeText(imported.name, 255) || "Untitled Drawing",
                        version: typeof d.version === "number" ? d.version : undefined,
                        collectionId: d.collectionId,
                        sanitized: (0, shared_1.sanitizeDrawingData)(imported),
                    });
                }
            }
            catch (error) {
                if (error instanceof shared_1.ImportValidationError) {
                    return res
                        .status(error.status)
                        .json({ error: "Invalid backup", message: error.message });
                }
                throw error;
            }
            const knownFileIdsBeforeImport = new Map();
            const finalDrawingIdMap = new Map();
            for (let i = 0; i < preparedDrawings.length; i++) {
                const prepared = preparedDrawings[i];
                const existing = await prisma.drawing.findUnique({
                    where: { id: prepared.id },
                    select: { userId: true },
                });
                const finalId = existing && existing.userId !== req.user.id
                    ? (0, uuid_1.v4)()
                    : prepared.id;
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
                    .map((prepared, offset) => {
                    const i = start + offset;
                    const files = prepared.sanitized?.files || {};
                    const finalId = finalDrawingIdMap.get(i);
                    return (0, fileProcessing_1.internDrawingFiles)(files, req.user.id, finalId, prisma).then((processed) => ({ i, processed }));
                });
                const results = await Promise.all(batch);
                for (const { i, processed } of results) {
                    processedFilesMap.set(i, processed);
                }
            }
            try {
                const result = await prisma.$transaction(async (tx) => {
                    const trashCollectionId = (0, shared_1.getUserTrashCollectionId)(req.user.id);
                    const collectionIdMap = new Map();
                    let collectionsCreated = 0;
                    let collectionsUpdated = 0;
                    let collectionIdConflicts = 0;
                    let drawingsCreated = 0;
                    let drawingsUpdated = 0;
                    let drawingIdConflicts = 0;
                    const needsTrash = manifest.collections.some((c) => c.id === "trash") ||
                        preparedDrawings.some((d) => d.collectionId === "trash");
                    if (needsTrash)
                        await ensureTrashCollection(tx, req.user.id);
                    for (const c of manifest.collections) {
                        if (c.id === "trash") {
                            collectionIdMap.set("trash", trashCollectionId);
                            continue;
                        }
                        const existing = await tx.collection.findUnique({
                            where: { id: c.id },
                        });
                        if (!existing) {
                            await tx.collection.create({
                                data: {
                                    id: c.id,
                                    name: sanitizeText(c.name, 100) || "Collection",
                                    userId: req.user.id,
                                },
                            });
                            collectionIdMap.set(c.id, c.id);
                            collectionsCreated += 1;
                            continue;
                        }
                        if (existing.userId === req.user.id) {
                            await tx.collection.update({
                                where: { id: c.id },
                                data: { name: sanitizeText(c.name, 100) || "Collection" },
                            });
                            collectionIdMap.set(c.id, c.id);
                            collectionsUpdated += 1;
                            continue;
                        }
                        const newId = (0, uuid_1.v4)();
                        await tx.collection.create({
                            data: {
                                id: newId,
                                name: sanitizeText(c.name, 100) || "Collection",
                                userId: req.user.id,
                            },
                        });
                        collectionIdMap.set(c.id, newId);
                        collectionsCreated += 1;
                        collectionIdConflicts += 1;
                    }
                    const resolveCollectionId = (collectionId) => {
                        if (!collectionId)
                            return null;
                        if (collectionId === "trash")
                            return trashCollectionId;
                        return collectionIdMap.get(collectionId) || null;
                    };
                    for (let i = 0; i < preparedDrawings.length; i++) {
                        const prepared = preparedDrawings[i];
                        const processedFiles = processedFilesMap.get(i) ?? {};
                        const targetCollectionId = resolveCollectionId(prepared.collectionId);
                        const existing = await tx.drawing.findUnique({
                            where: { id: prepared.id },
                        });
                        const finalId = finalDrawingIdMap.get(i) ?? prepared.id;
                        await (0, shared_1.assertImportedFilesAvailable)(tx, finalId, (0, shared_1.getRequiredImportedFileIds)(prepared.sanitized.files, processedFiles, finalId, knownFileIdsBeforeImport.get(i)));
                        const elementsJson = JSON.stringify(prepared.sanitized.elements);
                        const appStateJson = JSON.stringify(prepared.sanitized.appState);
                        const filesJson = JSON.stringify(processedFiles);
                        const previewValue = prepared.sanitized.preview ?? null;
                        if (!existing) {
                            await tx.drawing.create({
                                data: {
                                    id: finalId,
                                    name: prepared.name,
                                    elements: elementsJson,
                                    appState: appStateJson,
                                    files: filesJson,
                                    preview: previewValue,
                                    version: prepared.version ?? 1,
                                    userId: req.user.id,
                                    collectionId: targetCollectionId,
                                },
                            });
                            drawingsCreated += 1;
                            continue;
                        }
                        if (existing.userId === req.user.id) {
                            await (0, shared_1.replaceImportedDrawing)(tx, existing, {
                                name: prepared.name,
                                elements: elementsJson,
                                appState: appStateJson,
                                files: filesJson,
                                preview: previewValue,
                                collectionId: targetCollectionId,
                            });
                            drawingsUpdated += 1;
                            continue;
                        }
                        const createId = finalId === prepared.id ? (0, uuid_1.v4)() : finalId;
                        if (createId !== finalId) {
                            console.warn(`[import/excalidash] race conflict on drawing ${prepared.id}; ` +
                                `creating under ${createId}; S3 objects keyed under ` +
                                `${prepared.id} are now orphans`);
                        }
                        await tx.drawing.create({
                            data: {
                                id: createId,
                                name: prepared.name,
                                elements: elementsJson,
                                appState: appStateJson,
                                files: filesJson,
                                preview: previewValue,
                                version: prepared.version ?? 1,
                                userId: req.user.id,
                                collectionId: targetCollectionId,
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
                return res.json({
                    success: true,
                    message: "Backup imported successfully",
                    ...result,
                });
            }
            catch (error) {
                if (error instanceof shared_1.ImportValidationError) {
                    return res
                        .status(error.status)
                        .json({ error: "Import failed", message: error.message });
                }
                throw error;
            }
        }
        finally {
            await removeFileIfExists(stagedPath);
        }
    }));
};
exports.registerExcalidashImportRoutes = registerExcalidashImportRoutes;
