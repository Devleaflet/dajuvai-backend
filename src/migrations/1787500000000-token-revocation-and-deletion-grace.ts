import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Token revocation, and the column that lets a password change end every
 * session at once.
 *
 * Until now a signed JWT was valid until it expired, full stop: logging out
 * cleared a cookie the browser had, and changing a password did nothing to the
 * tokens already in someone else's hands. The admin token is signed for seven
 * days, so a leaked one was good for a week.
 *
 * Two mechanisms, because they answer different questions:
 *
 * - **`revoked_tokens`** — one row per revoked `jti`. Answers "has *this*
 *   token been withdrawn?", which is what logout needs. Rows are trimmed once
 *   the token would have expired anyway; a `jti` past its own expiry cannot be
 *   replayed regardless.
 * - **`tokensValidFrom`** — a timestamp on the account. Answers "is this token
 *   older than the last time we invalidated everything?", which is what a
 *   password change, a reset and an admin-forced sign-out need. One column
 *   write revokes an unbounded number of tokens, including ones we have never
 *   seen.
 *
 * Additive and nullable: existing tokens carry no `jti` and every account has
 * `tokensValidFrom` NULL, which the middleware treats as "nothing revoked". So
 * this can be applied before the code that uses it without signing anyone out.
 */
export class TokenRevocationAndDeletionGrace1787500000000 implements MigrationInterface {
    name = "TokenRevocationAndDeletionGrace1787500000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "revoked_tokens" (
                "id" SERIAL PRIMARY KEY,
                "jti" character varying(64) NOT NULL,
                "subjectType" character varying(16) NOT NULL,
                "subjectId" integer NOT NULL,
                "reason" character varying(64),
                -- When the token would have expired on its own. The cleanup job
                -- deletes rows past this: keeping them forever would grow a
                -- table that is read on every authenticated request.
                "expiresAt" TIMESTAMP NOT NULL,
                "revokedAt" TIMESTAMP NOT NULL DEFAULT now()
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_revoked_tokens_jti"
            ON "revoked_tokens" ("jti")
        `);

        // The cleanup sweep, and the "sign this account out everywhere" read.
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_revoked_tokens_expires_at"
            ON "revoked_tokens" ("expiresAt")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_revoked_tokens_subject"
            ON "revoked_tokens" ("subjectType", "subjectId")
        `);

        await queryRunner.query(`
            ALTER TABLE "user"
            ADD COLUMN IF NOT EXISTS "tokensValidFrom" TIMESTAMP
        `);
        await queryRunner.query(`
            ALTER TABLE "vendor"
            ADD COLUMN IF NOT EXISTS "tokensValidFrom" TIMESTAMP
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vendor" DROP COLUMN IF EXISTS "tokensValidFrom"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "tokensValidFrom"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "revoked_tokens"`);
    }
}
