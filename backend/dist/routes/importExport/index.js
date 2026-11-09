"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerImportExportRoutes = void 0;
const excalidashImportRoutes_1 = require("./excalidashImportRoutes");
const exportRoutes_1 = require("./exportRoutes");
const legacySqliteImportRoutes_1 = require("./legacySqliteImportRoutes");
const registerImportExportRoutes = (deps) => {
    (0, exportRoutes_1.registerExcalidashExportRoute)(deps);
    (0, excalidashImportRoutes_1.registerExcalidashImportRoutes)(deps);
    (0, legacySqliteImportRoutes_1.registerLegacySqliteImportRoutes)(deps);
};
exports.registerImportExportRoutes = registerImportExportRoutes;
