"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDrawingRouteContext = void 0;
const s3_1 = require("../../s3");
const config_1 = require("../../config");
const createDrawingRouteContext = (deps) => {
    const { prisma } = deps;
    const getRequestPrincipal = async (req) => {
        if (req.user?.id)
            return { kind: "user", userId: req.user.id };
        return null;
    };
    const resolveDefaultTtlMs = (permission) => permission === "edit"
        ? config_1.config.linkShare.editDefaultTtlMs
        : config_1.config.linkShare.viewDefaultTtlMs;
    const resolveMaxTtlMs = () => config_1.config.linkShare.maxTtlMs;
    const respondWithAuthErrorIfPresent = (req, res) => {
        if (!req.authError)
            return false;
        res.status(401).json({
            error: "Unauthorized",
            message: "Invalid or expired token",
        });
        return true;
    };
    const cleanupS3FilesForDrawing = async (drawingId, userId) => {
        // Delete S3 objects first (when enabled), then the rows. In db-mode the
        // bytes live in the rows themselves, so the deleteMany below reclaims
        // them; it runs in both modes.
        if ((0, s3_1.isS3Enabled)()) {
            const [objects, records] = await Promise.all([
                (0, s3_1.listS3Objects)((0, s3_1.drawingS3Prefix)(userId, drawingId)),
                prisma.drawingFile.findMany({
                    where: { drawingId },
                    select: { s3Key: true },
                }),
            ]);
            const keys = new Set(objects.map((object) => object.key));
            for (const record of records) {
                if (record.s3Key)
                    keys.add(record.s3Key);
            }
            await Promise.allSettled([...keys].map((key) => (0, s3_1.deleteS3Object)(key)));
        }
        await prisma.drawingFile.deleteMany({ where: { drawingId } });
    };
    const cloneS3FileReferences = async (sourceDrawingId, targetDrawingId, userId, files) => {
        const records = await prisma.drawingFile.findMany({
            where: { drawingId: sourceDrawingId },
        });
        if (records.length === 0)
            return files;
        const clonedFiles = { ...files };
        const cfg = (0, s3_1.isS3Enabled)() ? (0, s3_1.getS3Config)() : null;
        await Promise.all(records.map(async (record) => {
            if (record.storage === "s3" && record.s3Key) {
                const extension = record.s3Key.includes(".")
                    ? record.s3Key.substring(record.s3Key.lastIndexOf(".") + 1)
                    : "bin";
                const targetKey = (0, s3_1.buildS3Key)(userId, targetDrawingId, record.fileId, extension);
                await (0, s3_1.copyS3Object)(record.s3Key, targetKey, record.mimeType);
                await prisma.drawingFile.upsert({
                    where: {
                        drawingId_fileId: {
                            drawingId: targetDrawingId,
                            fileId: record.fileId,
                        },
                    },
                    create: {
                        drawingId: targetDrawingId,
                        fileId: record.fileId,
                        mimeType: record.mimeType,
                        sizeBytes: record.sizeBytes,
                        storage: "s3",
                        s3Key: targetKey,
                        data: null,
                    },
                    update: {
                        storage: "s3",
                        s3Key: targetKey,
                        data: null,
                        mimeType: record.mimeType,
                        sizeBytes: record.sizeBytes,
                    },
                });
                if (clonedFiles[record.fileId]) {
                    clonedFiles[record.fileId] = {
                        ...clonedFiles[record.fileId],
                        dataURL: cfg?.publicUrl
                            ? (0, s3_1.getPublicUrl)(targetKey)
                            : `/api/files/${targetDrawingId}/${record.fileId}`,
                    };
                }
                return;
            }
            // Database-bytes mode: copy the bytes into a new row for the copy.
            await prisma.drawingFile.upsert({
                where: {
                    drawingId_fileId: {
                        drawingId: targetDrawingId,
                        fileId: record.fileId,
                    },
                },
                create: {
                    drawingId: targetDrawingId,
                    fileId: record.fileId,
                    mimeType: record.mimeType,
                    sizeBytes: record.sizeBytes,
                    storage: "db",
                    s3Key: null,
                    data: record.data,
                },
                update: {
                    storage: "db",
                    s3Key: null,
                    data: record.data,
                    mimeType: record.mimeType,
                    sizeBytes: record.sizeBytes,
                },
            });
            if (clonedFiles[record.fileId]) {
                clonedFiles[record.fileId] = {
                    ...clonedFiles[record.fileId],
                    dataURL: `/api/files/${targetDrawingId}/${record.fileId}`,
                };
            }
        }));
        return clonedFiles;
    };
    return {
        ...deps,
        getRequestPrincipal,
        resolveDefaultTtlMs,
        resolveMaxTtlMs,
        respondWithAuthErrorIfPresent,
        cleanupS3FilesForDrawing,
        cloneS3FileReferences,
    };
};
exports.createDrawingRouteContext = createDrawingRouteContext;
