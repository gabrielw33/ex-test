"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeRefreshToken = exports.makeOidcAccessToken = exports.makeAccessToken = exports.createDeps = exports.createResponse = exports.createRequest = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const vitest_1 = require("vitest");
const config_1 = require("../config");
const createRequest = (overrides) => ({
    method: "GET",
    originalUrl: "/drawings",
    url: "/drawings",
    headers: {},
    ...overrides,
});
exports.createRequest = createRequest;
const createResponse = () => ({
    status: vitest_1.vi.fn().mockReturnThis(),
    json: vitest_1.vi.fn().mockReturnThis(),
});
exports.createResponse = createResponse;
const createDeps = () => {
    const prisma = {
        user: { findUnique: vitest_1.vi.fn(), update: vitest_1.vi.fn() },
        authIdentity: { findUnique: vitest_1.vi.fn() },
        apiKey: { findUnique: vitest_1.vi.fn(), update: vitest_1.vi.fn() },
    };
    const authModeService = {
        getAuthEnabled: vitest_1.vi.fn(),
        getBootstrapActingUser: vitest_1.vi.fn(),
    };
    return { prisma, authModeService };
};
exports.createDeps = createDeps;
const makeAccessToken = (payload) => jsonwebtoken_1.default.sign({
    userId: payload?.userId ?? "user-1",
    email: payload?.email ?? "user-1@test.local",
    type: "access",
    impersonatorId: payload?.impersonatorId,
}, config_1.config.jwtSecret);
exports.makeAccessToken = makeAccessToken;
const makeOidcAccessToken = (payload) => jsonwebtoken_1.default.sign({
    userId: payload?.userId ?? "user-1",
    email: payload?.email ?? "user-1@test.local",
    type: "access",
    authProvider: payload?.authProvider ?? "oidc",
    oidcGroups: payload?.oidcGroups ?? [],
}, config_1.config.jwtSecret);
exports.makeOidcAccessToken = makeOidcAccessToken;
const makeRefreshToken = () => jsonwebtoken_1.default.sign({ userId: "user-1", email: "user-1@test.local", type: "refresh" }, config_1.config.jwtSecret);
exports.makeRefreshToken = makeRefreshToken;
