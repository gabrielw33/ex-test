"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOriginFromReferer = exports.getCsrfTokenHeader = exports.revokeCsrfToken = exports.validateCsrfToken = exports.createCsrfToken = exports.validateImportedDrawing = exports.sanitizeDrawingData = exports.appStateSchema = exports.elementSchema = exports.sanitizeUrl = exports.sanitizeElementText = exports.sanitizeText = exports.sanitizeSvg = exports.getSecurityConfig = exports.resetSecuritySettings = exports.configureSecuritySettings = exports.DrawingSanitizationError = void 0;
/**
 * Security utilities for XSS prevention, data sanitization, and CSRF protection
 */
const zod_1 = require("zod");
const dompurify_1 = __importDefault(require("dompurify"));
const jsdom_1 = require("jsdom");
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("./config");
const fileProcessing_1 = require("./fileProcessing");
const window = new jsdom_1.JSDOM("").window;
const purify = (0, dompurify_1.default)(window);
/**
 * Thrown when a drawing's files cannot be sanitized safely (e.g. an image
 * dataURL is malformed/unsupported → 400, or exceeds the size cap → 413).
 * Carries the offending fileId so the client can identify the bad image
 * instead of the sanitizer silently blanking or truncating it.
 */
class DrawingSanitizationError extends Error {
    statusCode;
    fileId;
    isOperational = true;
    constructor(statusCode, fileId, message) {
        super(message);
        this.name = "DrawingSanitizationError";
        this.statusCode = statusCode;
        this.fileId = fileId;
    }
}
exports.DrawingSanitizationError = DrawingSanitizationError;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Image MIME allowlist derived from the single S3 upload allowlist so the two never drift. */
const SAFE_IMAGE_MIME_TYPES = Object.keys(fileProcessing_1.MIME_TO_EXT);
/** A dataURL is accepted verbatim only if it is `data:image/<allowed>;base64,<base64 body>`. */
const SAFE_IMAGE_DATAURL = new RegExp(`^data:(?:${SAFE_IMAGE_MIME_TYPES.map(escapeRegExp).join("|")});base64,[A-Za-z0-9+/=\\s]+$`, "i");
const API_FILE_REF = /^\/api\/files\/[\w-]{1,200}\/[\w-]{1,200}$/;
const defaultConfig = { maxDataUrlSize: 10 * 1024 * 1024 };
let activeConfig = { ...defaultConfig };
/**
 * Configure security settings
 * @param config Partial configuration to merge with defaults
 */
const configureSecuritySettings = (config) => {
    activeConfig = { ...activeConfig, ...config };
};
exports.configureSecuritySettings = configureSecuritySettings;
/**
 * Reset security settings to defaults
 */
const resetSecuritySettings = () => {
    activeConfig = { ...defaultConfig };
};
exports.resetSecuritySettings = resetSecuritySettings;
/**
 * Get current security configuration
 */
