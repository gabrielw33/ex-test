"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDrawingReadRoutes = void 0;
const sharing_1 = require("../../authz/sharing");
const trash_1 = require("./trash");
const registerDrawingReadRoutes = (app, context) => {
    const { prisma, optionalAuth, asyncHandler, parseJsonField, getRequestPrincipal, respondWithAuthErrorIfPresent, } = context;
    app.get("/drawings/:id", optionalAuth, asyncHandler(async (req, res) => {
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
            return res.status(404).json({
                error: "Drawing not found",
                message: "Drawing does not exist",
            });
        }
        const drawing = await prisma.drawing.findUnique({ where: { id } });
        if (!drawing) {
            return res.status(404).json({
                error: "Drawing not found",
                message: "Drawing does not exist",
            });
        }
        const isOwner = principal?.kind === "user" && principal.userId === drawing.userId;
        return res.json({
            ...drawing,
            // Collections (and trash mapping) are owner-scoped. For shared/public access, avoid leaking
            // owner collection ids like `trash:<ownerId>` and avoid implying the viewer can organize it.
            collectionId: isOwner
                ? (0, trash_1.toPublicTrashCollectionId)(drawing.collectionId, drawing.userId)
                : null,
            elements: parseJsonField(drawing.elements, []),
            appState: parseJsonField(drawing.appState, {}),
            files: parseJsonField(drawing.files, {}),
            accessLevel: access,
        });
    }));
};
exports.registerDrawingReadRoutes = registerDrawingReadRoutes;
