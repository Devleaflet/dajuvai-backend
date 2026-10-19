import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDeliveryAssignment1786101927975 implements MigrationInterface {
    name = 'AddDeliveryAssignment1786101927975'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_products_search_vector"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_search_alias_active_normalized"`);
        await queryRunner.query(`ALTER TABLE "search_aliases" DROP CONSTRAINT IF EXISTS "chk_search_alias_confidence"`);
        await queryRunner.query(`ALTER TABLE "search_aliases" DROP CONSTRAINT IF EXISTS "chk_search_alias_length"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "search_vector"`);
        await queryRunner.query(`ALTER TABLE "search_aliases" DROP COLUMN IF EXISTS "created_at"`);
        await queryRunner.query(`ALTER TABLE "search_aliases" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "search_aliases" DROP COLUMN IF EXISTS "updated_at"`);
        await queryRunner.query(`ALTER TABLE "search_aliases" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "search_alias_candidates" DROP COLUMN IF EXISTS "created_at"`);
        await queryRunner.query(`ALTER TABLE "search_alias_candidates" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "search_alias_candidates" DROP COLUMN IF EXISTS "updated_at"`);
        await queryRunner.query(`ALTER TABLE "search_alias_candidates" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "search_query_metrics" DROP COLUMN IF EXISTS "updated_at"`);
        await queryRunner.query(`ALTER TABLE "search_query_metrics" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_search_alias_normalized" ON "search_aliases" ("normalized_alias", "normalized_canonical") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_search_alias_normalized"`);
        await queryRunner.query(`ALTER TABLE "search_query_metrics" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "search_query_metrics" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "search_alias_candidates" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "search_alias_candidates" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "search_alias_candidates" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "search_alias_candidates" ADD "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "search_aliases" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "search_aliases" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "search_aliases" DROP COLUMN "created_at"`);
        await queryRunner.query(`ALTER TABLE "search_aliases" ADD "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "products" ADD "search_vector" tsvector NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "search_aliases" ADD CONSTRAINT "chk_search_alias_length" CHECK (((char_length(normalized_alias) >= 2) AND (char_length(normalized_alias) <= 80)))`);
        await queryRunner.query(`ALTER TABLE "search_aliases" ADD CONSTRAINT "chk_search_alias_confidence" CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))`);
        await queryRunner.query(`CREATE INDEX "idx_search_alias_active_normalized" ON "search_aliases" ("locale", "normalized_alias", "normalized_canonical") WHERE ((active = true) AND (approved_at IS NOT NULL))`);
        await queryRunner.query(`CREATE INDEX "idx_products_search_vector" ON "products" ("search_vector") `);
    }

}
