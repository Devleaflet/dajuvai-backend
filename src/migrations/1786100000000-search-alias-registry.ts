import { MigrationInterface, QueryRunner } from "typeorm";

export class SearchAliasRegistry1786100000000 implements MigrationInterface {
  name = "SearchAliasRegistry1786100000000";
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "search_aliases" (
        "id" SERIAL PRIMARY KEY,
        "canonical_term" text NOT NULL,
        "normalized_canonical" text NOT NULL,
        "alias" text NOT NULL,
        "normalized_alias" text NOT NULL,
        "category_id" integer NULL,
        "subcategory_id" integer NULL,
        "locale" varchar(16) NULL,
        "source" varchar(20) NOT NULL,
        "confidence" numeric(4,3) NOT NULL,
        "active" boolean NOT NULL DEFAULT false,
        "approved_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_search_alias_length" CHECK (char_length("normalized_alias") BETWEEN 2 AND 80),
        CONSTRAINT "chk_search_alias_confidence" CHECK ("confidence" >= 0 AND "confidence" <= 1)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_search_alias_active_normalized"
      ON "search_aliases" ("normalized_alias", "normalized_canonical", "locale")
      WHERE "active" = true AND "approved_at" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX CONCURRENTLY IF EXISTS "idx_search_alias_active_normalized"');
    await queryRunner.query('DROP TABLE IF EXISTS "search_aliases"');
  }
}
