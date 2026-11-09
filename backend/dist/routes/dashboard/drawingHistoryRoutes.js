"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDrawingHistoryRoutes = void 0;
const sharing_1 = require("../../authz/sharing");
const snapshotCodec_1 = require("../../snapshots/snapshotCodec");
const sceneUpdate_1 = require("./sceneUpdate");
const registerDrawingHistoryRoutes = (app, context) => {
    const { prisma, optionalAuth, asyncHandler, parseJsonField, invalidateDrawingsCache, getRequestPrincipal, respondWithAuthErrorIfPresent, } = context;
    // ============================================================
    // Drawing Version History
    // ============================================================
    // List snapshots (metadata only)
    app.get("/drawings/:id/history", optionalAuth, asyncHandler(async (req, res) => {
        const principal = await getRequestPrincipal(req);
        const { id } = req.params;
        const access = await (0, sharing_1.getDrawingAccess)({
            prisma,
            principal,
            drawingId: id,
        });
        if (!(0, sharing_1.canViewDrawing)(access)) {
            if (respondWithAuthErrorIfPresent(req, res))
                return;
            return res.status(404).json({ error: "Drawing not found" });
        }
        const requestedLimit = Number(req.query.limit ?? 50);
        const offset = Number(req.query.offset ?? 0);
        if (!Number.isSafeInteger(requestedLimit) ||
            requestedLimit < 1 ||
            !Number.isSafeInteger(offset) ||
            offset < 0 ||
            (req.query.limit !== undefined &&
                typeof req.query.limit !== "string") ||
            (req.query.offset !== undefined && typeof req.query.offset !== "string")) {
            return res.status(400).json({ error: "Invalid history pagination" });
        }
        const limit = Math.min(requestedLimit, 200);
        const [snapshots, totalCount] = await Promise.all([
            prisma.drawingSnapshot.findMany({
                where: { drawingId: id },
                select: { id: true, version: true, createdAt: true },
                orderBy: { createdAt: "desc" },
                take: limit,
                skip: offset,
            }),
            prisma.drawingSnapshot.count({ where: { drawingId: id } }),
        ]);
        return res.json({ snapshots, totalCount });
    }));
    // Get full snapshot for preview
    app.get("/drawings/:id/history/:snapshotId", optionalAuth, asyncHandler(async (req, res) => {
        const principal = await getRequestPrincipal(req);
        const { id, snapshotId } = req.params;
        const access = await (0, sharing_1.getDrawingAccess)({
            prisma,
            principal,
            drawingId: id,
        });
        if (!(0, sharing_1.canViewDrawing)(access)) {
            if (respondWithAuthErrorIfPresent(req, res))
                return;
            return res.status(404).json({ error: "Drawing not found" });
        }
        const snapshot = await prisma.drawingSnapshot.findFirst({
            where: { id: snapshotId, drawingId: id },
        });
        if (!snapshot)
            return res.status(404).json({ error: "Snapshot not found" });
        return res.json({
            ...snapshot,
            elements: parseJsonField((0, snapshotCodec_1.decodeSnapshotField)(snapshot.elements), []),
            appState: parseJsonField((0, snapshotCodec_1.decodeSnapshotField)(snapshot.appState), {}),
            files: parseJsonField((0, snapshotCodec_1.decodeSnapshotField)(snapshot.files), {}),
        });
    }));
    // Restore a snapshot (snapshots current state first, then applies old state)
    app.post("/drawings/:id/history/:snapshotId/restore", optionalAuth, asyncHandler(async (req, res) => {
        const principal = await getRequestPrincipal(req);
        const { id, snapshotId } = req.params;
        const access = await (0, sharing_1.getDrawingAccess)({
            prisma,
            principal,
            drawingId: id,
        });
        if (!(0, sharing_1.canEditDrawing)(access)) {
            if (respondWithAuthErrorIfPresent(req, res))
                return;
            return res.status(404).json({ error: "Drawing not found" });
        }
        const [drawing, snapshot] = await Promise.all([
            prisma.drawing.findUnique({ where: { id } }),
            prisma.drawingSnapshot.findFirst({
                where: { id: snapshotId, drawingId: id },
            }),
        ]);
        if (!drawing)
            return res.status(404).json({ error: "Drawing not found" });
        if (!snapshot)
            return res.status(404).json({ error: "Snapshot not found" });
        // Decode before creating the reversible backup. A corrupt compressed
        // snapshot must not mutate history and then fail during the restore.
        const restoredElements = (0, snapshotCodec_1.decodeSnapshotField)(snapshot.elements);
        const restoredAppState = (0, snapshotCodec_1.decodeSnapshotField)(snapshot.appState);
        const restoredFiles = (0, snapshotCodec_1.decodeSnapshotField)(snapshot.files);
        // Plain snapshots can also be corrupt. The read path's JSON fallback
        // must never turn invalid history into a successful empty-scene restore.
        try {
            const elements = JSON.parse(restoredElements);
            const appState = JSON.parse(restoredAppState);
            const files = JSON.parse(restoredFiles);
            const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
            if (!Array.isArray(elements) ||
                !isRecord(appState) ||
                !isRecord(files)) {
                throw new Error("Invalid snapshot structure");
            }
        }
        catch {
            return res.status(400).json({
                error: "Invalid drawing history snapshot",
                message: "The snapshot cannot be restored without losing drawing data.",
            });
        }
        // Share the save path's transaction and version guard: the backup and
        // restore must succeed together, without overwriting a concurrent save.
        let updated;
        try {
            const result = await (0, sceneUpdate_1.applySceneUpdateTx)({
                prisma,
                drawingId: id,
                parseJsonField,
                versionGuard: drawing.version,
                mutate: () => ({
                    data: {
                        elements: restoredElements,
                        appState: restoredAppState,
                        files: restoredFiles,
                        preview: null,
                    },
                }),
            });
            updated = result.drawing;
        }
        catch (error) {
            if ((0, sceneUpdate_1.isVersionConflict)(error)) {
                return res.status(409).json({
                    error: "Drawing changed during restore; please try again",
                    code: "VERSION_CONFLICT",
                });
            }
            throw error;
        }
        invalidateDrawingsCache();
        return res.json({
            ...updated,
            elements: parseJsonField(updated.elements, []),
            appState: parseJsonField(updated.appState, {}),
            files: parseJsonField(updated.files, {}),
            accessLevel: access,
        });
    }));
};
exports.registerDrawingHistoryRoutes = registerDrawingHistoryRoutes;
