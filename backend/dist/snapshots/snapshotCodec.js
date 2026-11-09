"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeSnapshotPayload = exports.decodeSnapshotField = exports.encodeSnapshotField = exports.isEncodedSnapshotField = void 0;
const node_zlib_1 = require("node:zlib");
const PREFIX = "br1:";
const QUALITY = 5;
// This exceeds the default 50 MiB request-body limit while preventing a
// corrupted or tampered compressed field from expanding without a bound.
const MAX_DECOMPRESSED_FIELD_BYTES = 128 * 1024 * 1024;
const isEncodedSnapshotField = (value) => value.startsWith(PREFIX);
exports.isEncodedSnapshotField = isEncodedSnapshotField;
const encodeSnapshotField = (value, enabled = true) => {
    if (!enabled || !value || (0, exports.isEncodedSnapshotField)(value))
        return value;
    // Keep large fields readable: the decoder intentionally refuses to inflate
    // more than this limit, but legacy/raw fields are not subject to it.
    if (Buffer.byteLength(value, "utf8") > MAX_DECOMPRESSED_FIELD_BYTES) {
        return value;
    }
    try {
        const compressed = (0, node_zlib_1.brotliCompressSync)(Buffer.from(value, "utf8"), {
            params: { [node_zlib_1.constants.BROTLI_PARAM_QUALITY]: QUALITY },
        });
        const encoded = PREFIX + compressed.toString("base64");
        return encoded.length < value.length ? encoded : value;
    }
    catch (error) {
        console.warn("Snapshot compression failed, storing raw payload", { error });
        return value;
    }
};
exports.encodeSnapshotField = encodeSnapshotField;
const decodeSnapshotField = (value) => {
    if (!value || !(0, exports.isEncodedSnapshotField)(value))
        return value;
    try {
        const raw = Buffer.from(value.slice(PREFIX.length), "base64");
        return (0, node_zlib_1.brotliDecompressSync)(raw, {
            maxOutputLength: MAX_DECOMPRESSED_FIELD_BYTES,
        }).toString("utf8");
    }
    catch (error) {
        console.error("Failed to decompress snapshot payload", { error });
        throw new Error("SNAPSHOT_DECODE_FAILED");
    }
};
exports.decodeSnapshotField = decodeSnapshotField;
const decodeSnapshotPayload = (snapshot) => ({
    ...snapshot,
    elements: (0, exports.decodeSnapshotField)(snapshot.elements),
    appState: (0, exports.decodeSnapshotField)(snapshot.appState),
    files: (0, exports.decodeSnapshotField)(snapshot.files),
});
exports.decodeSnapshotPayload = decodeSnapshotPayload;
