import { MigrationInterface, QueryRunner } from "typeorm";

export class SearchQueryLearning1786100000001 implements MigrationInterface {
  name = "SearchQueryLearning1786100000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "search_query_metrics" ("id" SERIAL PRIMARY KEY, "normalized_query" text NOT NULL, "locale" varchar(16) NOT NULL DEFAULT 'und', "day_bucket" date NOT NULL, "search_count" integer NOT NULL DEFAULT 0, "zero_result_count" integer NOT NULL DEFAULT 0, "updated_at" timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_search_query_metric" ON "search_query_metrics" ("normalized_query", "locale", "day_bucket")`);
    await queryRunner.query(`CREATE TABLE "search_alias_candidates" ("id" SERIAL PRIMARY KEY, "normalized_query" text NOT NULL, "target_type" varchar(16) NOT NULL, "target_id" integer NOT NULL, "search_count" integer NOT NULL DEFAULT 0, "positive_outcome_count" integer NOT NULL DEFAULT 0, "confidence" numeric(4,3) NOT NULL DEFAULT 0, "active" boolean NOT NULL DEFAULT false, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_search_alias_candidate" ON "search_alias_candidates" ("normalized_query", "target_type", "target_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "search_alias_candidates"');
    await queryRunner.query('DROP TABLE "search_query_metrics"');
  }
}
