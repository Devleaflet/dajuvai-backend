import { MigrationInterface, QueryRunner } from "typeorm";

// Banners created before the placementAfterSection column existed would
// otherwise silently stop rendering anywhere on the homepage once the
// SidebarBannerStrip lookup starts requiring a non-null placement.
export class BackfillPlacementAfterSectionForExistingSidebarBanners1785145800000 implements MigrationInterface {
    name = 'BackfillPlacementAfterSectionForExistingSidebarBanners1785145800000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "banners" SET "placementAfterSection" = 3 WHERE "type" = 'SIDEBAR' AND "placementAfterSection" IS NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Not reversible without knowing which rows this backfilled versus
        // were explicitly set to 3 by an admin; intentionally a no-op.
    }

}
