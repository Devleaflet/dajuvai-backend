import { Entity, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Category } from "./category.entity";
import { User } from "./user.entity";

@Entity("homecategory")
export class HomeCategory {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Category, { eager: true }) 
    category: Category;

    @ManyToOne(() => User)
    createdBy: User;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
