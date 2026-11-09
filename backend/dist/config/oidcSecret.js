"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveOidcClientSecret = void 0;
const node_fs_1 = require("node:fs");
const env_1 = require("./env");
const resolveOidcClientSecret = () => {
    const direct = (0, env_1.readOptionalString)("OIDC_CLIENT_SECRET");
    const file = (0, env_1.readOptionalString)("OIDC_CLIENT_SECRET_FILE");
    if (!file)
        return direct;
    if (direct)
        throw new Error("Use only one of OIDC_CLIENT_SECRET and OIDC_CLIENT_SECRET_FILE");
    let secret;
    try {
        secret = (0, node_fs_1.readFileSync)(file, "utf8")
            .replace(/[\r\n]/g, "")
            .trim();
    }
    catch {
        throw new Error("OIDC_CLIENT_SECRET_FILE is not readable");
    }
    if (!secret)
        throw new Error("OIDC_CLIENT_SECRET_FILE is empty");
    return secret;
};
exports.resolveOidcClientSecret = resolveOidcClientSecret;
