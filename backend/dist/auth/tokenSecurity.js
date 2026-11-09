"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenLookupCandidates = exports.hashTokenForStorage = void 0;
const crypto_1 = __importDefault(require("crypto"));
const hashTokenForStorage = (token) => crypto_1.default.createHash("sha256").update(token, "utf8").digest("hex");
exports.hashTokenForStorage = hashTokenForStorage;
const getTokenLookupCandidates = (token) => {
    const candidates = new Set();
    candidates.add(token);
    candidates.add((0, exports.hashTokenForStorage)(token));
    return [...candidates];
};
exports.getTokenLookupCandidates = getTokenLookupCandidates;
