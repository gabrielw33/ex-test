"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.revalidateRoomSockets = exports.removeSocketFromRooms = void 0;
const sharing_1 = require("../authz/sharing");
// Remove a socket's presence from each of the given rooms, deleting the room
// entry entirely once it is empty (so `roomUsers` never accumulates dead
// rooms). Returns the ids of rooms whose membership actually changed.
const removeSocketFromRooms = (roomUsers, roomIds, socketId) => {
    const changed = [];
    for (const roomId of roomIds) {
        const users = roomUsers.get(roomId);
        if (!users)
            continue;
        const index = users.findIndex((u) => u.socketId === socketId);
        if (index === -1)
            continue;
        users.splice(index, 1);
        if (users.length === 0) {
            roomUsers.delete(roomId);
        }
        else {
            roomUsers.set(roomId, users);
        }
        changed.push(roomId);
    }
    return changed;
};
exports.removeSocketFromRooms = removeSocketFromRooms;
// Re-validate a set of sockets against a drawing's current access policy and
// disconnect any that can no longer view it (revoked share / expired link, B15).
const revalidateRoomSockets = async (params) => {
    const { prisma, drawingId, roomUsers, sockets, emitPresence } = params;
    const roomId = `drawing_${drawingId}`;
    for (const socket of sockets) {
        // Force a fresh check by dropping any cached grant for this drawing.
        socket.data.access?.delete(drawingId);
        const principal = socket.data.principal ?? null;
        let access = "none";
        try {
            access = await (0, sharing_1.getDrawingAccess)({ prisma, principal, drawingId });
        }
        catch (error) {
            console.error("Failed to revalidate drawing socket access:", error);
        }
        if (!(0, sharing_1.canViewDrawing)(access)) {
            const changed = (0, exports.removeSocketFromRooms)(roomUsers, [roomId], socket.id);
            for (const changedRoomId of changed) {
                emitPresence(changedRoomId, roomUsers.get(changedRoomId) ?? []);
            }
            socket.data.joinedRooms?.delete(roomId);
            socket.emit("error", {
                message: "Your access to this drawing was revoked",
            });
            socket.disconnect(true);
        }
        else {
            socket.data.access?.set(drawingId, {
                access: access === "owner" ? "owner" : access,
                checkedAtMs: Date.now(),
            });
        }
    }
};
exports.revalidateRoomSockets = revalidateRoomSockets;
