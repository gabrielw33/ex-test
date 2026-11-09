"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectRetainedDrawingFileIds = void 0;
const snapshotCodec_1 = require("../../snapshots/snapshotCodec");
/**
 * References are scoped to a drawing's live scene and retained history.
 * Call inside the cleanup transaction so a restore cannot race reclamation.
 * Unknown/corrupt history returns null: keeping bytes is safer than treating
 * an unreadable snapshot as evidence that its images are unreferenced.
 */
const collectRetainedDrawingFileIds = async (prisma, drawingId) => {
    const current = await prisma.drawing.findUnique({
        where: { id: drawingId },
        select: { elements: true, files: true },
    });
    const snapshots = await prisma.drawingSnapshot.findMany({
        where: { drawingId },
        select: { elements: true, files: true },
    });
    const retained = new Set();
    try {
        for (const scene of [...(current ? [current] : []), ...snapshots]) {
            const elements = JSON.parse((0, snapshotCodec_1.decodeSnapshotField)(scene.elements));
            const files = JSON.parse((0, snapshotCodec_1.decodeSnapshotField)(scene.files));
            if (!Array.isArray(elements) ||
                !files ||
                typeof files !== "object" ||
                Array.isArray(files)) {
                return null;
            }
            for (const fileId of Object.keys(files))
                retained.add(fileId);
            for (const element of elements) {
                if (element &&
                    typeof element === "object" &&
                    typeof element.fileId === "string") {
                    retained.add(element.fileId);
                }
            }
        }
    }
    catch {
        return null;
    }
    return retained;
};
exports.collectRetainedDrawingFileIds = collectRetainedDrawingFileIds;
