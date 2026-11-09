"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDisabledMailer = void 0;
const createDisabledMailer = (reason = "No mail provider configured") => ({
    enabled: false,
    async send() {
        return { delivered: false, reason };
    },
});
exports.createDisabledMailer = createDisabledMailer;
