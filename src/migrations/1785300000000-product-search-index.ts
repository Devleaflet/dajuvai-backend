import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductSearchIndex1785300000000 implements MigrationInterface {
  name = "ProductSearchIndex1785300000000";
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS unaccent');
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "normalized_name" text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "search_text" text NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_products_normalized_name_trgm"
      ON "products" USING GIN ("normalized_name" gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_products_search_text_trgm"
      ON "products" USING GIN ("search_text" gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_products_catalog_created"
      ON "products" ("created_at" DESC)
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX CONCURRENTLY IF EXISTS "idx_products_catalog_created"');
    await queryRunner.query('DROP INDEX CONCURRENTLY IF EXISTS "idx_products_search_text_trgm"');
    await queryRunner.query('DROP INDEX CONCURRENTLY IF EXISTS "idx_products_normalized_name_trgm"');
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "search_text",
      DROP COLUMN IF EXISTS "normalized_name"
    `);
  }
}
