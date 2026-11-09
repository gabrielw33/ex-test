"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerExcalidashExportRoute = void 0;
const archiver_1 = __importDefault(require("archiver"));
const shared_1 = require("./shared");
const exportFiles_1 = require("./exportFiles");
const registerExcalidashExportRoute = (deps) => {
    const { app, prisma, requireAuth, asyncHandler, getBackendVersion, parseJsonField, } = deps;
    app.get("/export/excalidash", requireAuth, asyncHandler(async (req, res) => {
        if (!req.user)
            return res.status(401).json({ error: "Unauthorized" });
        const trashCollectionId = (0, shared_1.getUserTrashCollectionId)(req.user.id);
        const extParam = typeof req.query.ext === "string" ? req.query.ext.toLowerCase() : "";
        const zipSuffix = extParam === "zip";
        const date = new Date().toISOString().split("T")[0];
        const filename = zipSuffix
            ? `excalidash-backup-${date}.excalidash.zip`
            : `excalidash-backup-${date}.excalidash`;
        const exportedAt = new Date().toISOString();
        const drawings = await prisma.drawing.findMany({
            where: { userId: req.user.id },
            include: { collection: true },
        });
        const userCollections = await prisma.collection.findMany({
            where: { userId: req.user.id },
        });
        const hasInternalTrashCollection = userCollections.some((collection) => collection.id === trashCollectionId);
        const normalizedUserCollections = userCollections.filter((collection) => !(hasInternalTrashCollection && collection.id === "trash"));
        const hasTrashDrawings = drawings.some((drawing) => (0, shared_1.isTrashCollectionId)(drawing.collectionId, req.user.id));
        const collectionsToExport = [...normalizedUserCollections];
        if (hasTrashDrawings &&
            !collectionsToExport.some((collection) => (0, shared_1.isTrashCollectionId)(collection.id, req.user.id))) {
            const trash = await prisma.collection.findFirst({
                where: {
                    userId: req.user.id,
                    id: { in: [trashCollectionId, "trash"] },
                },
            });
            if (trash)
                collectionsToExport.push(trash);
        }
        const exportSource = `${req.protocol}://${req.get("host")}`;
        const usedFolderNames = new Set();
        const unorganizedFolder = (0, shared_1.makeUniqueName)("Unorganized", usedFolderNames);
        const folderByCollectionId = new Map();
        for (const collection of collectionsToExport) {
            const base = (0, shared_1.sanitizePathSegment)(collection.name, "Collection");
            const folder = (0, shared_1.makeUniqueName)(base, usedFolderNames);
            folderByCollectionId.set(collection.id, folder);
        }
        const drawingsManifest = drawings.map((drawing) => {
            const folder = drawing.collectionId
                ? folderByCollectionId.get(drawing.collectionId) ||
                    unorganizedFolder
                : unorganizedFolder;
            const fileNameBase = (0, shared_1.sanitizePathSegment)(drawing.name, "Untitled");
            const fileName = `${fileNameBase}__${drawing.id.slice(0, 8)}.excalidraw`;
            return {
                id: drawing.id,
                name: drawing.name,
                filePath: `${folder}/${fileName}`,
                collectionId: (0, shared_1.toPublicTrashCollectionId)(drawing.collectionId, req.user.id),
                version: drawing.version,
                createdAt: drawing.createdAt.toISOString(),
                updatedAt: drawing.updatedAt.toISOString(),
            };
        });
        const manifestCollections = collectionsToExport
            .map((collection) => ({
            id: (0, shared_1.toPublicTrashCollectionId)(collection.id, req.user.id) ||
                collection.id,
            name: (0, shared_1.isTrashCollectionId)(collection.id, req.user.id)
                ? "Trash"
                : collection.name,
            folder: folderByCollectionId.get(collection.id) ||
                (0, shared_1.sanitizePathSegment)(collection.name, "Collection"),
            createdAt: collection.createdAt.toISOString(),
            updatedAt: collection.updatedAt.toISOString(),
        }))
            .filter((collection, index, all) => all.findIndex((c) => c.id === collection.id) === index);
        const manifest = {
            format: "excalidash",
            formatVersion: 1,
            exportedAt,
            excalidashBackendVersion: getBackendVersion(),
            userId: req.user.id,
            unorganizedFolder,
            collections: manifestCollections,
            drawings: drawingsManifest,
        };
        // Finish all fallible image bundling before starting the response. A
        // missing managed image must fail the backup, not leave a partial ZIP.
        const exportedFilesByDrawingId = new Map();
        for (const drawing of drawings) {
            const storedFiles = await prisma.drawingFile.findMany({
                where: { drawingId: drawing.id },
                select: {
                    fileId: true,
                    mimeType: true,
                    storage: true,
                    s3Key: true,
                    data: true,
                },
            });
            exportedFilesByDrawingId.set(drawing.id, await (0, exportFiles_1.embedDrawingFilesForExport)(parseJsonField(drawing.files, {}), storedFiles));
        }
        for (const meta of drawingsManifest) {
            (0, shared_1.assertSafeArchivePath)(meta.filePath);
        }
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        const archive = (0, archiver_1.default)("zip", { zlib: { level: 9 } });
        const abortArchive = () => {
            try {
                archive.abort();
            }
            catch { }
        };
        res.on("close", () => {
            if (res.writableEnded)
                return;
            abortArchive();
        });
        archive.on("error", (err) => {
            console.error("Archive error:", err);
            abortArchive();
            if (res.headersSent) {
                res.destroy(err instanceof Error ? err : undefined);
                return;
            }
            res.status(500).json({ error: "Failed to create archive" });
        });
        archive.pipe(res);
        archive.append(JSON.stringify(manifest, null, 2), {
            name: "excalidash.manifest.json",
        });
        const drawingsManifestById = new Map(drawingsManifest.map((d) => [d.id, d]));
        for (const drawing of drawings) {
            const meta = drawingsManifestById.get(drawing.id);
            if (!meta)
                continue;
            const files = exportedFilesByDrawingId.get(drawing.id);
            const excalidashMeta = {
                drawingId: drawing.id,
                collectionId: drawing.collectionId ?? null,
                exportedAt,
            };
            const drawingData = {
                type: "excalidraw",
                version: 2,
                source: exportSource,
                elements: parseJsonField(drawing.elements, []),
                appState: parseJsonField(drawing.appState, {}),
                files,
                excalidash: excalidashMeta,
            };
            archive.append(JSON.stringify(drawingData, null, 2), {
                name: meta.filePath,
            });
        }
        const readme = `ExcaliDash Backup (.excalidash)

This file is a zip archive containing a versioned ExcaliDash manifest and your drawings,
organized into folders by collection.

Files:
- excalidash.manifest.json (required)
- <Collection Folder>/*.excalidraw

ExportedAt: ${exportedAt}
FormatVersion: 1
BackendVersion: ${getBackendVersion()}
Collections: ${collectionsToExport.length}
Drawings: ${drawings.length}
`;
        archive.append(readme, { name: "README.txt" });
        await archive.finalize();
    }));
};
exports.registerExcalidashExportRoute = registerExcalidashExportRoute;
