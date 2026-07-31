import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(__dirname, "../migrations/1785600000000-promo-usage-limits.ts");
const migrationSource = fs.readFileSync(migrationPath, "utf8");

assert.match(migrationSource, /class PromoUsageLimits1785600000000/);
assert.match(migrationSource, /ADD "maxUsageCount" integer NOT NULL DEFAULT '0'/);
assert.match(migrationSource, /ADD "usageCount" integer NOT NULL DEFAULT '0'/);
assert.match(migrationSource, /DROP COLUMN "usageCount"/);
assert.match(migrationSource, /DROP COLUMN "maxUsageCount"/);

const timestampMigrationPath = path.resolve(__dirname, "../migrations/1785700000000-promo-timestamps.ts");
const timestampMigrationSource = fs.readFileSync(timestampMigrationPath, "utf8");

assert.match(timestampMigrationSource, /class PromoTimestamps1785700000000/);
assert.match(timestampMigrationSource, /ADD COLUMN IF NOT EXISTS "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP/);
assert.match(timestampMigrationSource, /ADD COLUMN IF NOT EXISTS "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP/);
assert.match(timestampMigrationSource, /DROP COLUMN IF EXISTS "updatedAt"/);
assert.match(timestampMigrationSource, /DROP COLUMN IF EXISTS "createdAt"/);

console.log("promo usage schema self-check passed");
