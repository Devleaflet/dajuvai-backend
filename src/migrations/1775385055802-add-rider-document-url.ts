import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRiderDocumentUrl1775385055802 implements MigrationInterface {
    name = "AddRiderDocumentUrl1775385055802";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "riders" ADD "documentUrl" character varying`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "riders" DROP COLUMN "documentUrl"`);
    }
}

