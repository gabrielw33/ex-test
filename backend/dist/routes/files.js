"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFileRoutes = void 0;
/**
 * File routes:
 *   GET  /files/config                    – report whether S3 is configured
 *   PUT  /drawings/:drawingId/files/:fileId – upload raw image bytes (edit access)
 *   GET  /files/:drawingId/:fileId        – serve an image:
 *                                            db-mode → stream bytes (ETag/304)
 *                                            s3-mode → 302 to a presigned URL
 */
const express_1 = __importDefault(require("express"));
const s3_1 = require("../s3");
const fileProcessing_1 = require("../fileProcessing");
const node_crypto_1 = require("node:crypto");
const drawingFileStore_1 = require("../drawingFileStore");
const config_1 = require("../config");
const sharing_1 = require("../authz/sharing");
const DOWNLOAD_EXPIRES_IN = 3600; // 1 hour   – cached by browser
/** Loose guard: drawingId / fileId must be safe, path-traversal-free identifiers. */
const isValidIdSegment = (value) => typeof value === "string" && /^[\w-]{1,200}$/.test(value);
const registerFileRoutes = (app, deps) => {
    const { prisma, requireAuth, optionalAuth, asyncHandler } = deps;
    // Raw body parser mounted ONLY on the upload route. The global
    // express.json parser ignores non-JSON content types, so the raw image
    // bytes reach here untouched. `FILE_UPLOAD_MAX_MB` is the single per-image
    // ceiling — it does not touch BODY_LIMIT_MB.
    const rawUpload = express_1.default.raw({
        type: "*/*",
        limit: config_1.config.fileUploadMaxBytes,
    });
    // Convert express.raw's PayloadTooLargeError into an actionable 413 JSON
    // response regardless of NODE_ENV (the global error handler would mask the
    // message in production).
    const handleUploadPayloadError = (err, _req, res, next) => {
        if (err &&
            (err.type === "entity.too.large" ||
                err.status === 413 ||
                err.statusCode === 413)) {
            res.status(413).json({
                error: "File too large",
                message: `Uploaded file exceeds the ${config_1.config.fileUploadMaxMb}MB limit. Raise FILE_UPLOAD_MAX_MB to accept larger images.`,
            });
            return;
        }
        next(err);
    };
    // ------------------------------------------------------------------
    // GET /files/config
    // Returns whether S3 is enabled so the frontend can decide whether to
    // show storage management features.
    // ------------------------------------------------------------------
    app.get("/files/config", requireAuth, asyncHandler(async (_req, res) => {
        return res.json({ s3Enabled: (0, s3_1.isS3Enabled)() });
    }));
    // ------------------------------------------------------------------
    // PUT /drawings/:drawingId/files/:fileId
    // Uploads the raw bytes of a single image. Idempotent: (drawingId,fileId)
    // is content-addressed, so an existing row with content is a 200 no-op.
    // ------------------------------------------------------------------
    app.put("/drawings/:drawingId/files/:fileId", 
    // requireAuth runs BEFORE the raw-body parser so unauthenticated clients
    // can't impose the buffer cost of up to FILE_UPLOAD_MAX_MB per request.
    requireAuth, rawUpload, handleUploadPayloadError, asyncHandler(async (req, res) => {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: "Unauthorized" });
        const { drawingId, fileId } = req.params;
        if (!isValidIdSegment(drawingId) || !isValidIdSegment(fileId)) {
            return res.status(400).json({ error: "Invalid id segment" });
        }
        const access = await (0, sharing_1.getDrawingAccess)({
            prisma,
            principal: { kind: "user", userId },
            drawingId,
        });
        if (!(0, sharing_1.canEditDrawing)(access)) {
            // 404 (not 403) so we don't leak the drawing's existence.
            return res.status(404).json({ error: "Drawing not found" });
        }
        const mimeType = (req.headers["content-type"] ?? "")
            .split(";")[0]
            .trim()
            .toLowerCase();
        if (!mimeType || !(mimeType in fileProcessing_1.MIME_TO_EXT)) {
            return res.status(415).json({
                error: "Unsupported media type",
                message: `Content-Type must be one of: ${Object.keys(fileProcessing_1.MIME_TO_EXT).join(", ")}`,
            });
        }
        const body = req.body;
        if (typeof body !== "object" ||
            body === null ||
            !Buffer.isBuffer(body) ||
            body.length === 0) {
            return res.status(400).json({
                error: "Empty request body",
                message: "Send the raw image bytes as the request body.",
            });
        }
        const responseUrl = `/api/files/${drawingId}/${fileId}`;
        // Idempotent: an existing row that already carries content is a no-op.
        const existing = await prisma.drawingFile.findUnique({
            where: { drawingId_fileId: { drawingId, fileId } },
        });
        if ((0, drawingFileStore_1.hasDrawingFileContent)(existing)) {
            return res.status(200).json({ url: responseUrl, fileId });
        }
        if ((0, s3_1.isS3Enabled)()) {
            // Collaborators may upload, but storage listing and drawing cleanup
            // use the drawing owner's namespace, just like inline scene files.
            const drawing = await prisma.drawing.findUnique({
                where: { id: drawingId },
                select: { userId: true },
            });
            if (!drawing) {
                return res.status(404).json({ error: "Drawing not found" });
            }
            const ext = fileProcessing_1.MIME_TO_EXT[mimeType] ?? "bin";
            const s3Key = (0, s3_1.buildS3Key)(drawing.userId, drawingId, fileId, ext, (0, node_crypto_1.randomUUID)());
            await (0, s3_1.uploadBuffer)(s3Key, body, mimeType);
            const stored = await (0, drawingFileStore_1.storeDrawingFileOnce)(prisma, {
                drawingId,
                fileId,
                mimeType,
                sizeBytes: body.length,
                storage: "s3",
                s3Key,
                data: null,
            });
            await (0, fileProcessing_1.cleanupUnusedS3Upload)(s3Key, stored);
            return res.status(200).json({ url: responseUrl, fileId });
        }
        // Database-bytes mode: persist the raw bytes inline.
        await (0, drawingFileStore_1.storeDrawingFileOnce)(prisma, {
            drawingId,
            fileId,
            mimeType,
            sizeBytes: body.length,
            storage: "db",
            s3Key: null,
            data: body,
        });
        return res.status(200).json({ url: responseUrl, fileId });
    }));
    // ------------------------------------------------------------------
    // GET /files/:drawingId/:fileId
    // Serves the image. In db-mode the bytes are streamed directly with an
    // immutable cache policy and an ETag (honoring If-None-Match → 304). In
    // s3-mode a presigned GET URL is issued and the browser is redirected.
    // ------------------------------------------------------------------
    app.get("/files/:drawingId/:fileId", optionalAuth, asyncHandler(async (req, res) => {
        const { drawingId, fileId } = req.params;
        if (!isValidIdSegment(drawingId) || !isValidIdSegment(fileId)) {
            return res.status(400).json({ error: "Invalid id segment" });
        }
        // Drawing access decides authorization; fall back to 404 on
        // miss so we don't leak existence of a (drawing, fileId) pair.
        const access = await (0, sharing_1.getDrawingAccess)({
            prisma,
            principal: req.user?.id ? { kind: "user", userId: req.user.id } : null,
            drawingId,
        });
        if (!(0, sharing_1.canViewDrawing)(access)) {
            return res.status(404).json({ error: "File not found" });
        }
        const fileRecord = await prisma.drawingFile.findUnique({
            where: { drawingId_fileId: { drawingId, fileId } },
        });
        if (!fileRecord) {
            return res.status(404).json({ error: "File not found" });
        }
        if (fileRecord.storage === "db") {
            if (!fileRecord.data) {
                return res.status(404).json({ error: "File not found" });
            }
            // fileIds are content hashes, so the object is immutable — a strong
            // ETag equal to the fileId lets revisits short-circuit to 304.
            const etag = `"${fileId}"`;
            res.setHeader("ETag", etag);
            res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
            if (req.headers["if-none-match"] === etag) {
                return res.status(304).end();
            }
            const buffer = Buffer.isBuffer(fileRecord.data)
                ? fileRecord.data
                : Buffer.from(fileRecord.data);
            res.setHeader("Content-Type", fileRecord.mimeType);
            res.setHeader("Content-Length", buffer.length);
            return res.status(200).end(buffer);
        }
        // storage === "s3": presigned redirect (private-bucket mode).
        if (!(0, s3_1.isS3Enabled)() || !fileRecord.s3Key) {
            return res.status(404).json({ error: "File not found" });
        }
        // The redirect bypasses the app's CSP/nosniff headers, so pin the
        // content type to the stored (whitelisted) value and force scriptable
        // types — SVG can carry <script> — to download instead of render.
        const isScriptableType = fileRecord.mimeType === "image/svg+xml" ||
            fileRecord.mimeType === "text/html";
        const downloadUrl = await (0, s3_1.generatePresignedDownloadUrl)(fileRecord.s3Key, DOWNLOAD_EXPIRES_IN, {
            contentType: fileRecord.mimeType,
            contentDisposition: isScriptableType
                ? "attachment"
                : `inline; filename="${fileId}"`,
        });
        return res.redirect(302, downloadUrl);
    }));
};
exports.registerFileRoutes = registerFileRoutes;
