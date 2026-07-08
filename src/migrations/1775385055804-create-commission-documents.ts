import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCommissionDocuments1775385055804 implements MigrationInterface {
    name = "CreateCommissionDocuments1775385055804";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "commission_documents" (
                "id" SERIAL NOT NULL,
                "title" character varying NOT NULL,
                "fileUrl" character varying NOT NULL,
                "fileName" character varying,
                "isActive" boolean NOT NULL DEFAULT true,
                "uploadedById" integer,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_commission_documents_id" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_commission_documents_isActive" ON "commission_documents" ("isActive")
        `);

        await queryRunner.query(`
            ALTER TABLE "commission_documents"
            ADD CONSTRAINT "FK_commission_documents_uploadedBy"
            FOREIGN KEY ("uploadedById") REFERENCES "user"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "commission_documents" DROP CONSTRAINT "FK_commission_documents_uploadedBy"`);
        await queryRunner.query(`DROP INDEX "IDX_commission_documents_isActive"`);
        await queryRunner.query(`DROP TABLE "commission_documents"`);
    }
}
