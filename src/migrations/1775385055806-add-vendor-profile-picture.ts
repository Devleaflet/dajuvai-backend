import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVendorProfilePicture1775385055806 implements MigrationInterface {
    name = "AddVendorProfilePicture1775385055806";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "vendor" ADD "profilePicture" character varying`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vendor" DROP COLUMN "profilePicture"`);
    }
}
