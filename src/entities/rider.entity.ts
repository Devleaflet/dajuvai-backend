import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    OneToMany,
    OneToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from "typeorm";
import { User } from "./user.entity";
import { DeliveryAssignment } from "./deliveryAssignment.entity";

@Entity("riders")
export class Rider {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    fullName: string;

    @Column({ unique: true })
    phoneNumber: string;

    @Column({ nullable: true })
    email: string;

    @Column({ default: false })
    onDelivery: boolean;

    @OneToOne(() => User, { nullable: true })
    @JoinColumn({ name: "userId" })
    user: User;

    @Column({ nullable: true, unique: true })
    userId: number;

    @OneToMany(() => DeliveryAssignment, (a) => a.rider)
    assignments: DeliveryAssignment[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
