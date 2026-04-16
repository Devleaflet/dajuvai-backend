/**
 * Script: check-and-migrate-provinces.ts
 *
 * Usage:
 *   1. Check province distribution per user (dry-run):
 *      ts-node scripts/check-and-migrate-provinces.ts
 *
 *   2. Migrate "Province 1" → "Koshi" in the database:
 *      ts-node scripts/check-and-migrate-provinces.ts --migrate
 */

import 'reflect-metadata';
import AppDataSource from '../src/config/db.config';

const OLD_VALUE = 'Province 1';
const NEW_VALUE = 'Koshi';

async function checkProvinces() {
    const queryRunner = AppDataSource.createQueryRunner();

    // Group users by province
    const rows: { province: string; count: string }[] = await queryRunner.query(`
        SELECT a.province, COUNT(u.id) AS count
        FROM addresses a
        JOIN "user" u ON u.id = a."userId"
        GROUP BY a.province
        ORDER BY a.province
    `);

    console.log('\n=== Province distribution across users ===\n');

    if (rows.length === 0) {
        console.log('No address records found.');
    } else {
        const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
        for (const row of rows) {
            const label = row.province ?? 'NULL';
            const flag = label === OLD_VALUE ? '  <-- needs migration' : '';
            console.log(`  ${label.padEnd(20)} ${String(row.count).padStart(4)} users${flag}`);
        }
        console.log(`  ${'TOTAL'.padEnd(20)} ${String(total).padStart(4)} users`);
    }

    // Show detail: which users have "Province 1"
    const affected: { userId: number; fullName: string; email: string; province: string }[] =
        await queryRunner.query(`
            SELECT u.id AS "userId", u."fullName", u.email, a.province
            FROM addresses a
            JOIN "user" u ON u.id = a."userId"
            WHERE a.province = $1
        `, [OLD_VALUE]);

    console.log(`\n=== Users with province "${OLD_VALUE}" (${affected.length} found) ===\n`);

    if (affected.length === 0) {
        console.log(`  None — no migration needed.`);
    } else {
        for (const user of affected) {
            console.log(`  User #${user.userId} | ${user.fullName ?? 'N/A'} | ${user.email ?? 'N/A'}`);
        }
    }

    await queryRunner.release();
    return affected.length;
}

async function migrateProvinces() {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.startTransaction();

    try {
        // PostgreSQL enum values cannot be renamed directly — we update the stored string value
        // The ALTER TYPE ... RENAME VALUE approach is used for the enum type itself (see note below).

        // Step 1: Rename the enum value in the PostgreSQL type
        // This requires Postgres 10+. If you're on an older version, skip this and rely on step 2 only.
        try {
            await queryRunner.query(`
                ALTER TYPE addresses_province_enum RENAME VALUE '${OLD_VALUE}' TO '${NEW_VALUE}'
            `);
            console.log(`\n  [OK] Enum type updated: "${OLD_VALUE}" → "${NEW_VALUE}"`);
        } catch (enumErr: any) {
            console.warn(`\n  [WARN] Could not rename enum type value (may already be renamed): ${enumErr.message}`);
        }

        // Step 2: Update all existing rows that still have the old value
        const result = await queryRunner.query(`
            UPDATE addresses
            SET province = $1
            WHERE province = $2
        `, [NEW_VALUE, OLD_VALUE]);

        const updatedCount = result[1] ?? 0;
        console.log(`  [OK] Updated ${updatedCount} address row(s) from "${OLD_VALUE}" to "${NEW_VALUE}"`);

        await queryRunner.commitTransaction();
        console.log('\n  Migration committed successfully.\n');
    } catch (err) {
        await queryRunner.rollbackTransaction();
        console.error('\n  Migration failed — transaction rolled back.\n', err);
        throw err;
    } finally {
        await queryRunner.release();
    }
}

async function main() {
    const shouldMigrate = process.argv.includes('--migrate');

    await AppDataSource.initialize();
    console.log('Database connected.');

    const affectedCount = await checkProvinces();

    if (shouldMigrate) {
        if (affectedCount === 0) {
            console.log('\nNo rows with "Province 1" found — nothing to migrate.');
        } else {
            console.log(`\nRunning migration: "${OLD_VALUE}" → "${NEW_VALUE}" ...\n`);
            await migrateProvinces();
        }
    } else {
        console.log('\n[Dry run] Pass --migrate flag to apply the changes.\n');
        console.log('  ts-node scripts/check-and-migrate-provinces.ts --migrate\n');
    }

    await AppDataSource.destroy();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
