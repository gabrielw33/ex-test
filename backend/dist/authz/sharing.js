"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOwnerAccess = exports.canEditDrawing = exports.canViewDrawing = exports.getDrawingAccess = exports.hashShareLinkToken = exports.buildShareLinkToken = exports.normalizeDrawingPermission = void 0;
const crypto_1 = __importDefault(require("crypto"));
const tokenSecurity_1 = require("../auth/tokenSecurity");
const normalizeDrawingPermission = (input) => {
    if (input === "view" || input === "edit")
        return input;
    return null;
};
exports.normalizeDrawingPermission = normalizeDrawingPermission;
const buildShareLinkToken = () => crypto_1.default.randomBytes(24).toString("base64url");
exports.buildShareLinkToken = buildShareLinkToken;
const hashShareLinkToken = (token) => (0, tokenSecurity_1.hashTokenForStorage)(token);
exports.hashShareLinkToken = hashShareLinkToken;
const getDrawingAccess = async (params) => {
    const nowMs = (params.now ?? new Date()).getTime();
    let baseAccess = "none";
    // User-based access (owner or explicit ACL).
    if (params.principal?.kind === "user") {
        const drawing = await params.prisma.drawing.findUnique({
            where: { id: params.drawingId },
            select: { userId: true, collectionId: true },
        });
        if (!drawing)
            return "none";
        if (drawing.userId === params.principal.userId)
            return "owner";
        const perm = await params.prisma.drawingPermission.findUnique({
            where: {
                drawingId_granteeUserId: {
                    drawingId: params.drawingId,
                    granteeUserId: params.principal.userId,
                },
            },
            select: { permission: true },
        });
        baseAccess = (0, exports.normalizeDrawingPermission)(perm?.permission) ?? baseAccess;
        // A drawing inherits the strongest access available from its collection.
        // This matters when a direct drawing grant is weaker than the collection grant.
        if (drawing.collectionId) {
            const ownedCollection = await params.prisma.collection.findFirst({
                where: {
                    id: drawing.collectionId,
                    userId: params.principal.userId,
                },
                select: { id: true },
            });
            if (ownedCollection) {
                baseAccess = "owner";
            }
            else {
                const collectionShare = await params.prisma.collectionShare.findFirst({
                    where: {
                        collectionId: drawing.collectionId,
                        granteeUserId: params.principal.userId,
                    },
                    select: { role: true },
                });
                const collectionAccess = (0, exports.normalizeDrawingPermission)(collectionShare?.role) ?? "none";
                baseAccess = maxAccess(baseAccess, collectionAccess);
            }
        }
    }
    // Google Docs-style link policy: applies regardless of whether the visitor is signed in.
    // If a drawing has an active link-share policy, possession of the drawing id URL grants the policy access.
    const linkPolicy = await getActiveLinkShareAccess({
        prisma: params.prisma,
        drawingId: params.drawingId,
        nowMs,
    });
    const linkAccess = linkPolicy ?? "none";
    return maxAccess(baseAccess, linkAccess);
};
exports.getDrawingAccess = getDrawingAccess;
const canViewDrawing = (access) => access !== "none";
exports.canViewDrawing = canViewDrawing;
const canEditDrawing = (access) => access === "edit" || access === "owner";
exports.canEditDrawing = canEditDrawing;
const isOwnerAccess = (access) => access === "owner";
exports.isOwnerAccess = isOwnerAccess;
const getActiveLinkShareAccess = async (params) => {
    const linkShare = await params.prisma.drawingLinkShare.findFirst({
        where: {
            drawingId: params.drawingId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(params.nowMs) } }],
        },
        orderBy: { createdAt: "desc" },
        select: { permission: true },
    });
    return (0, exports.normalizeDrawingPermission)(linkShare?.permission);
};
const accessRank = (access) => {
    switch (access) {
        case "owner":
            return 3;
        case "edit":
            return 2;
        case "view":
            return 1;
        default:
            return 0;
    }
};
const maxAccess = (a, b) => accessRank(a) >= accessRank(b) ? a : b;
