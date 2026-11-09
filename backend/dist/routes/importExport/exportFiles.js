"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.embedDrawingFilesForExport = void 0;
const s3_1 = require("../../s3");
const isUnmanagedExternalReference = (value) => {
    if (value.length > 2048 || !/^https?:\/\//i.test(value))
        return false;
    try {
        const url = new URL(value);
        // Absolute URLs to the managed endpoint still require stored bytes.
        return !/^\/api\/files(?:\/|$)/i.test(url.pathname);
    }
    catch {
        return false;
    }
};
/**
 * Make exported drawings portable by replacing managed file references with
 * inline data URLs. DrawingFile is authoritative even when Drawing.files has
 * a public CDN URL rather than an /api/files URL.
 * Imported external HTTP(S) references without a DrawingFile remain unchanged,
 * as supported by the v1 backup importer. Never fetch user-supplied URLs here:
 * these images remain dependent on their original host rather than portable.
 */
const embedDrawingFilesForExport = async (files, records) => {
    const embedded = { ...files };
    for (const record of records) {
        const file = embedded[record.fileId];
        if (!file || typeof file !== "object" || Array.isArray(file))
            continue;
        let bytes;
        if (record.storage === "db") {
            if (!record.data) {
                throw new Error(`Stored drawing file is missing database bytes: ${record.fileId}`);
            }
            bytes = Buffer.isBuffer(record.data)
                ? record.data
                : Buffer.from(record.data);
        }
        else if (record.storage === "s3") {
            if (!record.s3Key) {
                throw new Error(`Stored drawing file is missing its S3 key: ${record.fileId}`);
            }
            bytes = await (0, s3_1.downloadBuffer)(record.s3Key);
        }
        else {
            throw new Error(`Unsupported drawing file storage: ${record.storage}`);
        }
        embedded[record.fileId] = {
            ...file,
            dataURL: `data:${record.mimeType};base64,${bytes.toString("base64")}`,
        };
    }
    const unresolved = Object.entries(embedded)
        .filter(([, file]) => {
        if (!file || typeof file !== "object" || Array.isArray(file))
            return false;
        const dataURL = file.dataURL;
        return (typeof dataURL === "string" &&
            dataURL.length > 0 &&
            !dataURL.startsWith("data:") &&
            !isUnmanagedExternalReference(dataURL));
    })
        .map(([fileId]) => fileId);
    if (unresolved.length > 0) {
        throw new Error(`Could not bundle ${unresolved.length} drawing image(s): ${unresolved.join(", ")}`);
    }
    return embedded;
};
exports.embedDrawingFilesForExport = embedDrawingFilesForExport;
