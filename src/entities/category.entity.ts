import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import { User } from './user.entity';
import { Subcategory } from './subcategory.entity';


@Entity()
export class Category {
    @PrimaryGeneratedColumn()
    id: number;

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
