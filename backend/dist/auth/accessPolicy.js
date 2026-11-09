"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEffectiveRegistrationEnabled = exports.getEffectiveOidcJitProvisioning = void 0;
const getEffectiveOidcJitProvisioning = (options, systemConfig) => {
    if (!options.oidcEnabled)
        return false;
    return typeof systemConfig.oidcJitProvisioningEnabled === "boolean"
        ? systemConfig.oidcJitProvisioningEnabled
        : options.defaultJitProvisioningEnabled;
};
exports.getEffectiveOidcJitProvisioning = getEffectiveOidcJitProvisioning;
const getEffectiveRegistrationEnabled = (authMode, registrationEnabled) => authMode !== "oidc_enforced" && registrationEnabled;
exports.getEffectiveRegistrationEnabled = getEffectiveRegistrationEnabled;
