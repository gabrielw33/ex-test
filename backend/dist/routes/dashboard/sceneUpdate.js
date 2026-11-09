"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applySceneUpdateTx = exports.isVersionConflict = void 0;
const snapshotCodec_1 = require("../../snapshots/snapshotCodec");
// A file entry is "blank" when it exists but carries no content (empty
// dataURL). Sanitizer tombstones and transient client state can produce
// these; they must never overwrite an existing entry that still has content.
const isBlankFileEntry = (entry) => {
    if (!entry || typeof entry !== "object")
        return true;
    const dataURL = entry.dataURL;
    return typeof dataURL !== "string" || dataURL.length === 0;
};
// Merge incoming files into the existing set by fileId (union). Removal is
// never performed here — only the trim/orphans routes delete files — so a
// save from a client with a partial/stale view of the files object cannot
// delete another client's images. Same-id updates overwrite, except a blank
// incoming entry never clobbers existing content.
const mergeFilesUnion = (existing, incoming) => {
    const merged = { ...existing };
    for (const [fileId, entry] of Object.entries(incoming)) {
        if (isBlankFileEntry(entry) &&
            merged[fileId] !== undefined &&
            !isBlankFileEntry(merged[fileId])) {
            continue;
        }
        merged[fileId] = entry;
    }
    return merged;
};
// Thrown (and recognized by identity or message) when the version-guarded
// write loses to a concurrent save. Callers translate it to HTTP 409.
const versionConflictError = new Error("VERSION_CONFLICT");
const isVersionConflict = (error) => error === versionConflictError ||
    (error instanceof Error && error.message === versionConflictError.message);
exports.isVersionConflict = isVersionConflict;
const applySceneUpdateTx = async (args) => {
    const { prisma, drawingId, parseJsonField, versionGuard, snapshotCompressionEnabled = true, mutate, maxRetries = 0, } = args;
    const attempts = versionGuard === "optimistic" ? maxRetries + 1 : 1;
    let lastConflict = versionConflictError;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            return await prisma.$transaction(async (tx) => {
                const current = await tx.drawing.findUnique({
                    where: { id: drawingId },
                });
                if (!current) {
                    throw versionConflictError;
                }
                if (typeof versionGuard === "number" &&
                    current.version !== versionGuard) {
                    throw versionConflictError;
                }
                const mutation = await mutate(current);
                if (mutation.requiredFileIds?.length) {
                    const requiredIds = new Set(mutation.requiredFileIds);
                    const stored = await tx.drawingFile.findMany({
                        where: { drawingId, fileId: { in: [...requiredIds] } },
                        select: { fileId: true },
                    });
                    if (stored.length !== requiredIds.size) {
                        throw versionConflictError;
                    }
                }
                await tx.drawingSnapshot.create({
                    data: {
                        drawingId,
                        version: current.version,
                        elements: (0, snapshotCodec_1.encodeSnapshotField)(current.elements, snapshotCompressionEnabled),
                        appState: (0, snapshotCodec_1.encodeSnapshotField)(current.appState, snapshotCompressionEnabled),
                        files: (0, snapshotCodec_1.encodeSnapshotField)(current.files, snapshotCompressionEnabled),
                    },
                });
                const writeData = {
                    ...mutation.data,
                    version: { increment: 1 },
                };
                if (mutation.incomingFiles !== undefined) {
                    const existingFiles = parseJsonField(current.files, {});
                    writeData.files = JSON.stringify(mergeFilesUnion(existingFiles, mutation.incomingFiles));
                }
                const where = { id: drawingId };
                if (typeof versionGuard === "number") {
                    where.version = versionGuard;
                }
                else {
                    where.version = current.version;
                }
                const updateResult = await tx.drawing.updateMany({
                    where,
                    data: writeData,
                });
                if (updateResult.count === 0) {
                    throw versionConflictError;
                }
                const updated = await tx.drawing.findFirst({
                    where: { id: drawingId },
                });
                if (!updated) {
                    throw versionConflictError;
                }
                return { drawing: updated, revertVersion: current.version };
            });
        }
        catch (error) {
            if ((0, exports.isVersionConflict)(error) && attempt < attempts - 1) {
                lastConflict = error;
                continue;
            }
            throw error;
        }
    }
    throw lastConflict;
};
exports.applySceneUpdateTx = applySceneUpdateTx;
