import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn, ManyToOne, Index } from 'typeorm';
import { User } from './user.entity';
import { Subcategory } from './subcategory.entity';


@Entity()
export class Category {
    @PrimaryGeneratedColumn()
    id: number;

    /** URL identifier derived from the name. Assigned by `SlugSubscriber`; never written directly. */
    @Index("UQ_category_slug", { unique: true })
    @Column({ type: "varchar", length: 128 })
    slug: string;

    @Column({ unique: true })
    name: string;

    @Column({ nullable: true })
    image: string;

    @Column({ type: 'boolean', default: false })
    isAgeRestricted: boolean;

    @Column({ type: 'integer', nullable: true })
    minimumAge: number | null;

    @Column({ type: 'varchar', nullable: true })
    restrictionMessage: string | null;
    
    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @ManyToOne(() => User)
    createdBy: User;

    @OneToMany(() => Subcategory, (subcategory) => subcategory.category)
    subcategories: Subcategory[];
}
