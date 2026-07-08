import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserProfilePicture1775385055803 implements MigrationInterface {
    name = "AddUserProfilePicture1775385055803";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "user" ADD "profilePicture" character varying`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "profilePicture"`);
    }
}
