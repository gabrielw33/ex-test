"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAccountRoutes = void 0;
const accountApiKeyRoutes_1 = require("./accountApiKeyRoutes");
const accountPasswordChangeRoutes_1 = require("./accountPasswordChangeRoutes");
const accountPasswordResetRoutes_1 = require("./accountPasswordResetRoutes");
const accountPreferencesRoutes_1 = require("./accountPreferencesRoutes");
const accountProfileRoutes_1 = require("./accountProfileRoutes");
const registerAccountRoutes = (deps) => {
    (0, accountPasswordResetRoutes_1.registerAccountPasswordResetRoutes)(deps);
    (0, accountPreferencesRoutes_1.registerAccountPreferencesRoutes)(deps);
    (0, accountProfileRoutes_1.registerAccountProfileRoutes)(deps);
    (0, accountApiKeyRoutes_1.registerAccountApiKeyRoutes)(deps);
    (0, accountPasswordChangeRoutes_1.registerAccountPasswordChangeRoutes)(deps);
};
exports.registerAccountRoutes = registerAccountRoutes;
