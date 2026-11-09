"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderEnvExample = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const registry_1 = require("./registry");
const ENV_EXAMPLE_PATH = path.resolve(__dirname, "../../.env.example");
const GENERATED_NOTE = "GENERATED FILE — edit backend/src/config/registry/* and run npm run gen:env";
/** Groups in the order they first appear in the registry. */
const groupOrder = () => {
    const seen = [];
    for (const spec of registry_1.ENV_REGISTRY) {
        if (!seen.includes(spec.group))
            seen.push(spec.group);
    }
    return seen;
};
const specsInGroup = (group) => registry_1.ENV_REGISTRY.filter((spec) => spec.group === group);
/** True when the var should be emitted as an active (uncommented) assignment. */
const hasActiveDefault = (spec) => spec.default !== undefined && !spec.secret && !spec.docsOnly;
const commentedValue = (spec) => spec.example ?? spec.default ?? "";
/** Group whose vars are documented only; never emitted into .env.example. */
const FRONTEND_GROUP = "Frontend (build-time)";
const renderEnvExample = () => {
    const lines = [];
    lines.push(`# ${GENERATED_NOTE}`);
    lines.push("# Backend environment variables. Copy to .env and adjust.");
    for (const group of groupOrder()) {
        if (group === FRONTEND_GROUP)
            continue;
        lines.push("");
        lines.push(`# === ${group} ===`);
        for (const spec of specsInGroup(group)) {
            lines.push(`# ${spec.doc}`);
            if (spec.kind === "enum" && spec.values) {
                lines.push(`# Allowed: ${spec.values.join(", ")}`);
            }
            if (spec.aliases && spec.aliases.length > 0) {
                lines.push(`# Deprecated aliases: ${spec.aliases.join(", ")}`);
            }
            if (hasActiveDefault(spec)) {
                lines.push(`${spec.name}=${spec.default}`);
            }
            else {
                lines.push(`# ${spec.name}=${commentedValue(spec)}`);
            }
        }
    }
    return lines.join("\n") + "\n";
};
exports.renderEnvExample = renderEnvExample;
if (require.main === module) {
    fs.writeFileSync(ENV_EXAMPLE_PATH, (0, exports.renderEnvExample)());
    console.log(`Wrote ${path.relative(process.cwd(), ENV_EXAMPLE_PATH)}`);
}