const getSecurityConfig = () => {
    return { ...activeConfig };
};
exports.getSecurityConfig = getSecurityConfig;
const sanitizeSvg = (svgContent) => {
    if (typeof svgContent !== "string")
        return "";
    const safeImageDataUrlPattern = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|svg\+xml);base64,[a-z0-9+/=\s]+$/i;
    const isSafeImageHref = (href) => safeImageDataUrlPattern.test(href) || API_FILE_REF.test(href);
    const sanitizeSvgImageTags = (content) => content.replace(/<(image|use)\b[^>]*>/gi, (imageTag, tag) => {
        const hrefMatch = imageTag.match(/\shref\s*=\s*"([^"]*)"/i) ??
            imageTag.match(/\shref\s*=\s*'([^']*)'/i) ??
            imageTag.match(/\sxlink:href\s*=\s*"([^"]*)"/i) ??
            imageTag.match(/\sxlink:href\s*=\s*'([^']*)'/i);
        const hrefValue = hrefMatch?.[1]?.trim();
        const safeHref = hrefValue &&
            (tag.toLowerCase() === "use"
                ? /^#[\w-]+$/.test(hrefValue)
                : isSafeImageHref(hrefValue));
        if (!safeHref) {
            return "";
        }
        const withoutXlinkHref = imageTag.replace(/\sxlink:href\s*=\s*(?:"[^"]*"|'[^']*')/gi, "");
        if (/\shref\s*=/i.test(withoutXlinkHref)) {
            return withoutXlinkHref.replace(/\shref\s*=\s*(?:"[^"]*"|'[^']*')/i, ` href="${hrefValue}"`);
        }
        return withoutXlinkHref.replace(/<(image|use)\b/i, `<$1 href="${hrefValue}"`);
    });
    const sanitized = purify
        .sanitize(svgContent, {
        ALLOWED_TAGS: [
            "svg",
            "defs",
            "pattern",
            "g",
            "image",
            "symbol",
            "use",
            "clipPath",
            "mask",
            "rect",
            "circle",
            "ellipse",
            "line",
            "polyline",
            "polygon",
            "path",
            "text",
            "tspan",
        ],
        ALLOWED_ATTR: [
            "xmlns",
            "xmlns:xlink",
            "version",
            "id",
            "viewBox",
            "preserveAspectRatio",
            "x",
            "y",
            "width",
            "height",
            "cx",
            "cy",
            "r",
            "rx",
            "ry",
            "x1",
            "y1",
            "x2",
            "y2",
            "points",
            "d",
            "fill",
            "fill-opacity",
            "fill-rule",
            "stroke",
            "stroke-width",
            "stroke-opacity",
            "stroke-linecap",
            "stroke-linejoin",
            "stroke-miterlimit",
            "stroke-dasharray",
            "stroke-dashoffset",
            "opacity",
            "transform",
            "clip-path",
            "mask",
            "clipPathUnits",
            "maskUnits",
            "maskContentUnits",
            "vector-effect",
            "patternUnits",
            "patternContentUnits",
            "font-size",
            "font-family",
            "font-weight",
            "letter-spacing",
            "text-anchor",
            "dominant-baseline",
            "href",
            "xlink:href",
        ],
        FORBID_TAGS: [
            "script",
            "foreignObject",
            "iframe",
            "object",
            "embed",
            "style",
            "link",
            "marker",
            "filter",
        ],
        FORBID_ATTR: [
            "onload",
            "onclick",
            "onerror",
            "onmouseover",
            "onfocus",
            "onblur",
            "src",
            "action",
            "style",
            "class",
        ],
        KEEP_CONTENT: true,
    })
        .trim();
    // Crop/frame masks only refer to local SVG geometry, never external URLs.
    const localReferences = sanitized.replace(/\s(?:clip-path|mask)="([^"]*)"/gi, (attribute, value) => /^url\(#[\w-]+\)$/.test(value) ? attribute : "");
    return sanitizeSvgImageTags(localReferences).trim();
};
exports.sanitizeSvg = sanitizeSvg;
const sanitizeText = (input, maxLength = 1000) => {
    if (typeof input !== "string")
        return "";
    const cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    const truncated = cleaned.slice(0, maxLength);
    return purify
        .sanitize(truncated, {
        ALLOWED_TAGS: ["b", "i", "u", "em", "strong", "br", "span"],
        ALLOWED_ATTR: [],
        FORBID_TAGS: [
            "script",
            "iframe",
            "object",
            "embed",
            "link",
            "style",
            "form",
            "input",
            "button",
            "select",
            "textarea",
            "svg",
            "foreignObject",
        ],
        FORBID_ATTR: [
            "onload",
            "onclick",
            "onerror",
            "onmouseover",
            "onfocus",
            "onblur",
            "onchange",
            "onsubmit",
            "onreset",
            "onkeydown",
            "onkeyup",
            "onkeypress",
            "href",
            "src",
            "action",
            "formaction",
            "style",
        ],
        KEEP_CONTENT: true,
    })
        .trim();
};
exports.sanitizeText = sanitizeText;
/**
 * Sanitize a canvas element's plain-text content. Unlike {@link sanitizeText}
 * (for names/metadata that may land in an HTML context), element text is drawn
 * to the Excalidraw canvas verbatim and is never inserted as HTML, so it must
 * NOT be run through DOMPurify: that strips literal `<value>`-style words as if
 * they were unknown tags and entity-encodes `<`, `&` (turning `3 < 4 & ok` into
 * `3 &lt; 4 &amp; ok`), corrupting imported drawings. We only strip control
 * characters and truncate, preserving angle brackets/ampersands exactly. The
 * SVG preview export path is sanitized separately by {@link sanitizeSvg}.
 */
