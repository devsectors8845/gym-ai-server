"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Vercel serverless entry point. Imports the Express app built by
 * `src/index.ts` and re-exports it so Vercel's `@vercel/node` runtime
 * can hand every request to Express.
 *
 * Vercel invokes this handler with `(req, res)`, which is exactly what
 * an Express instance accepts.
 *
 * A static import (rather than `require`) is intentional: Vercel's
 * `@vercel/node` builder uses esbuild under the hood, which follows static
 * ES-module imports to inline/bundle the app code into the single
 * serverless function it produces from this file.
 */
const index_1 = __importDefault(require("../src/index"));
exports.default = index_1.default;
//# sourceMappingURL=index.js.map