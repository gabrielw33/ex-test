"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSmtpMailer = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const createSmtpMailer = ({ host, port, secure, user, password, from, replyTo, }) => {
    const transport = nodemailer_1.default.createTransport({
        host,
        port,
        secure,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
        ...(user && password ? { auth: { user, pass: password } } : {}),
    });
    return {
        enabled: true,
        async send(message) {
            try {
                const info = await transport.sendMail({
                    from,
                    to: message.to,
                    subject: message.subject,
                    html: message.html,
                    text: message.text,
                    ...(replyTo ? { replyTo } : {}),
                });
                return { delivered: true, id: info.messageId ?? null };
            }
            catch (cause) {
                return {
                    delivered: false,
                    reason: cause instanceof Error ? cause.message : String(cause),
                };
            }
        },
    };
};
exports.createSmtpMailer = createSmtpMailer;