const sanitizeElementText = (input, maxLength = 5000) => {
    if (typeof input !== "string")
        return "";
    return input
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .slice(0, maxLength);
};
exports.sanitizeElementText = sanitizeElementText;
const sanitizeUrl = (url) => {
    if (typeof url !== "string")
        return "";
    const trimmed = url.trim();
    if (/^(javascript|data|vbscript):/i.test(trimmed)) {
        return "";
    }
    try {
        if (/^(https?:\/\/|mailto:|\/|\.\/|\.\.\/)/i.test(trimmed)) {
            return trimmed;
        }
        return "";
    }
    catch {
        return "";
    }
};
exports.sanitizeUrl = sanitizeUrl;
exports.elementSchema = zod_1.z
    .object({
    id: zod_1.z.string().min(1).max(200).optional().nullable(),
    type: zod_1.z.string().optional().nullable(),
    x: zod_1.z.number().optional().nullable(),
    y: zod_1.z.number().optional().nullable(),
    width: zod_1.z.number().optional().nullable(),
    height: zod_1.z.number().optional().nullable(),
    angle: zod_1.z.number().optional().nullable(),
    strokeColor: zod_1.z.string().optional().nullable(),
    backgroundColor: zod_1.z.string().optional().nullable(),
    fillStyle: zod_1.z.string().optional().nullable(),
    strokeWidth: zod_1.z.number().optional().nullable(),
    strokeStyle: zod_1.z.string().optional().nullable(),
    roundness: zod_1.z.any().optional().nullable(),
    boundElements: zod_1.z.array(zod_1.z.any()).optional().nullable(),
    groupIds: zod_1.z.array(zod_1.z.string()).optional().nullable(),
    frameId: zod_1.z.string().optional().nullable(),
    seed: zod_1.z.number().optional().nullable(),
    version: zod_1.z.number().optional().nullable(),
    versionNonce: zod_1.z.number().optional().nullable(),
    isDeleted: zod_1.z.boolean().optional().nullable(),
    opacity: zod_1.z.number().optional().nullable(),
    link: zod_1.z.string().optional().nullable(),
    locked: zod_1.z.boolean().optional().nullable(),
    text: zod_1.z.string().optional().nullable(),
    fontSize: zod_1.z.number().optional().nullable(),
    fontFamily: zod_1.z
        .union([zod_1.z.number(), zod_1.z.string().max(200)])
        .optional()
        .nullable(),
    textAlign: zod_1.z.string().optional().nullable(),
    verticalAlign: zod_1.z.string().optional().nullable(),
    customData: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional().nullable(),
})
    .passthrough()
    .transform((element) => {
    const sanitized = { ...element };
    if (typeof sanitized.text === "string") {
        sanitized.text = (0, exports.sanitizeElementText)(sanitized.text, 5000);
    }
    if (typeof sanitized.link === "string") {
        sanitized.link = (0, exports.sanitizeUrl)(sanitized.link);
    }
    return sanitized;
});
exports.appStateSchema = zod_1.z
    .object({
    gridSize: zod_1.z.number().finite().min(0).max(1000).optional().nullable(),
    gridStep: zod_1.z.number().finite().min(1).max(1000).optional().nullable(),
    viewBackgroundColor: zod_1.z.string().optional().nullable(),
    currentItemStrokeColor: zod_1.z.string().optional().nullable(),
    currentItemBackgroundColor: zod_1.z.string().optional().nullable(),
    currentItemFillStyle: zod_1.z
        .enum(["solid", "hachure", "cross-hatch", "dots"])
        .optional()
        .nullable(),
    currentItemStrokeWidth: zod_1.z
        .number()
        .finite()
        .min(0)
        .max(50)
        .optional()
        .nullable(),
    currentItemStrokeStyle: zod_1.z
        .enum(["solid", "dashed", "dotted"])
        .optional()
        .nullable(),
    currentItemRoundness: zod_1.z
        .union([
        zod_1.z.enum(["sharp", "round"]),
        zod_1.z.object({
            type: zod_1.z.enum(["round", "sharp"]),
            value: zod_1.z.number().finite().min(0).max(1),
        }),
    ])
        .optional()
        .nullable(),
    currentItemFontSize: zod_1.z
        .number()
        .finite()
        .min(1)
        .max(500)
        .optional()
        .nullable(),
    currentItemFontFamily: zod_1.z
        .union([zod_1.z.number().finite().min(0), zod_1.z.string().max(200)])
        .optional()
        .nullable(),
    currentItemTextAlign: zod_1.z
        .enum(["left", "center", "right"])
        .optional()
        .nullable(),
    currentItemVerticalAlign: zod_1.z
        .enum(["top", "middle", "bottom"])
        .optional()
        .nullable(),
    scrollX: zod_1.z
        .number()
        .finite()
        .min(-10000000)
        .max(10000000)
        .optional()
        .nullable(),
    scrollY: zod_1.z
        .number()
        .finite()
        .min(-10000000)
        .max(10000000)
        .optional()
        .nullable(),
    zoom: zod_1.z
        .object({ value: zod_1.z.number().finite().min(0.01).max(100) })
        .optional()
        .nullable(),
    selection: zod_1.z.array(zod_1.z.string()).optional().nullable(),
    selectedElementIds: zod_1.z.record(zod_1.z.string(), zod_1.z.boolean()).optional().nullable(),
    selectedGroupIds: zod_1.z.record(zod_1.z.string(), zod_1.z.boolean()).optional().nullable(),
    activeEmbeddable: zod_1.z
        .object({ elementId: zod_1.z.string(), state: zod_1.z.string() })
        .optional()
        .nullable(),
    activeTool: zod_1.z
        .object({
        type: zod_1.z.string(),
        customType: zod_1.z.string().optional().nullable(),
    })
        .optional()
        .nullable(),
    cursorX: zod_1.z.number().finite().optional().nullable(),
    cursorY: zod_1.z.number().finite().optional().nullable(),
    collaborators: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional().nullable(),
})
    .catchall(zod_1.z.any().refine((val) => {
    if (typeof val === "string") {
        return (0, exports.sanitizeText)(val, 1000);
    }
    return true;
}));
const sanitizeDrawingData = (data) => {
    try {
        const sanitizedElements = exports.elementSchema.array().parse(data.elements);
        const sanitizedAppState = exports.appStateSchema.parse(data.appState);
        let sanitizedPreview = data.preview;
        if (typeof sanitizedPreview === "string") {
            sanitizedPreview = (0, exports.sanitizeSvg)(sanitizedPreview);
        }
        let sanitizedFiles = data.files;
        if (typeof sanitizedFiles === "object" && sanitizedFiles !== null) {
            sanitizedFiles = structuredClone(sanitizedFiles);
            const MAX_DATAURL_SIZE = activeConfig.maxDataUrlSize;
            const VALID_FILE_ID = /^[\w-]{1,200}$/;
            for (const fileId of Object.keys(sanitizedFiles)) {
                if (!VALID_FILE_ID.test(fileId)) {
                    delete sanitizedFiles[fileId];
                }
            }
            for (const fileId in sanitizedFiles) {
                const file = sanitizedFiles[fileId];
                if (typeof file === "object" && file !== null) {
                    for (const key in file) {
                        const value = file[key];
                        if (typeof value !== "string") {
                            file[key] = (0, exports.sanitizeText)(value, 1000);
                            continue;
                        }
                        if (key !== "dataURL") {
                            file[key] = (0, exports.sanitizeText)(value, 1000);
                            continue;
                        }
                        // dataURL is never truncated or HTML-sanitized: a base64 image body is not
                        // markup, and running injection regexes over it produces false positives that
                        // corrupt valid images. Accept a valid image dataURL verbatim, keep an already
                        // uploaded https/S3 reference, otherwise reject the whole save (naming fileId)
                        // instead of silently blanking it.
                        if (value === "") {
                            file[key] = "";
                            continue;
                        }
                        if (value.startsWith("data:")) {
                            if (!SAFE_IMAGE_DATAURL.test(value)) {
                                throw new DrawingSanitizationError(400, fileId, `Image file "${fileId}" has an invalid or unsupported image data URL and was rejected.`);
                            }
                            const base64 = value
                                .slice(value.indexOf(",") + 1)
                                .replace(/\s/g, "");
                            if (Buffer.byteLength(base64, "base64") > MAX_DATAURL_SIZE) {
                                throw new DrawingSanitizationError(413, fileId, `Image file "${fileId}" exceeds the maximum allowed size of ${MAX_DATAURL_SIZE} bytes.`);
                            }
                            file[key] = value;
                        }
                        else if (/^https?:\/\//i.test(value)) {
                            if (value.length > 2048) {
                                throw new DrawingSanitizationError(400, fileId, `Image file "${fileId}" has an invalid image URL and was rejected.`);
                            }
                            file[key] = value;
                        }
                        else if (API_FILE_REF.test(value)) {
                            file[key] = value;
                        }
                        else {
                            throw new DrawingSanitizationError(400, fileId, `Image file "${fileId}" has an invalid image reference and was rejected.`);
                        }
                    }
                }
            }
        }
        return {
            elements: sanitizedElements,
            appState: sanitizedAppState,
            files: sanitizedFiles,
            preview: sanitizedPreview,
        };
    }
    catch (error) {
        if (error instanceof DrawingSanitizationError)
            throw error;
        console.error("Data sanitization failed:", error);
        throw new Error("Invalid or malicious drawing data detected");
    }
};
exports.sanitizeDrawingData = sanitizeDrawingData;
const validateImportedDrawing = (data) => {
    try {
        if (!data || typeof data !== "object")
            return false;
        if (!Array.isArray(data.elements))
            return false;
        if (typeof data.appState !== "object")
            return false;
        if (data.elements.length > 10000) {
            throw new Error("Drawing contains too many elements (max 10,000)");
        }
        const sanitized = (0, exports.sanitizeDrawingData)(data);
        if (sanitized.elements.length !== data.elements.length) {
            throw new Error("Element count mismatch after sanitization");
        }
        return true;
    }
    catch (error) {
        console.error("Imported drawing validation failed:", error);
        return false;
    }
};
exports.validateImportedDrawing = validateImportedDrawing;
const CSRF_TOKEN_HEADER = "x-csrf-token";
const CSRF_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
const CSRF_TOKEN_FUTURE_SKEW_MS = 5 * 60 * 1000;
const CSRF_NONCE_BYTES = 16;
const CSRF_TOKEN_MAX_LENGTH = 2048;
let cachedCsrfSecret = null;
const getCsrfSecret = () => {
    if (cachedCsrfSecret)
        return cachedCsrfSecret;
    const secretFromEnv = config_1.config.csrfSecret;
    if (secretFromEnv && secretFromEnv.trim().length > 0) {
        cachedCsrfSecret = Buffer.from(secretFromEnv, "utf8");
        return cachedCsrfSecret;
    }
    cachedCsrfSecret = crypto_1.default.randomBytes(32);
    const envLabel = config_1.config.nodeEnv ? ` (${config_1.config.nodeEnv})` : "";
    console.warn(`[SECURITY WARNING] CSRF_SECRET is not set${envLabel}.\n` +
        `Using an ephemeral per-process secret.\n` +
        `  - Tokens will expire on container restart\n` +
        `  - Horizontal scaling (k8s) will NOT work\n` +
        `  - Generate a secret: openssl rand -base64 32\n` +
        `  - Set environment variable: CSRF_SECRET=<generated-secret>`);
    return cachedCsrfSecret;
};
const base64UrlEncode = (input) => {
    const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
    return buf
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
};
const base64UrlDecode = (input) => {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, "base64");
};
const signCsrfToken = (clientId, payload) => {
    const secret = getCsrfSecret();
    const data = `${clientId}|${payload.ts}|${payload.nonce}`;
    return crypto_1.default.createHmac("sha256", secret).update(data, "utf8").digest();
};
const createCsrfToken = (clientId) => {
    const payload = {
        ts: Date.now(),
        nonce: base64UrlEncode(crypto_1.default.randomBytes(CSRF_NONCE_BYTES)),
    };
    const payloadJson = JSON.stringify(payload);
    const payloadB64 = base64UrlEncode(payloadJson);
    const sigB64 = base64UrlEncode(signCsrfToken(clientId, payload));
    return `${payloadB64}.${sigB64}`;
};
exports.createCsrfToken = createCsrfToken;
const validateCsrfToken = (clientId, token) => {
    if (!token || typeof token !== "string") {
        return false;
    }
    if (token.length > CSRF_TOKEN_MAX_LENGTH) {
        return false;
    }
    try {
        const parts = token.split(".");
        if (parts.length !== 2)
            return false;
        const [payloadB64, sigB64] = parts;
        const payloadJson = base64UrlDecode(payloadB64).toString("utf8");
        const payload = JSON.parse(payloadJson);
        if (typeof payload.ts !== "number" ||
            !Number.isFinite(payload.ts) ||
            typeof payload.nonce !== "string" ||
            payload.nonce.length < 8) {
            return false;
        }
        const now = Date.now();
        if (now - payload.ts > CSRF_TOKEN_EXPIRY_MS)
            return false;
        if (payload.ts - now > CSRF_TOKEN_FUTURE_SKEW_MS)
            return false;
        const expectedSig = signCsrfToken(clientId, {
            ts: payload.ts,
            nonce: payload.nonce,
        });
        const providedSig = base64UrlDecode(sigB64);
        if (providedSig.length !== expectedSig.length)
            return false;
        return crypto_1.default.timingSafeEqual(providedSig, expectedSig);
    }
    catch {
        return false;
    }
};
exports.validateCsrfToken = validateCsrfToken;
const revokeCsrfToken = (clientId) => {
    void clientId;
};
exports.revokeCsrfToken = revokeCsrfToken;
/**
 * Get the CSRF token header name
 */
const getCsrfTokenHeader = () => {
    return CSRF_TOKEN_HEADER;
};
exports.getCsrfTokenHeader = getCsrfTokenHeader;
const getOriginFromReferer = (referer) => {
    if (typeof referer !== "string" || referer.trim().length === 0) {
        return null;
    }
    try {
        const url = new URL(referer);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return null;
        }
        return `${url.protocol}//${url.host}`;
    }
    catch {
        return null;
    }
};
exports.getOriginFromReferer = getOriginFromReferer;
