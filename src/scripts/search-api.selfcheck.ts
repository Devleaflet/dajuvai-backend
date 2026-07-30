import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (file: string): string => fs.readFileSync(path.join(root, file), "utf8");

const service = read("service/search.service.ts");
const controller = read("controllers/search.controller.ts");
const route = read("routes/search.routes.ts");

assert(service.includes("SET LOCAL statement_timeout = '1500ms'"));
assert(service.includes("Promise.all"));
assert(service.includes('addSelect("category.image", "image")'));
assert(controller.includes("searchSuggestionSchema.safeParse"));
assert(route.includes('router.get("/suggestions"'));
