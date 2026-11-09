"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rewritePreviewForInternedFiles = exports.internDrawingFiles = exports.cleanupUnusedS3Upload = exports.decodeDataURL = exports.MIME_TO_EXT = void 0;
const node_crypto_1 = require("node:crypto");
const drawingFileStore_1 = require("./drawingFileStore");
const s3_1 = require("./s3");
/**
 * Reject anything that could escape the per-user/per-drawing S3 prefix.
 * Same shape used by `/files/:drawingId/:fileId` validation.
 */
const VALID_FILE_ID = /^[\w-]{1,200}$/;
exports.MIME_TO_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/bmp": "bmp",
    "image/svg+xml": "svg",
};
/**
 * Decode a base64 data URL into a Buffer and its MIME type.
 * Returns null if the string is not a valid data URL.
 */
const decodeDataURL = (dataURL) => {
    const match = dataURL.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match)
        return null;
    const mimeType = match[1];
    const base64 = match[2];
    try {
        const buffer = Buffer.from(base64, "base64");
        return { buffer, mimeType };
    }
    catch {
        return null;
    }
};
exports.decodeDataURL = decodeDataURL;
/** Reclaim only this request's fresh generation when another row won. */
const cleanupUnusedS3Upload = async (freshKey, stored) => {
    if (stored.storage === "s3" && stored.s3Key === freshKey)
        return;
    try {
        await (0, s3_1.deleteS3Object)(freshKey);
    }
    catch (error) {
        // The winning upload remains valid even if compensation is unavailable.
        console.warn("[files] Failed to cleanup unused S3 upload", {
            freshKey,
            error,
        });
    }
};
exports.cleanupUnusedS3Upload = cleanupUnusedS3Upload;
/**
 * Scan a drawing's files record for base64 dataURLs, store them in the
 * DrawingFile store (S3 or db bytes depending on config), and replace the
 * dataURL with the drawing-scoped access URL.
 *
 * Entries whose dataURL is already a ref (https://, /api/files/, ...) are
 * left untouched, so this is safe to run on every scene save.
 */
