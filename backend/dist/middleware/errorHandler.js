"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = exports.errorHandler = void 0;
const config_1 = require("../config");
/**
 * Error handler middleware
 * Should be added last in the middleware chain
 */
const errorHandler = (err, req, res, _next) => {
    const statusCode = err.statusCode || 500;
    const isDevelopment = config_1.config.nodeEnv === "development";
    console.error("Error:", {
        message: err.message,
        stack: err.stack,
        statusCode,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
    });
    if (!isDevelopment) {
        if (statusCode >= 500) {
            res.status(statusCode).json({
                error: "Internal server error",
                message: "An error occurred while processing your request",
            });
            return;
        }
        res.status(statusCode).json({
            error: "Request error",
            message: err.isOperational ? err.message : "Invalid request",
        });
        return;
    }
    res.status(statusCode).json({
        error: err.message,
        stack: err.stack,
        statusCode,
    });
};
exports.errorHandler = errorHandler;
/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
