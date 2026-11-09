"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpServer = exports.app = exports.sanitizeDrawingUpdateData = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const fs_2 = require("fs");
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const worker_threads_1 = require("worker_threads");
const multer_1 = __importDefault(require("multer"));
const zod_1 = require("zod");
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const uuid_1 = require("uuid");
const security_1 = require("./security");
const config_1 = require("./config");
const auth_1 = require("./middleware/auth");
const errorHandler_1 = require("./middleware/errorHandler");
const auth_2 = __importDefault(require("./auth"));
const audit_1 = require("./utils/audit");
const dashboard_1 = require("./routes/dashboard");
const importExport_1 = require("./routes/importExport");
const system_1 = require("./routes/system");
const files_1 = require("./routes/files");
const storage_1 = require("./routes/storage");
const prisma_1 = require("./db/prisma");
const sqliteMaintenance_1 = require("./db/sqliteMaintenance");
const drawingsCache_1 = require("./server/drawingsCache");
const csrf_1 = require("./server/csrf");
const socket_1 = require("./server/socket");
const httpsRedirectPolicy_1 = require("./server/httpsRedirectPolicy");
const bootstrapSetupCode_1 = require("./auth/bootstrapSetupCode");
const fileProcessing_1 = require("./fileProcessing");
const s3_1 = require("./s3");
const scheduler_1 = require("./backups/scheduler");
const storageDoctor_1 = require("./server/storageDoctor");
const backendRoot = path_1.default.resolve(__dirname, "../");
const redactDatabaseUrl = (value) => {
    if (!value)
        return "<unset>";
    if (value.startsWith("file:"))
        return value;
    try {
        const parsed = new URL(value);
        if (parsed.username)
            parsed.username = "***";
        if (parsed.password)
            parsed.password = "***";
        return parsed.toString();
    }
    catch {
        return "<redacted>";
    }
};
console.log("Resolved DATABASE_URL:", redactDatabaseUrl(config_1.config.databaseUrl));
if (config_1.config.s3.bucket) {
    (0, s3_1.initS3)({
        bucket: config_1.config.s3.bucket,
        region: config_1.config.s3.region,
        endpoint: config_1.config.s3.endpoint ?? undefined,
        publicUrl: config_1.config.s3.publicUrl ?? undefined,
        forcePathStyle: config_1.config.s3.forcePathStyle,
        accessKeyId: config_1.config.s3.accessKeyId ?? undefined,
        secretAccessKey: config_1.config.s3.secretAccessKey ?? undefined,
    });
    console.log("S3 image storage enabled", {
        bucket: config_1.config.s3.bucket,
        region: config_1.config.s3.region,
    });
}
const normalizeOrigins = (rawOrigins) => {
    const fallback = "http://localhost:6767";
    if (!rawOrigins || rawOrigins.trim().length === 0) {
        return [fallback];
    }
    const ensureProtocol = (origin) => /^https?:\/\//i.test(origin) ? origin : `http://${origin}`;
    const removeTrailingSlash = (origin) => origin.endsWith("/") ? origin.slice(0, -1) : origin;
    const parsed = rawOrigins
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
        .map(ensureProtocol)
        .map(removeTrailingSlash);
    return parsed.length > 0 ? parsed : [fallback];
};
const allowedOrigins = normalizeOrigins(config_1.config.frontendUrl);
console.log("Allowed origins:", allowedOrigins);
const isDev = !config_1.config.isProduction;
const isLocalDevOrigin = (origin) => {
    return (/^http:\/\/localhost:\d+$/i.test(origin) ||
        /^http:\/\/127\.0\.0\.1:\d+$/i.test(origin));
};
const isAllowedOrigin = (origin) => {
    if (!origin)
        return true;
    if (allowedOrigins.includes(origin))
        return true;
    if (isDev && isLocalDevOrigin(origin))
        return true;
    return false;
};
const uploadDir = path_1.default.resolve(__dirname, "../uploads");
const MAX_UPLOAD_SIZE_BYTES = config_1.config.uploadMaxBytes;
const BODY_LIMIT = `${config_1.config.bodyLimitMb}mb`;
const BODY_LIMIT_BYTES = config_1.config.bodyLimitMb * 1024 * 1024;
const MAX_PAGE_SIZE = 200;
const MAX_IMPORT_ARCHIVE_ENTRIES = 6000;
const MAX_IMPORT_COLLECTIONS = 1000;
const MAX_IMPORT_DRAWINGS = 5000;
const MAX_IMPORT_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_TOTAL_EXTRACTED_BYTES = 120 * 1024 * 1024;
const MAX_IMPORT_DRAWING_BYTES = Math.min(config_1.config.uploadMaxBytes, MAX_IMPORT_TOTAL_EXTRACTED_BYTES);
let cachedBackendVersion = null;
const getBackendVersion = () => {
    if (cachedBackendVersion)
        return cachedBackendVersion;
    const versionPaths = [
        path_1.default.resolve(backendRoot, "VERSION"),
        path_1.default.resolve(backendRoot, "../VERSION"),
    ];
    for (const versionPath of versionPaths) {
        try {
            const version = fs_1.default.readFileSync(versionPath, "utf8").trim();
            if (version) {
                const label = config_1.config.buildLabel;
                cachedBackendVersion =
                    label &&
                        (label === version ||
                            (label.startsWith(`${version}-dev.`) &&
                                /^\d+\.\d+\.\d+-dev\.[0-9a-f]{7,40}$/.test(label)))
                        ? label
                        : version;
                return cachedBackendVersion;
            }
        }
        catch {
            // Try the next runtime layout.
        }
    }
    cachedBackendVersion = "unknown";
    return cachedBackendVersion;
};
const initializeUploadDir = async () => {
    try {
        await fs_2.promises.mkdir(uploadDir, { recursive: true });
    }
    catch (error) {
        console.error("Failed to create upload directory:", error);
    }
};
const app = (0, express_1.default)();
exports.app = app;
const trustProxyValue = config_1.config.trustProxy;
app.set("trust proxy", trustProxyValue);
if (trustProxyValue === true) {
    console.log("[config] trust proxy: enabled (handles multiple proxy layers)");
}
else {
    console.log(`[config] trust proxy: ${trustProxyValue}`);
}
const httpServer = (0, http_1.createServer)(app);
exports.httpServer = httpServer;
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: (origin, cb) => cb(null, isAllowedOrigin(origin ?? undefined)),
        credentials: true,
    },
    maxHttpBufferSize: BODY_LIMIT_BYTES,
});
const parseJsonField = (rawValue, fallback) => {
    if (!rawValue)
        return fallback;
    try {
        return JSON.parse(rawValue);
    }
    catch (error) {
        console.warn("Failed to parse JSON field", {
            error,
            valuePreview: rawValue.slice(0, 50),
        });
        return fallback;
    }
};
const DRAWINGS_CACHE_TTL_MS = config_1.config.drawingsCacheTtlMs;
const { buildDrawingsCacheKey, getCachedDrawingsBody, cacheDrawingsResponse, invalidateDrawingsCache, } = (0, drawingsCache_1.createDrawingsCacheStore)(DRAWINGS_CACHE_TTL_MS);
const getUserTrashCollectionId = (userId) => `trash:${userId}`;
const ensureTrashCollection = async (db, userId) => {
    const trashCollectionId = getUserTrashCollectionId(userId);
    const trashCollection = await db.collection.findFirst({
        where: { id: trashCollectionId, userId },
    });
    if (!trashCollection) {
        await db.collection.create({
            data: { id: trashCollectionId, name: "Trash", userId },
        });
    }
    await db.drawing.updateMany({
        where: { userId, collectionId: "trash" },
        data: { collectionId: trashCollectionId },
    });
};
const PORT = config_1.config.port;
const upload = (0, multer_1.default)({
    dest: uploadDir,
    limits: { fileSize: MAX_UPLOAD_SIZE_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === "db") {
            const isSqliteDb = file.originalname.endsWith(".db") ||
                file.originalname.endsWith(".sqlite");
            if (!isSqliteDb) {
                return cb(new Error("Only .db or .sqlite files are allowed"));
            }
        }
        cb(null, true);
    },
});
app.use((req, res, next) => {
    const requestId = (0, uuid_1.v4)();
    req.headers["x-request-id"] = requestId;
    res.setHeader("X-Request-ID", requestId);
    next();
});
const shouldEnforceHttps = config_1.config.nodeEnv === "production" &&
    config_1.config.enforceHttpsRedirect &&
    allowedOrigins.some((origin) => origin.toLowerCase().startsWith("https://"));
