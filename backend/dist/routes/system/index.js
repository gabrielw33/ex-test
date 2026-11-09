"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSystemRoutes = void 0;
const update_1 = require("./update");
const registerSystemRoutes = (app, deps) => {
    (0, update_1.registerUpdateRoutes)(app, deps);
};
exports.registerSystemRoutes = registerSystemRoutes;
