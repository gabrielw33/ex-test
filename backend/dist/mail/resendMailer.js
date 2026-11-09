"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMailerFromConfig = exports.createResendMailer = void 0;
const resend_1 = require("resend");
const mailer_1 = require("./mailer");
const smtpMailer_1 = require("./smtpMailer");
const createResendMailer = ({ apiKey, from, replyTo, }) => {
    const client = new resend_1.Resend(apiKey);
    return {
        enabled: true,
        async send(message) {
            try {
                const { data, error } = await client.emails.send({
                    from,
                    to: [message.to],
                    subject: message.subject,
                    html: message.html,
                    text: message.text,
                    ...(replyTo ? { replyTo } : {}),
                    ...(message.idempotencyKey
                        ? { idempotencyKey: message.idempotencyKey }
                        : {}),
                });
                if (error) {
                    return {
                        delivered: false,
                        reason: `${error.name}: ${error.message}`,
                    };
                }
                return { delivered: true, id: data?.id ?? null };
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
exports.createResendMailer = createResendMailer;
const createMailerFromConfig = (mail) => {
    if (mail.transport === "none") {
        return (0, mailer_1.createDisabledMailer)("No mail transport configured");
    }
    if (!mail.from)
        return (0, mailer_1.createDisabledMailer)("MAIL_FROM is not set");
    if (mail.transport === "smtp") {
        if (!mail.smtp.host)
            return (0, mailer_1.createDisabledMailer)("SMTP_HOST is not set");
        if (Boolean(mail.smtp.user) !== Boolean(mail.smtp.password)) {
            return (0, mailer_1.createDisabledMailer)("SMTP_USER and SMTP_PASSWORD must be set together");
        }
        return (0, smtpMailer_1.createSmtpMailer)({
            ...mail.smtp,
            host: mail.smtp.host,
            from: mail.from,
            replyTo: mail.replyTo,
        });
    }
    if (!mail.resendApiKey) {
        return (0, mailer_1.createDisabledMailer)("RESEND_API_KEY is not set");
    }
    return (0, exports.createResendMailer)({
        apiKey: mail.resendApiKey,
        from: mail.from,
        replyTo: mail.replyTo,
    });
};
exports.createMailerFromConfig = createMailerFromConfig;
