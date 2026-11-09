"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOrphanDeletePlan = exports.buildFilesDiffResponse = exports.buildTrimS3CleanupPlan = exports.buildTrimPlan = void 0;
const helpers_1 = require("./helpers");
const buildTrimPlan = (elements, files) => {
    const activeElements = elements.filter((el) => !el.isDeleted);
    const survivingFileIds = (0, helpers_1.collectReferencedFileIds)(activeElements, false);
    const cleanedFiles = {};
    for (const [fileId, value] of Object.entries(files)) {
        if (survivingFileIds.has(fileId)) {
            cleanedFiles[fileId] = value;
        }
    }
    return {
        activeElements,
        cleanedFiles,
        survivingFileIds,
        elementsRemoved: elements.length - activeElements.length,
        filesRemoved: Object.keys(files).length - Object.keys(cleanedFiles).length,
    };
};
exports.buildTrimPlan = buildTrimPlan;
const buildTrimS3CleanupPlan = ({ survivingFileIds, storedRecords, }) => {
    const orphanKeys = new Set();
    const orphanFileIds = new Set();
    for (const record of storedRecords) {
        if (!survivingFileIds.has(record.fileId)) {
            // db-mode rows have no s3Key/object; only their DrawingFile row needs
            // to be reclaimed. s3-mode rows also strand an object to delete.
            if (record.s3Key)
                orphanKeys.add(record.s3Key);
            orphanFileIds.add(record.fileId);
        }
    }
    return {
        orphanKeys: Array.from(orphanKeys),
        orphanFileIds: Array.from(orphanFileIds),
    };
};
exports.buildTrimS3CleanupPlan = buildTrimS3CleanupPlan;
const buildFilesDiffResponse = ({ elements, files, storedRecords, s3Objects, }) => {
    const allCanvasRefs = (0, helpers_1.collectReferencedFileIds)(elements, true);
    const activeCanvasRefs = (0, helpers_1.collectReferencedFileIds)(elements, false);
    const sqliteFileIds = new Set(Object.keys(files));
    // In db-mode there are no S3 objects; the stored-blob count is the number
    // of DrawingFile rows instead.
    const totalStoredFiles = s3Objects.length > 0 ? s3Objects.length : storedRecords.length;
    return {
        summary: {
            totalCanvasRefs: allCanvasRefs.size,
            totalSqliteFiles: sqliteFileIds.size,
            totalS3Files: totalStoredFiles,
        },
        files: (0, helpers_1.buildFilesDiff)({
            allCanvasRefs,
            activeCanvasRefs,
            sqliteFileIds,
            storedRecords,
            s3Objects,
        }),
    };
};
exports.buildFilesDiffResponse = buildFilesDiffResponse;
const buildOrphanDeletePlan = ({ elements, files, fileIds, }) => {
    const activeRefs = (0, helpers_1.collectReferencedFileIds)(elements, false);
    const blockedIds = fileIds.filter((fid) => activeRefs.has(fid));
    const deletedFileIdSet = new Set(fileIds);
    const cleanedFiles = { ...files };
    for (const fileId of fileIds) {
        delete cleanedFiles[fileId];
    }
    const cleanedElements = elements.filter((el) => {
        return !(el.isDeleted &&
            el.type === "image" &&
            typeof el.fileId === "string" &&
            deletedFileIdSet.has(el.fileId));
    });
    return {
        blockedIds,
        cleanedFiles,
        cleanedElements,
        deletedCount: fileIds.length,
    };
};
exports.buildOrphanDeletePlan = buildOrphanDeletePlan;
