"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSpec = exports.ENV_REGISTRY = void 0;
const server_1 = require("./server");
const auth_1 = require("./auth");
const oidc_1 = require("./oidc");
const security_1 = require("./security");
const storage_1 = require("./storage");
const misc_1 = require("./misc");
const frontend_1 = require("./frontend");
exports.ENV_REGISTRY = [
    ...server_1.serverEnv,
    ...server_1.databaseEnv,
    ...auth_1.authEnv,
    ...oidc_1.oidcEnv,
    ...security_1.securityEnv,
    ...storage_1.storageEnv,
    ...storage_1.backupEnv,
    ...misc_1.updateCheckEnv,
    ...misc_1.linkSharingEnv,
    ...frontend_1.frontendEnv,
];
const SPEC_BY_NAME = new Map(exports.ENV_REGISTRY.map((spec) => [spec.name, spec]));
const getSpec = (name) => {
    const spec = SPEC_BY_NAME.get(name);
    if (!spec) {
        throw new Error(`Unknown environment variable: ${name} is not declared in the registry`);
    }
    return spec;
};
exports.getSpec = getSpec;
