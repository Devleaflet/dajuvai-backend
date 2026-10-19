import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * A slug a record used to have.
 *
 * When a product, store or category is renamed its slug follows the new name,
 * but links to the old one are already in search indexes, shared chats and
 * bookmarks. Resolving an old slug here lets the client redirect to the
 * current one instead of answering 404.
 *
 * `(entityType, slug)` is unique: an old slug is never handed to a different
 * record, so a stale link can only ever land on the record it was made for.
 */
@Entity("slug_redirects")
@Index(["entityType", "slug"], { unique: true })
@Index(["entityType", "entityId"])
export class SlugRedirect {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: "varchar", length: 32 })
    entityType: string;

    @Column({ type: "varchar", length: 128 })
    slug: string;

    @Column({ type: "int" })
    entityId: number;

    @CreateDateColumn({ type: "timestamp" })
    createdAt: Date;
}
