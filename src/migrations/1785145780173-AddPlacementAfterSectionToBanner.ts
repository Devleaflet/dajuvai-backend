import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPlacementAfterSectionToBanner1785145780173 implements MigrationInterface {
    name = 'AddPlacementAfterSectionToBanner1785145780173'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "banners" ADD "placementAfterSection" integer`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "banners" DROP COLUMN "placementAfterSection"`);
    }

}
