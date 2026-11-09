"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyBootstrapSetupCode = exports.issueBootstrapSetupCodeIfRequired = void 0;
const crypto_1 = __importDefault(require("crypto"));
const authMode_1 = require("./authMode");
const config_1 = require("../config");
const BOOTSTRAP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomCodeChars = (length) => {
    let out = "";
    for (let i = 0; i < length; i += 1) {
        const index = crypto_1.default.randomInt(0, BOOTSTRAP_CODE_ALPHABET.length);
        out += BOOTSTRAP_CODE_ALPHABET[index];
    }
    return out;
};
const normalizeBootstrapSetupCode = (value) => value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
const hashBootstrapSetupCode = (normalizedCode) => crypto_1.default.createHash("sha256").update(normalizedCode, "utf8").digest("hex");
const timingSafeHexCompare = (expectedHex, actualHex) => {
    const expected = Buffer.from(expectedHex, "hex");
    const actual = Buffer.from(actualHex, "hex");
    if (expected.length !== actual.length)
        return false;
    return crypto_1.default.timingSafeEqual(expected, actual);
};
const generateBootstrapSetupCode = () => {
    const raw = randomCodeChars(8);
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
};
const getBootstrapState = async (prisma, options) => {
    const [systemConfig, bootstrapUser, activeUsers] = await Promise.all([
        prisma.systemConfig.upsert({
            where: { id: authMode_1.DEFAULT_SYSTEM_CONFIG_ID },
            update: {},
            create: {
                id: authMode_1.DEFAULT_SYSTEM_CONFIG_ID,
                authEnabled: (0, config_1.authModeEnablesAuth)(options.authMode),
            },
            select: {
                authEnabled: true,
                bootstrapSetupCodeHash: true,
                bootstrapSetupCodeExpiresAt: true,
                bootstrapSetupCodeFailedAttempts: true,
            },
        }),
        prisma.user.findUnique({
            where: { id: authMode_1.BOOTSTRAP_USER_ID },
            select: { id: true, isActive: true },
        }),
        prisma.user.count({ where: { isActive: true } }),
    ]);
    return { systemConfig, bootstrapUser, activeUsers };
};
const shouldRequireBootstrapSetupCode = async (prisma, options) => {
    if (options.authMode === "oidc_enforced")
        return false;
    if (options.authMode === "disabled")
        return false;
    const { systemConfig, bootstrapUser, activeUsers } = await getBootstrapState(prisma, {
        authMode: options.authMode,
    });
    return (Boolean(systemConfig.authEnabled) &&
        Boolean(bootstrapUser) &&
        bootstrapUser?.isActive === false &&
        activeUsers === 0);
};
const issueBootstrapSetupCodeIfRequired = async (params) => {
    const { prisma, ttlMs, authMode, reason } = params;
    if (authMode === "oidc_enforced" || authMode === "disabled") {
        return { issued: false };
    }
    const required = await shouldRequireBootstrapSetupCode(prisma, { authMode });
    if (!required) {
        return { issued: false };
    }
    const code = generateBootstrapSetupCode();
    const normalized = normalizeBootstrapSetupCode(code);
    const codeHash = hashBootstrapSetupCode(normalized);
    const expiresAt = new Date(Date.now() + ttlMs);
    await prisma.systemConfig.update({
        where: { id: authMode_1.DEFAULT_SYSTEM_CONFIG_ID },
        data: {
            bootstrapSetupCodeHash: codeHash,
            bootstrapSetupCodeIssuedAt: new Date(),
            bootstrapSetupCodeExpiresAt: expiresAt,
            bootstrapSetupCodeFailedAttempts: 0,
        },
    });
    console.log(`[BOOTSTRAP SETUP] One-time admin setup code (${reason}): ${code} (expires ${expiresAt.toISOString()})`);
    return { issued: true, code, expiresAt };
};
exports.issueBootstrapSetupCodeIfRequired = issueBootstrapSetupCodeIfRequired;
const verifyBootstrapSetupCode = async (params) => {
    const { prisma, providedCode, maxAttempts } = params;
    const systemConfig = await prisma.systemConfig.findUnique({
        where: { id: authMode_1.DEFAULT_SYSTEM_CONFIG_ID },
        select: {
            bootstrapSetupCodeHash: true,
            bootstrapSetupCodeExpiresAt: true,
            bootstrapSetupCodeFailedAttempts: true,
        },
    });
    if (!systemConfig?.bootstrapSetupCodeHash ||
        !systemConfig.bootstrapSetupCodeExpiresAt) {
        return { ok: false, reason: "unavailable" };
    }
    if (new Date() > systemConfig.bootstrapSetupCodeExpiresAt) {
        return { ok: false, reason: "expired" };
    }
    if (systemConfig.bootstrapSetupCodeFailedAttempts >= maxAttempts) {
        return { ok: false, reason: "locked" };
    }
    if (!providedCode || providedCode.trim().length === 0) {
        return { ok: false, reason: "missing" };
    }
    const normalized = normalizeBootstrapSetupCode(providedCode);
    const providedHash = hashBootstrapSetupCode(normalized);
    const valid = timingSafeHexCompare(systemConfig.bootstrapSetupCodeHash, providedHash);
    if (!valid) {
        await prisma.systemConfig.update({
            where: { id: authMode_1.DEFAULT_SYSTEM_CONFIG_ID },
            data: {
                bootstrapSetupCodeFailedAttempts: { increment: 1 },
            },
        });
        return { ok: false, reason: "invalid" };
    }
    await prisma.systemConfig.update({
        where: { id: authMode_1.DEFAULT_SYSTEM_CONFIG_ID },
        data: {
            bootstrapSetupCodeHash: null,
            bootstrapSetupCodeIssuedAt: null,
            bootstrapSetupCodeExpiresAt: null,
            bootstrapSetupCodeFailedAttempts: 0,
        },
    });
    return { ok: true };
};
exports.verifyBootstrapSetupCode = verifyBootstrapSetupCode;
