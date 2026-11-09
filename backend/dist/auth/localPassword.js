"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canUseLocalPasswordFlows = void 0;
const hasLocalPasswordHash = (passwordHash) => typeof passwordHash === "string" && passwordHash.startsWith("$2");
const canUseLocalPasswordFlows = (user) => hasLocalPasswordHash(user?.passwordHash);
exports.canUseLocalPasswordFlows = canUseLocalPasswordFlows;
