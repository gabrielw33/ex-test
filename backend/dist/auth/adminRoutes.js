"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAdminRoutes = void 0;
const adminImpersonationRoutes_1 = require("./adminImpersonationRoutes");
const adminSettingsRoutes_1 = require("./adminSettingsRoutes");
const adminUserRoutes_1 = require("./adminUserRoutes");
const registerAdminRoutes = (deps) => {
    (0, adminSettingsRoutes_1.registerAdminSettingsRoutes)(deps);
    (0, adminUserRoutes_1.registerAdminUserRoutes)(deps);
    (0, adminImpersonationRoutes_1.registerAdminImpersonationRoutes)(deps);
};
exports.registerAdminRoutes = registerAdminRoutes;
