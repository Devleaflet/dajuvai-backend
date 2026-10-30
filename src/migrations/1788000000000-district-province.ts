import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Gives every district its province, so address forms can offer only the
 * districts of the province a shopper picked.
 *
 * Nepal's 77 districts and their seven provinces, as of the 2015 constitution
 * and the 2017 split of Nawalparasi (Nawalpur → Gandaki, Parasi → Lumbini) and
 * Rukum (East → Lumbini, West → Karnali). The table is admin-edited, so rows are
 * matched on a letters-only, lower-cased name, and the usual alternative
 * spellings are listed too. A row that matches nothing (a typo, a test entry)
 * keeps a null province for an admin to set from the districts page.
 *
 * Parasi is added when missing: the local copy of production has 76 districts
 * and lacks it, which leaves Parasi shoppers unable to pick their own district.
 *
 * `down` drops the column and its type; an added Parasi row stays, because
 * addresses and vendors may already point at it.
 */
const PROVINCE_DISTRICTS: Record<string, string[]> = {
    Koshi: [
        "Bhojpur", "Dhankuta", "Ilam", "Jhapa", "Khotang", "Morang", "Okhaldhunga",
        "Panchthar", "Sankhuwasabha", "Solukhumbu", "Sunsari", "Taplejung", "Terhathum", "Udayapur",
        "Tehrathum", "Sankhuwasava", "Udaypur",
    ],
    Madhesh: [
        "Bara", "Dhanusha", "Mahottari", "Parsa", "Rautahat", "Saptari", "Sarlahi", "Siraha",
        "Dhanusa",
    ],
    Bagmati: [
        "Bhaktapur", "Chitwan", "Dhading", "Dolakha", "Kathmandu", "Kavrepalanchok", "Lalitpur",
        "Makwanpur", "Nuwakot", "Ramechhap", "Rasuwa", "Sindhuli", "Sindhupalchok",
        "Chitawan", "Kavre", "Kavrepalanchowk", "Makawanpur", "Sindhupalchowk",
    ],
    Gandaki: [
        "Baglung", "Gorkha", "Kaski", "Lamjung", "Manang", "Mustang", "Myagdi", "Nawalpur",
        "Parbat", "Syangja", "Tanahun",
        "Tanahu", "Nawalparasi East", "Nawalparasi (East)", "Nawalparasi Bardaghat Susta East",
    ],
    Lumbini: [
        "Arghakhanchi", "Banke", "Bardiya", "Dang", "Gulmi", "Kapilvastu", "Palpa", "Parasi",
        "Pyuthan", "Rolpa", "Rukum (East)", "Rupandehi",
        "Kapilbastu", "Dang Deukhuri", "Rukum East", "Eastern Rukum",
        "Nawalparasi West", "Nawalparasi (West)", "Nawalparasi Bardaghat Susta West",
    ],
    Karnali: [
        "Dailekh", "Dolpa", "Humla", "Jajarkot", "Jumla", "Kalikot", "Mugu", "Rukum (West)",
        "Salyan", "Surkhet",
        "Rukum West", "Western Rukum",
    ],
    Sudurpashchim: [
        "Achham", "Baitadi", "Bajhang", "Bajura", "Dadeldhura", "Darchula", "Doti", "Kailali",
        "Kanchanpur",
        "Accham",
    ],
};

const key = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");
const KEY_SQL = `regexp_replace(lower("name"), '[^a-z]', '', 'g')`;

export class DistrictProvince1788000000000 implements MigrationInterface {
    name = "DistrictProvince1788000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "public"."district_province_enum" AS ENUM
            ('Koshi', 'Madhesh', 'Bagmati', 'Gandaki', 'Lumbini', 'Karnali', 'Sudurpashchim')
        `);
        await queryRunner.query(`ALTER TABLE "district" ADD "province" "public"."district_province_enum"`);

        const pairs = Object.entries(PROVINCE_DISTRICTS).flatMap(([province, names]) =>
            names.map((name) => [key(name), province]),
        );
        const values = pairs.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ");
        await queryRunner.query(
            `UPDATE "district" d
             SET "province" = m.province::"public"."district_province_enum"
             FROM (VALUES ${values}) AS m(key, province)
             WHERE regexp_replace(lower(d."name"), '[^a-z]', '', 'g') = m.key`,
            pairs.flat(),
        );

        await queryRunner.query(
            `INSERT INTO "district" ("name", "province")
             SELECT 'Parasi', 'Lumbini'
             WHERE NOT EXISTS (SELECT 1 FROM "district" WHERE ${KEY_SQL} = ANY($1))`,
            [["parasi", "nawalparasiwest", "nawalparasibardaghatsustawest"]],
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "district" DROP COLUMN "province"`);
        await queryRunner.query(`DROP TYPE "public"."district_province_enum"`);
    }
}
