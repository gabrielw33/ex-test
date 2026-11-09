"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuditLogs = exports.logAuditEvent = exports.setAuditPrismaProvider = void 0;
/**
 * Audit logging utility for security events
 */
const prisma_1 = require("../db/prisma");
let prismaProvider = () => prisma_1.prisma;
const setAuditPrismaProvider = (provider) => {
    prismaProvider = provider ?? (() => prisma_1.prisma);
};
exports.setAuditPrismaProvider = setAuditPrismaProvider;
/**
 * Log a security event to the audit log
 * This should be called for important security-related actions
 * Gracefully handles missing audit log table (feature disabled)
 */
const logAuditEvent = async (data) => {
    try {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        if (!config.enableAuditLogging) {
            return; // Feature disabled, silently skip
        }
        await prismaProvider().auditLog.create({
            data: {
                userId: data.userId || null,
                action: data.action,
                resource: data.resource || null,
                ipAddress: data.ipAddress || null,
                userAgent: data.userAgent || null,
                details: data.details ? JSON.stringify(data.details) : null,
            },
        });
    }
    catch (error) {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        if (config.isDev) {
            console.debug("Audit logging skipped (feature disabled or table missing):", error);
        }
    }
};
exports.logAuditEvent = logAuditEvent;
/**
 * Get audit logs for a user (or all users if userId is not provided)
 * Returns empty array if audit logging is disabled or table doesn't exist
 */
const getAuditLogs = async (userId, limit = 100) => {
    try {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        if (!config.enableAuditLogging) {
            return []; // Feature disabled, return empty array
        }
        const logs = await prismaProvider().auditLog.findMany({
            where: userId ? { userId } : undefined,
            orderBy: { createdAt: "desc" },
            take: limit,
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                    },
                },
            },
        });
        return logs.map((log) => ({
            ...log,
            details: (() => {
                if (!log.details)
                    return null;
                try {
                    return JSON.parse(log.details);
                }
                catch {
                    return null;
                }
            })(),
        }));
    }
    catch (error) {
        const { config } = await Promise.resolve().then(() => __importStar(require("../config")));
        if (config.isDev) {
            console.debug("Failed to retrieve audit logs (feature disabled or table missing):", error);
        }
        return [];
    }
};
exports.getAuditLogs = getAuditLogs;
