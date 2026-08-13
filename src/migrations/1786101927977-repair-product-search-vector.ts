import { MigrationInterface, QueryRunner } from "typeorm";

export class RepairProductSearchVector1786101927977
  implements MigrationInterface
{
  name = "RepairProductSearchVector1786101927977";
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS products_search_vector_trigger ON "products"`);
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "search_vector" tsvector NOT NULL DEFAULT ''::tsvector`,
    );
    await queryRunner.query(`CREATE OR REPLACE FUNCTION update_product_search_vector() RETURNS trigger AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('simple', COALESCE(NEW.normalized_name, '')), 'A') ||
          setweight(to_tsvector('simple', COALESCE(NEW.search_text, '')), 'B');
        RETURN NEW;
      END;
    $$ LANGUAGE plpgsql`);
    await queryRunner.query(
      `CREATE TRIGGER products_search_vector_trigger BEFORE INSERT OR UPDATE OF "normalized_name", "search_text" ON "products" FOR EACH ROW EXECUTE FUNCTION update_product_search_vector()`,
    );
    await queryRunner.query(`UPDATE "products" SET "search_text" = COALESCE("search_text", '')`);
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_products_search_vector" ON "products" USING GIN ("search_vector")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "idx_products_search_vector"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS products_search_vector_trigger ON "products"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_product_search_vector()`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "search_vector"`);
  }
}
