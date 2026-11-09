"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerStorageRoutes = exports.collectRetainedDrawingFileIds = void 0;
const s3_1 = require("../s3");
const helpers_1 = require("./storage/helpers");
const plans_1 = require("./storage/plans");
const s3Delete_1 = require("./storage/s3Delete");
const retainedFiles_1 = require("./storage/retainedFiles");
var retainedFiles_2 = require("./storage/retainedFiles");
Object.defineProperty(exports, "collectRetainedDrawingFileIds", { enumerable: true, get: function () { return retainedFiles_2.collectRetainedDrawingFileIds; } });
const registerStorageRoutes = (app, deps) => {
    const { prisma, requireAuth, asyncHandler, parseJsonField, invalidateDrawingsCache, io, } = deps;
    /**
     * Tell anyone joined to the drawing's collaboration room that the
     * server-side state has changed underneath them. The frontend reacts
     * by reloading the drawing — otherwise a collaborator's next save
     * would re-introduce the trimmed-away elements.
     */
    const notifyServerStateChange = (drawingId) => {
        io.to(`drawing_${drawingId}`).emit("drawing-server-update", { drawingId });
    };
    // ------------------------------------------------------------------
    // POST /drawings/:id/trim
    // ------------------------------------------------------------------
    app.post("/drawings/:id/trim", requireAuth, asyncHandler(async (req, res) => {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: "Unauthorized" });
        const { id } = req.params;
        const { confirmName } = req.body ?? {};
        // 1. Find drawing owned by user
        const drawing = await prisma.drawing.findFirst({
            where: { id, userId },
        });
        if (!drawing) {
            return res.status(404).json({ error: "Drawing not found" });
        }
        // Confirm name must match
        if (typeof confirmName !== "string" || confirmName !== drawing.name) {
            return res
                .status(403)
                .json({ error: "confirmName does not match drawing name" });
        }
        const elements = parseJsonField(drawing.elements, []);
        const files = parseJsonField(drawing.files, {});
        const trimPlan = (0, plans_1.buildTrimPlan)(elements, files);
        // Commit the trimmed drawing FIRST, guarded on the version we read.
        // If a concurrent editor saved in between, `count` is 0 — we abort
        // with 409 instead of overwriting their newer state with our stale
        // snapshot, and we have not yet touched S3, so nothing is stranded.
        const s3CleanupPlan = await prisma.$transaction(async (tx) => {
            const updateResult = await tx.drawing.updateMany({
                where: { id, version: drawing.version },
                data: {
                    elements: JSON.stringify(trimPlan.activeElements),
                    files: JSON.stringify(trimPlan.cleanedFiles),
                    version: { increment: 1 },
                },
            });
            if (updateResult.count === 0)
                return null;
            const retainedFileIds = await (0, retainedFiles_1.collectRetainedDrawingFileIds)(tx, id);
            // Select rows while the guarded cleanup owns the transaction. Only
            // their exact keys can be reclaimed: an untracked S3 object may be
            // an upload that has stored bytes but has not created its row yet.
            const storedRecords = await tx.drawingFile.findMany({
                where: { drawingId: id },
                select: {
                    fileId: true,
                    storage: true,
                    s3Key: true,
                    mimeType: true,
                    sizeBytes: true,
                },
            });
            const plan = retainedFileIds
                ? (0, plans_1.buildTrimS3CleanupPlan)({
                    survivingFileIds: retainedFileIds,
                    storedRecords,
                })
                : { orphanKeys: [], orphanFileIds: [] };
            if (plan.orphanFileIds.length > 0) {
                await tx.drawingFile.deleteMany({
                    where: { drawingId: id, fileId: { in: plan.orphanFileIds } },
                });
            }
            return plan;
        });
        if (!s3CleanupPlan) {
            return res.status(409).json({
                error: "Conflict",
                code: "VERSION_CONFLICT",
                message: "Drawing has changed since it was loaded for trimming.",
            });
        }
        // S3File is keyed (drawingId, fileId) and S3 objects sit under a
        // per-drawing path, so this drawing's storage is independent from
        // every other drawing's — no cross-drawing reference check needed.
        // Duplicates are made by copying objects into the new drawingId
        // path (see drawings.ts /duplicate), so deleting the original
        // does not strand a sibling.
        //
        // Delete objects only AFTER the DB write succeeds: the committed row
        // no longer references the orphan files, so a mid-cleanup crash just
        // leaves recoverable orphan S3 objects rather than a live drawing
        // pointing at deleted objects (broken images).
        let s3ObjectsDeleted = 0;
        let s3DeleteErrors = 0;
        if ((0, s3_1.isS3Enabled)() && s3CleanupPlan.orphanKeys.length > 0) {
            const deleteResult = await (0, s3Delete_1.deleteS3KeysInBatches)({
                keys: s3CleanupPlan.orphanKeys,
                logPrefix: "[storage/trim]",
                deleteObject: s3_1.deleteS3Object,
            });
            s3ObjectsDeleted = deleteResult.deleted;
            s3DeleteErrors = deleteResult.errors;
        }
        invalidateDrawingsCache();
        notifyServerStateChange(id);
        return res.json({
            trimmed: {
                elementsRemoved: trimPlan.elementsRemoved,
                filesRemoved: trimPlan.filesRemoved,
                s3ObjectsDeleted,
                s3DeleteErrors,
            },
        });
    }));
    // ------------------------------------------------------------------
    // GET /drawings/:id/files/diff
    // ------------------------------------------------------------------
    app.get("/drawings/:id/files/diff", requireAuth, asyncHandler(async (req, res) => {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: "Unauthorized" });
        const { id } = req.params;
        const drawing = await prisma.drawing.findFirst({
            where: { id, userId },
        });
        if (!drawing) {
            return res.status(404).json({ error: "Drawing not found" });
        }
        const elements = parseJsonField(drawing.elements, []);
        const files = parseJsonField(drawing.files, {});
        const storedRecords = await prisma.drawingFile.findMany({
            where: { drawingId: id },
            select: {
                fileId: true,
                storage: true,
                s3Key: true,
                mimeType: true,
                sizeBytes: true,
            },
        });
        const s3Objects = (0, s3_1.isS3Enabled)()
            ? await (0, s3_1.listS3Objects)((0, s3_1.drawingS3Prefix)(userId, id))
            : [];
        const diffResponse = (0, plans_1.buildFilesDiffResponse)({
            elements,
            files,
            storedRecords,
            s3Objects,
        });
        return res.json(diffResponse);
    }));
    // ------------------------------------------------------------------
    // DELETE /drawings/:id/files/orphans
    // ------------------------------------------------------------------
    app.delete("/drawings/:id/files/orphans", requireAuth, asyncHandler(async (req, res) => {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: "Unauthorized" });
        const { id } = req.params;
        const { confirmName, fileIds: rawFileIds } = req.body ?? {};
        if (!Array.isArray(rawFileIds) || rawFileIds.length === 0) {
            return res
                .status(400)
                .json({ error: "fileIds must be a non-empty array" });
        }
        // Validate every entry: same regex as the rest of the codebase
        // (security.ts sanitiser, /files/:fileId route, processFilesForS3).
        // Without this, a non-string or path-traversal-shaped id would
        // explode inside the Prisma / S3 calls below.
        const invalidIds = rawFileIds.filter((fid) => typeof fid !== "string" || !helpers_1.VALID_STORAGE_FILE_ID.test(fid));
        if (invalidIds.length > 0) {
            return res.status(400).json({
                error: "fileIds contains invalid entries",
                invalidFileIds: invalidIds,
            });
        }
        const fileIds = rawFileIds;
        const drawing = await prisma.drawing.findFirst({
            where: { id, userId },
        });
        if (!drawing) {
            return res.status(404).json({ error: "Drawing not found" });
        }
        if (typeof confirmName !== "string" || confirmName !== drawing.name) {
            return res
                .status(403)
                .json({ error: "confirmName does not match drawing name" });
        }
        const elements = parseJsonField(drawing.elements, []);
        const files = parseJsonField(drawing.files, {});
        const deletePlan = (0, plans_1.buildOrphanDeletePlan)({ elements, files, fileIds });
        if (deletePlan.blockedIds.length > 0) {
            return res.status(400).json({
                error: "Cannot delete files referenced by active elements",
                blockedFileIds: deletePlan.blockedIds,
            });
        }
        // Commit the cleaned drawing FIRST, guarded on the version we read.
        // A concurrent editor that re-referenced one of these files (or saved
        // anything else) bumps the version, so `count` is 0 and we abort with
        // 409 instead of deleting files the live drawing now depends on. S3 is
        // untouched at this point, so a conflict strands nothing.
        const deletableRecords = await prisma.$transaction(async (tx) => {
            const updateResult = await tx.drawing.updateMany({
                where: { id, version: drawing.version },
                data: {
                    files: JSON.stringify(deletePlan.cleanedFiles),
                    elements: JSON.stringify(deletePlan.cleanedElements),
                    version: { increment: 1 },
                },
            });
            if (updateResult.count === 0)
                return null;
            const retainedFileIds = await (0, retainedFiles_1.collectRetainedDrawingFileIds)(tx, id);
            const deletableIds = retainedFileIds
                ? fileIds.filter((fileId) => !retainedFileIds.has(fileId))
                : [];
            const records = await tx.drawingFile.findMany({
                where: { drawingId: id, fileId: { in: deletableIds } },
                select: { s3Key: true, storage: true },
            });
            await tx.drawingFile.deleteMany({
                where: { drawingId: id, fileId: { in: deletableIds } },
            });
            return records;
        });
        if (!deletableRecords) {
            return res.status(409).json({
                error: "Conflict",
                code: "VERSION_CONFLICT",
                message: "Drawing has changed since it was loaded for cleanup.",
            });
        }
        // Batched S3 + DB cleanup, run only AFTER the DB write commits. S3File
        // rows are scoped (drawingId, fileId), and each drawing has its own S3
        // object under its own prefix path — deletion here cannot strand a
        // sibling drawing. Doing N+1 sequential lookups + deletes per file
        // would tie up the request unnecessarily for large selections.
        let s3DeleteErrors = 0;
        if ((0, s3_1.isS3Enabled)()) {
            const deleteResult = await (0, s3Delete_1.deleteS3KeysInBatches)({
                keys: deletableRecords
                    .filter((record) => record.storage === "s3")
                    .map((record) => record.s3Key)
                    .filter((key) => Boolean(key)),
                logPrefix: "[storage/orphans]",
                deleteObject: s3_1.deleteS3Object,
            });
            s3DeleteErrors = deleteResult.errors;
        }
        const errorCount = s3DeleteErrors;
        invalidateDrawingsCache();
        notifyServerStateChange(id);
        return res.json({ deleted: deletePlan.deletedCount, errors: errorCount });
    }));
};
exports.registerStorageRoutes = registerStorageRoutes;
