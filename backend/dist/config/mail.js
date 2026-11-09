"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMailConfig = void 0;
const env_1 = require("./env");
const resolveTransport = (resendApiKey, smtpHost) => {
    const explicit = (0, env_1.readRaw)("MAIL_TRANSPORT")?.trim().toLowerCase();
    if (explicit === "resend" || explicit === "smtp" || explicit === "none") {
        return explicit;
    }
    if (explicit) {
        throw new Error("MAIL_TRANSPORT must be one of: resend, smtp, none");
    }
    if (resendApiKey)
        return "resend";
    if (smtpHost)
        return "smtp";
    return "none";
};
const resolveMailConfig = () => {
    const resendApiKey = (0, env_1.readOptionalString)("RESEND_API_KEY");
    const smtpHost = (0, env_1.readOptionalString)("SMTP_HOST");
    return {
        transport: resolveTransport(resendApiKey, smtpHost),
        resendApiKey,
        from: (0, env_1.readOptionalString)("MAIL_FROM"),
        replyTo: (0, env_1.readOptionalString)("MAIL_REPLY_TO"),
        smtp: {
            host: smtpHost,
            port: (0, env_1.readNumber)("SMTP_PORT", 587),
            secure: (0, env_1.readBoolean)("SMTP_SECURE", false),
            user: (0, env_1.readOptionalString)("SMTP_USER"),
            password: (0, env_1.readOptionalString)("SMTP_PASSWORD"),
        },
    };
};
exports.resolveMailConfig = resolveMailConfig;