if (shouldEnforceHttps) {
    const httpsRedirectPolicy = (0, httpsRedirectPolicy_1.createHttpsRedirectPolicy)(allowedOrigins);
    app.use((req, res, next) => {
        const redirectUrl = (0, httpsRedirectPolicy_1.getHttpsRedirectUrl)(req, httpsRedirectPolicy);
        if (!redirectUrl)
            return next();
        return res.redirect(redirectUrl);
    });
}
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'none'"],
            baseUri: ["'none'"],
            formAction: ["'none'"],
            frameAncestors: ["'none'"],
            objectSrc: ["'none'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
        },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
app.use((0, cors_1.default)({
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin ?? undefined)),
    credentials: true,
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "x-csrf-token",
        "x-imported-file",
    ],
    exposedHeaders: ["x-csrf-token", "x-request-id"],
}));
app.use(express_1.default.json({ limit: BODY_LIMIT }));
app.use(express_1.default.urlencoded({ extended: true, limit: BODY_LIMIT }));
app.use((req, res, next) => {
    const requestId = req.headers["x-request-id"] || "unknown";
    const contentLength = req.headers["content-length"];
    const userEmail = req.user?.email || "anonymous";
    if (contentLength) {
        const sizeInMB = parseInt(contentLength, 10) / 1024 / 1024;
        if (sizeInMB > 10) {
            console.log(`[LARGE REQUEST] ${req.method} ${req.path} - ${sizeInMB.toFixed(2)}MB - User: ${userEmail} - RequestID: ${requestId}`);
        }
    }
    console.log(`[REQUEST] ${req.method} ${req.path} - User: ${userEmail} - IP: ${req.ip} - RequestID: ${requestId}`);
    next();
});
const RATE_LIMIT_WINDOW = config_1.config.rateLimitWindowMs;
const generalRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: RATE_LIMIT_WINDOW,
    max: config_1.config.rateLimitMaxRequests,
    message: {
        error: "Rate limit exceeded",
        message: "Too many requests, please try again later",
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
});
app.use(generalRateLimiter);
(0, csrf_1.registerCsrfProtection)({
    app,
    isAllowedOrigin,
    maxRequestsPerWindow: config_1.config.csrfMaxRequests,
    rateLimitWindowMs: config_1.config.csrfRateLimitWindowMs,
    enableDebugLogging: config_1.config.debugCsrf,
});
app.use("/auth", auth_2.default);
const filesFieldSchema = zod_1.z
    .union([zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()), zod_1.z.null()])
    .optional()
    .transform((value) => (value === null ? undefined : value));
const drawingBaseSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(255).optional(),
    collectionId: zod_1.z.union([zod_1.z.string().trim().min(1), zod_1.z.null()]).optional(),
    preview: zod_1.z.string().nullable().optional(),
});
const drawingCreateSchema = drawingBaseSchema
    .extend({
    elements: security_1.elementSchema.array().default([]),
    appState: security_1.appStateSchema.default({}),
    files: filesFieldSchema,
})
    .refine((data) => {
    try {
        const sanitized = (0, security_1.sanitizeDrawingData)(data);
        Object.assign(data, sanitized);
        return true;
    }
    catch (error) {
        if (error instanceof security_1.DrawingSanitizationError)
            throw error;
        console.error("Sanitization failed:", error);
        return false;
    }
}, { message: "Invalid or malicious drawing data detected" });
const drawingUpdateSchemaBase = drawingBaseSchema.extend({
    elements: security_1.elementSchema.array().optional(),
    appState: security_1.appStateSchema.optional(),
    files: filesFieldSchema,
    version: zod_1.z.number().int().positive().optional(),
});
const sanitizeDrawingUpdateData = (data) => {
    const hasSceneFields = data.elements !== undefined ||
        data.appState !== undefined ||
        data.files !== undefined;
    const hasPreviewField = data.preview !== undefined;
    const needsSanitization = hasSceneFields || hasPreviewField;
    try {
        const sanitizedData = { ...data };
        if (hasSceneFields) {
            const fullData = {
                elements: Array.isArray(data.elements) ? data.elements : [],
                appState: typeof data.appState === "object" && data.appState !== null
                    ? data.appState
                    : {},
                files: data.files || {},
                preview: data.preview,
                name: data.name,
                collectionId: data.collectionId,
            };
            const sanitized = (0, security_1.sanitizeDrawingData)(fullData);
            if (data.elements !== undefined)
                sanitizedData.elements = sanitized.elements;
            if (data.appState !== undefined)
                sanitizedData.appState = sanitized.appState;
            if (data.files !== undefined)
                sanitizedData.files = sanitized.files;
            if (data.preview !== undefined)
                sanitizedData.preview = sanitized.preview;
            Object.assign(data, sanitizedData);
        }
        else if (hasPreviewField && typeof data.preview === "string") {
            data.preview = (0, security_1.sanitizeSvg)(data.preview);
            Object.assign(data, { ...data, preview: data.preview });
        }
        else if (hasPreviewField && data.preview === null) {
            Object.assign(data, sanitizedData);
        }
        return true;
    }
    catch (error) {
        if (error instanceof security_1.DrawingSanitizationError)
            throw error;
        console.error("Sanitization failed:", error);
        if (!needsSanitization) {
            return true;
        }
        return false;
    }
};
exports.sanitizeDrawingUpdateData = sanitizeDrawingUpdateData;
const drawingUpdateSchema = drawingUpdateSchemaBase.refine((data) => (0, exports.sanitizeDrawingUpdateData)(data), { message: "Invalid or malicious drawing data detected" });
const respondWithValidationErrors = (res, issues) => {
    if (config_1.config.nodeEnv === "production") {
        res
            .status(400)
            .json({ error: "Validation error", message: "Invalid request data" });
    }
    else {
        res.status(400).json({ error: "Invalid drawing payload", details: issues });
    }
};
const collectionNameSchema = zod_1.z.string().trim().min(1).max(100);
const validateSqliteHeader = (filePath) => {
    try {
        const buffer = Buffer.alloc(16);
        const fd = fs_1.default.openSync(filePath, "r");
        const bytesRead = fs_1.default.readSync(fd, buffer, 0, 16, 0);
        fs_1.default.closeSync(fd);
        if (bytesRead < 16) {
            console.warn("File too small to be a valid SQLite database");
            return false;
        }
        const expectedHeader = Buffer.from([
            0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61,
            0x74, 0x20, 0x33, 0x00,
        ]);
        const isValid = buffer.equals(expectedHeader);
        if (!isValid) {
            console.warn("Invalid SQLite file header detected", {
                filePath,
                header: buffer.toString("hex"),
                expected: expectedHeader.toString("hex"),
            });
        }
        return isValid;
    }
    catch (error) {
        console.error("Failed to validate SQLite header:", error);
        return false;
    }
};
const verifyDatabaseIntegrityAsync = (filePath) => {
    if (!validateSqliteHeader(filePath)) {
        return Promise.resolve(false);
    }
    return new Promise((resolve) => {
        const worker = new worker_threads_1.Worker(path_1.default.resolve(__dirname, "./workers/db-verify.js"), { workerData: { filePath } });
        let settled = false;
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timeoutHandle);
            resolve(result);
        };
        worker.on("message", (isValid) => finish(isValid));
        worker.on("error", (err) => {
            console.error("Worker error:", err);
            finish(false);
        });
        worker.on("exit", (code) => {
            if (code !== 0) {
                finish(false);
            }
        });
        const timeoutHandle = setTimeout(() => {
            console.warn("Integrity check worker timed out", { filePath });
            worker.terminate();
            finish(false);
        }, 10000);
    });
};
const removeFileIfExists = async (filePath) => {
    if (!filePath)
        return;
    try {
        await fs_2.promises.access(filePath).catch(() => {
            return;
        });
        await fs_2.promises.unlink(filePath);
    }
    catch (error) {
        console.error("Failed to remove file", { filePath, error });
    }
};
const socketHandlers = (0, socket_1.registerSocketHandlers)({
    io,
    prisma: prisma_1.prisma,
    authModeService: auth_1.authModeService,
    jwtSecret: config_1.config.jwtSecret,
});
app.get("/health", async (_req, res) => {
    try {
        await prisma_1.prisma.$queryRaw `SELECT 1`;
        res.status(200).json({ status: "ok", database: "ok" });
    }
    catch (error) {
        console.error("Health check failed", error);
        res.status(503).json({ status: "error", database: "unavailable" });
    }
});
const enableOnboardingGate = config_1.config.authMode === "local" &&
    config_1.config.nodeEnv === "production" &&
    !config_1.config.disableOnboardingGate;
