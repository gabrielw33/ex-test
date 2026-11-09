"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFilesDiff = exports.fileIdFromS3Key = exports.collectReferencedFileIds = exports.VALID_STORAGE_FILE_ID = void 0;
exports.VALID_STORAGE_FILE_ID = /^[\w-]{1,200}$/;
const collectReferencedFileIds = (elements, includeDeleted) => {
    const ids = new Set();
    for (const el of elements) {
        if (!includeDeleted && el.isDeleted)
            continue;
        if (el.type === "image" && typeof el.fileId === "string" && el.fileId) {
            ids.add(el.fileId);
        }
    }
    return ids;
};
exports.collectReferencedFileIds = collectReferencedFileIds;
const fileIdFromS3Key = (key) => {
    const lastSegment = key.split("/").pop();
    if (!lastSegment)
        return null;
    const dotIndex = lastSegment.lastIndexOf(".");
    if (dotIndex <= 0)
        return lastSegment;
    return lastSegment.substring(0, dotIndex);
};
exports.fileIdFromS3Key = fileIdFromS3Key;
const buildFilesDiff = ({ allCanvasRefs, activeCanvasRefs, sqliteFileIds, storedRecords, s3Objects, }) => {
    const recordMap = new Map(storedRecords.map((record) => [record.fileId, record]));
    const s3ObjectMap = new Map(s3Objects.map((object) => [(0, exports.fileIdFromS3Key)(object.key), object]));
    const allFileIds = new Set([
        ...allCanvasRefs,
        ...sqliteFileIds,
        ...storedRecords.map((record) => record.fileId),
    ]);
    for (const object of s3Objects) {
        const fileId = (0, exports.fileIdFromS3Key)(object.key);
        if (fileId)
            allFileIds.add(fileId);
    }
    return Array.from(allFileIds).map((fileId) => {
        const record = recordMap.get(fileId);
        const s3Object = s3ObjectMap.get(fileId);
        return {
            fileId,
            inCanvas: allCanvasRefs.has(fileId),
            inCanvasActive: activeCanvasRefs.has(fileId),
            inSqlite: sqliteFileIds.has(fileId),
            // In db-mode there is no S3 object; a DrawingFile row (storage="db")
            // that carries bytes is the equivalent "object present" signal.
            inS3: Boolean(s3Object) || record?.storage === "db",
            inS3Record: Boolean(record),
            s3Key: record?.s3Key ?? s3Object?.key ?? null,
            mimeType: record?.mimeType ?? null,
            s3SizeBytes: s3Object?.size ?? record?.sizeBytes ?? null,
        };
    });
};
exports.buildFilesDiff = buildFilesDiff;
