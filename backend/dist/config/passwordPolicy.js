"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePasswordAgainstPolicy = exports.buildPasswordPolicyMessage = exports.resolvePasswordPolicyConfig = void 0;
const env_1 = require("./env");
const resolvePasswordPolicyConfig = () => {
    const minLength = (0, env_1.readNumber)("PASSWORD_MIN_LENGTH", 12);
    const maxLength = (0, env_1.readNumber)("PASSWORD_MAX_LENGTH", 100);
    if (maxLength < minLength) {
        throw new Error("PASSWORD_MAX_LENGTH must be greater than or equal to PASSWORD_MIN_LENGTH");
    }
    return {
        minLength,
        maxLength,
        requireUppercase: (0, env_1.readBoolean)("PASSWORD_REQUIRE_UPPERCASE", true),
        requireLowercase: (0, env_1.readBoolean)("PASSWORD_REQUIRE_LOWERCASE", true),
        requireNumber: (0, env_1.readBoolean)("PASSWORD_REQUIRE_NUMBER", true),
        requireSymbol: (0, env_1.readBoolean)("PASSWORD_REQUIRE_SYMBOL", true),
    };
};
exports.resolvePasswordPolicyConfig = resolvePasswordPolicyConfig;
const buildPasswordPolicyMessage = (policy) => {
    const requirements = [`at least ${policy.minLength} characters`];
    if (policy.requireUppercase)
        requirements.push("one uppercase letter");
    if (policy.requireLowercase)
        requirements.push("one lowercase letter");
    if (policy.requireNumber)
        requirements.push("one number");
    if (policy.requireSymbol)
        requirements.push("one symbol");
    return `Password must be ${requirements.join(", ")}`;
};
exports.buildPasswordPolicyMessage = buildPasswordPolicyMessage;
const validatePasswordAgainstPolicy = (password, policy) => {
    if (typeof password !== "string")
        return (0, exports.buildPasswordPolicyMessage)(policy);
    if (password.length < policy.minLength)
        return (0, exports.buildPasswordPolicyMessage)(policy);
    if (password.length > policy.maxLength)
        return `Password must be at most ${policy.maxLength} characters long`;
    if (policy.requireUppercase && !/[A-Z]/.test(password))
        return (0, exports.buildPasswordPolicyMessage)(policy);
    if (policy.requireLowercase && !/[a-z]/.test(password))
        return (0, exports.buildPasswordPolicyMessage)(policy);
    if (policy.requireNumber && !/\d/.test(password))
        return (0, exports.buildPasswordPolicyMessage)(policy);
    if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password))
        return (0, exports.buildPasswordPolicyMessage)(policy);
    return null;
};
exports.validatePasswordAgainstPolicy = validatePasswordAgainstPolicy;