if (enableOnboardingGate) {
    const ONBOARDING_GATE_TTL_MS = 5_000;
    let onboardingGateCache = null;
    const isOnboardingGateBypassPath = (reqPath) => {
        if (reqPath === "/health")
            return true;
        if (reqPath === "/csrf-token")
            return true;
        if (reqPath === "/auth")
            return true;
        if (reqPath.startsWith("/auth/"))
            return true;
        return false;
    };
    const isAuthOnboardingRequired = async () => {
        const now = Date.now();
        if (onboardingGateCache &&
            now - onboardingGateCache.fetchedAt < ONBOARDING_GATE_TTL_MS) {
            return onboardingGateCache.required;
        }
        const systemConfig = await auth_1.authModeService.ensureSystemConfig();
        if (systemConfig.authEnabled || systemConfig.authOnboardingCompleted) {
            onboardingGateCache = { required: false, fetchedAt: now };
            return false;
        }
        const hasActiveUser = await prisma_1.prisma.user.findFirst({
            where: { isActive: true },
            select: { id: true },
        });
        const required = !hasActiveUser;
        onboardingGateCache = { required, fetchedAt: now };
        return required;
    };
    app.use(async (req, res, next) => {
        try {
            if (isOnboardingGateBypassPath(req.path))
                return next();
            const required = await isAuthOnboardingRequired();
            if (!required)
                return next();
            res.setHeader("Clear-Site-Data", '"cache"');
            return res.status(409).json({
                error: "Authentication onboarding required",
                code: "AUTH_ONBOARDING_REQUIRED",
                message: "Authentication onboarding is required before using the app. Refresh the page to load the latest UI and complete setup.",
                redirectTo: "/auth-setup",
            });
        }
        catch (error) {
            console.error("Auth onboarding gate error:", error);
            return next();
        }
    });
}
(0, system_1.registerSystemRoutes)(app, { asyncHandler: errorHandler_1.asyncHandler, getBackendVersion });
(0, dashboard_1.registerDashboardRoutes)(app, {
    prisma: prisma_1.prisma,
    requireAuth: auth_1.requireAuth,
    optionalAuth: auth_1.optionalAuth,
    asyncHandler: errorHandler_1.asyncHandler,
    parseJsonField,
    sanitizeText: security_1.sanitizeText,
    validateImportedDrawing: security_1.validateImportedDrawing,
    drawingCreateSchema,
    drawingUpdateSchema,
    respondWithValidationErrors,
    collectionNameSchema,
    ensureTrashCollection,
    invalidateDrawingsCache,
    buildDrawingsCacheKey,
    getCachedDrawingsBody,
    cacheDrawingsResponse,
    MAX_PAGE_SIZE,
    config: config_1.config,
    logAuditEvent: audit_1.logAuditEvent,
    internDrawingFiles: (files, userId, drawingId) => (0, fileProcessing_1.internDrawingFiles)(files, userId, drawingId, prisma_1.prisma),
    revalidateDrawingAccess: socketHandlers.revalidateDrawingAccess,
    io,
});
(0, files_1.registerFileRoutes)(app, { prisma: prisma_1.prisma, requireAuth: auth_1.requireAuth, optionalAuth: auth_1.optionalAuth, asyncHandler: errorHandler_1.asyncHandler });
(0, storage_1.registerStorageRoutes)(app, {
    prisma: prisma_1.prisma,
    requireAuth: auth_1.requireAuth,
    asyncHandler: errorHandler_1.asyncHandler,
    parseJsonField,
    invalidateDrawingsCache,
    io,
});
(0, importExport_1.registerImportExportRoutes)({
    app,
    prisma: prisma_1.prisma,
    requireAuth: auth_1.requireAuth,
    asyncHandler: errorHandler_1.asyncHandler,
    upload,
    uploadDir,
    backendRoot,
    getBackendVersion,
    parseJsonField,
    sanitizeText: security_1.sanitizeText,
    validateImportedDrawing: security_1.validateImportedDrawing,
    ensureTrashCollection,
    invalidateDrawingsCache,
    removeFileIfExists,
    verifyDatabaseIntegrityAsync,
    MAX_IMPORT_ARCHIVE_ENTRIES,
    MAX_IMPORT_COLLECTIONS,
    MAX_IMPORT_DRAWINGS,
    MAX_IMPORT_MANIFEST_BYTES,
    MAX_IMPORT_DRAWING_BYTES,
    MAX_IMPORT_TOTAL_EXTRACTED_BYTES,
});
app.use(errorHandler_1.errorHandler);
const isMain = typeof require !== "undefined" && require.main === module;
const SNAPSHOT_RETENTION_MS = config_1.config.snapshotRetentionMs;
if (isMain) {
    const snapshotCleanupTimer = setInterval(async () => {
        try {
            const cutoff = new Date(Date.now() - SNAPSHOT_RETENTION_MS);
            const result = await prisma_1.prisma.drawingSnapshot.deleteMany({
                where: { createdAt: { lt: cutoff } },
            });
            if (result.count > 0) {
                console.log(`[Cleanup] Deleted ${result.count} old drawing snapshots`);
            }
            await (0, sqliteMaintenance_1.reclaimSqliteFreeSpace)(prisma_1.prisma, config_1.config.databaseUrl ?? "");
        }
        catch (err) {
            console.error("[Cleanup] Snapshot cleanup failed:", err);
        }
    }, 60 * 60 * 1000);
    snapshotCleanupTimer.unref();
    let shuttingDown = false;
    const gracefulShutdown = (signal) => {
        if (shuttingDown)
            return;
        shuttingDown = true;
        console.log(`[shutdown] Received ${signal}, shutting down gracefully`);
        clearInterval(snapshotCleanupTimer);
        const forceExit = setTimeout(() => {
            console.error("[shutdown] Forced exit after timeout");
            process.exit(1);
        }, 10000);
        forceExit.unref();
        /* io.close() disconnects all sockets and closes the underlying httpServer. */ io.close(() => {
            void (0, sqliteMaintenance_1.waitForSqliteMaintenance)()
                .then(() => prisma_1.prisma.$disconnect())
                .catch((err) => {
                console.error("[shutdown] prisma disconnect failed:", err);
            })
                .finally(() => {
                clearTimeout(forceExit);
                process.exit(0);
            });
        });
    };
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    void (async () => {
        (0, security_1.configureSecuritySettings)({ maxDataUrlSize: config_1.config.fileUploadMaxBytes });
        await (0, prisma_1.configureSqlite)();
        (0, scheduler_1.startScheduledBackups)({
            prisma: prisma_1.prisma,
            databaseUrl: config_1.config.databaseUrl,
            schedule: config_1.config.backups.schedule,
            backupDir: config_1.config.backups.dir,
            retentionDays: config_1.config.backups.retentionDays,
        });
        httpServer.listen(PORT, config_1.config.listenHost, async () => {
            await initializeUploadDir();
            if (config_1.config.authMode === "disabled") {
                const line = "!".repeat(72);
                console.warn(`\n${line}\n! AUTH_MODE=disabled: authentication is OFF. Every request runs as a\n! single shared local user and NO login is required. Do NOT expose this\n! instance to the public internet or any untrusted network.\n${line}\n`);
            }
            await (0, storageDoctor_1.runStorageDoctor)({
                config: config_1.config,
                isS3Enabled: s3_1.isS3Enabled,
                probeBucket: () => (0, s3_1.checkBucketReachable)(),
            });
            try {
                await (0, bootstrapSetupCode_1.issueBootstrapSetupCodeIfRequired)({
                    prisma: prisma_1.prisma,
                    ttlMs: config_1.config.bootstrapSetupCodeTtlMs,
                    authMode: config_1.config.authMode,
                    reason: "startup",
                });
            }
            catch (error) {
                console.error("Failed to issue bootstrap setup code:", error);
            }
            console.log(`Server running on port ${PORT}`);
            console.log(`Environment: ${config_1.config.nodeEnv}`);
            console.log(`Frontend URL: ${config_1.config.frontendUrl}`);
        });
    })();
}