const internDrawingFiles = async (files, userId, drawingId, prisma) => {
    const s3Enabled = (0, s3_1.isS3Enabled)();
    const cfg = s3Enabled ? (0, s3_1.getS3Config)() : null;
    const result = { ...files };
    // Bound parallel writes. Without this, a paste of N images fires N
    // parallel uploads, which can spike S3 connection pools (or open a burst
    // of DB writes) and produce inconsistent partial-failure states on shaky
    // networks.
    const UPLOAD_CONCURRENCY = 8;
    const processFile = async ([fileId, file]) => {
        if (!VALID_FILE_ID.test(fileId)) {
            // Reject path-traversal candidates rather than silently storing them
            // under a forged key. Drop from output so the bad entry never reaches
            // the database either.
            console.warn(`[files] Skipping file with invalid id: ${JSON.stringify(fileId)}`);
            delete result[fileId];
            return;
        }
        const dataURL = file?.dataURL;
        if (typeof dataURL !== "string" || !dataURL.startsWith("data:")) {
            // Not a base64 data URL — leave unchanged (https://, /api/files/, etc.)
            return;
        }
        const decoded = (0, exports.decodeDataURL)(dataURL);
        if (!decoded)
            return;
        // File ids are immutable content hashes, just as on the raw upload route.
        // A stale client's inline copy must not rewrite bytes used by the current
        // scene or retained snapshots, even if its scene save later conflicts.
        const existing = await prisma.drawingFile.findUnique({
            where: { drawingId_fileId: { drawingId, fileId } },
        });
        if (existing && (0, drawingFileStore_1.hasDrawingFileContent)(existing)) {
            result[fileId] = {
                ...file,
                mimeType: existing.mimeType,
                dataURL: cfg?.publicUrl && existing.storage === "s3" && existing.s3Key
                    ? (0, s3_1.getPublicUrl)(existing.s3Key)
                    : `/api/files/${drawingId}/${fileId}`,
            };
            return;
        }
        const sizeBytes = decoded.buffer.length;
        if (s3Enabled) {
            const ext = exports.MIME_TO_EXT[decoded.mimeType] ?? "bin";
            const s3Key = (0, s3_1.buildS3Key)(userId, drawingId, fileId, ext, (0, node_crypto_1.randomUUID)());
            await (0, s3_1.uploadBuffer)(s3Key, decoded.buffer, decoded.mimeType);
            // Drawing-scoped access URL: a file id alone would be ambiguous
            // because the same content hash legitimately repeats across drawings.
            const stored = await (0, drawingFileStore_1.storeDrawingFileOnce)(prisma, {
                drawingId,
                fileId,
                mimeType: decoded.mimeType,
                sizeBytes,
                storage: "s3",
                s3Key,
                data: null,
            });
            await (0, exports.cleanupUnusedS3Upload)(s3Key, stored);
            result[fileId] = {
                ...file,
                mimeType: stored.mimeType,
                dataURL: cfg?.publicUrl && stored.storage === "s3" && stored.s3Key
                    ? (0, s3_1.getPublicUrl)(stored.s3Key)
                    : `/api/files/${drawingId}/${fileId}`,
            };
            return;
        }
        // Database-bytes mode: store the raw bytes inline in DrawingFile.data.
        const stored = await (0, drawingFileStore_1.storeDrawingFileOnce)(prisma, {
            drawingId,
            fileId,
            mimeType: decoded.mimeType,
            sizeBytes,
            storage: "db",
            s3Key: null,
            data: decoded.buffer,
        });
        result[fileId] = {
            ...file,
            mimeType: stored.mimeType,
            dataURL: cfg?.publicUrl && stored.storage === "s3" && stored.s3Key
                ? (0, s3_1.getPublicUrl)(stored.s3Key)
                : `/api/files/${drawingId}/${fileId}`,
        };
    };
    const entries = Object.entries(files);
    for (let i = 0; i < entries.length; i += UPLOAD_CONCURRENCY) {
        await Promise.all(entries.slice(i, i + UPLOAD_CONCURRENCY).map(processFile));
    }
    return result;
};
exports.internDrawingFiles = internDrawingFiles;
/**
 * Rewrite an Excalidraw preview SVG so any base64 dataURL that has just
 * been interned is replaced by the resulting access / ref URL.
 *
 * The frontend generates the preview SVG from the canvas state at save
 * time, *before* the round-trip to the backend interns the files; the
 * SVG embeds whatever dataURL the file currently has in `Drawing.files`.
 * Without this rewrite, every save produces a megabyte-scale preview
 * with the full image base64 inlined, even though the image itself is
 * already stored (the diff between Drawing.files's processed entries
 * and the preview field gets ever larger over time).
 *
 * Also rebase managed references when duplicating a drawing so its preview
 * remains usable after the source is deleted or stops being shared.
 * Best-effort string substitution: works because the same dataURL
 * string is character-identical in both `files[fileId].dataURL` and
 * the preview SVG's `<image href="...">` attribute. If frontend
 * encoding ever diverges, the worst case is the preview is left as-is.
 */
const rewritePreviewForInternedFiles = (preview, originalFiles, processedFiles) => {
    if (typeof preview !== "string" || preview.length === 0) {
        return preview;
    }
    let rewritten = preview;
    for (const fileId of Object.keys(processedFiles)) {
        const original = originalFiles[fileId];
        const processed = processedFiles[fileId];
        if (!original ||
            !processed ||
            typeof original.dataURL !== "string" ||
            typeof processed.dataURL !== "string" ||
            original.dataURL === processed.dataURL) {
            continue;
        }
        rewritten = rewritten.split(original.dataURL).join(processed.dataURL);
    }
    return rewritten;
};
exports.rewritePreviewForInternedFiles = rewritePreviewForInternedFiles;
