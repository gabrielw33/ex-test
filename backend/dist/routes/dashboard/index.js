"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDashboardRoutes = void 0;
const collections_1 = require("./collections");
const drawings_1 = require("./drawings");
const library_1 = require("./library");
const registerDashboardRoutes = (app, deps) => {
    (0, drawings_1.registerDrawingRoutes)(app, deps);
    (0, collections_1.registerCollectionRoutes)(app, deps);
    (0, library_1.registerLibraryRoutes)(app, deps);
};
exports.registerDashboardRoutes = registerDashboardRoutes;
