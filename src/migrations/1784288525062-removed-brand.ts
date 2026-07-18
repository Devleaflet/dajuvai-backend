import { MigrationInterface, QueryRunner } from "typeorm";

export class RemovedBrand1784288525062 implements MigrationInterface {
    name = 'RemovedBrand1784288525062'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_ea86d0c514c4ecbb5694cbf57df"`);
        await queryRunner.query(`ALTER TABLE "commission_documents" DROP CONSTRAINT "FK_commission_documents_uploadedBy"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "brandId"`);
        await queryRunner.query(`ALTER TABLE "products" ADD "brand" character varying`);
        await queryRunner.query(`ALTER TABLE "products" ADD "keywords" text`);
        await queryRunner.query(`ALTER TABLE "commission_documents" ADD CONSTRAINT "FK_f7f21d644e6c9f49dda2f525706" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "commission_documents" DROP CONSTRAINT "FK_f7f21d644e6c9f49dda2f525706"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "keywords"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "brand"`);
        await queryRunner.query(`ALTER TABLE "products" ADD "brandId" integer`);
        await queryRunner.query(`ALTER TABLE "commission_documents" ADD CONSTRAINT "FK_commission_documents_uploadedBy" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_ea86d0c514c4ecbb5694cbf57df" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
