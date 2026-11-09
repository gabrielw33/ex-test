"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteS3KeysInBatches = void 0;
const S3_DELETE_CONCURRENCY = 8;
const deleteS3KeysInBatches = async ({ keys, logPrefix, deleteObject, }) => {
    let deleted = 0;
    let errors = 0;
    for (let i = 0; i < keys.length; i += S3_DELETE_CONCURRENCY) {
        const batch = keys.slice(i, i + S3_DELETE_CONCURRENCY);
        const results = await Promise.allSettled(batch.map((key) => deleteObject(key)));
        for (let j = 0; j < results.length; j++) {
            const result = results[j];
            if (result.status === "fulfilled") {
                deleted++;
            }
            else {
                console.error(`${logPrefix} Failed to delete S3 object: ${batch[j]}`, result.reason);
                errors++;
            }
        }
    }
    return { deleted, errors };
};
exports.deleteS3KeysInBatches = deleteS3KeysInBatches;
