"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPublicTrashCollectionId = exports.toInternalTrashCollectionId = exports.isTrashCollectionId = exports.getUserTrashCollectionId = void 0;
const getUserTrashCollectionId = (userId) => `trash:${userId}`;
exports.getUserTrashCollectionId = getUserTrashCollectionId;
const isTrashCollectionId = (collectionId, userId) => Boolean(collectionId) &&
    (collectionId === "trash" ||
        collectionId === (0, exports.getUserTrashCollectionId)(userId));
exports.isTrashCollectionId = isTrashCollectionId;
const toInternalTrashCollectionId = (collectionId, userId) => collectionId === "trash" ? (0, exports.getUserTrashCollectionId)(userId) : collectionId;
exports.toInternalTrashCollectionId = toInternalTrashCollectionId;
const toPublicTrashCollectionId = (collectionId, userId) => (0, exports.isTrashCollectionId)(collectionId, userId) ? "trash" : collectionId;
exports.toPublicTrashCollectionId = toPublicTrashCollectionId;
