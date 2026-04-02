import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from "typeorm";
import { Order } from "./order.entity";
import { Rider } from "./rider.entity";

export enum AssignmentStatus {
    ASSIGNED = "assigned",
    PICKED_UP = "picked_up",
    DELIVERED = "delivered",
    FAILED = "failed",
}

@Entity("delivery_assignments")
export class DeliveryAssignment {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Order, { onDelete: "CASCADE" })
    @JoinColumn({ name: "orderId" })
    order: Order;

    @Column()
    orderId: number;

    @ManyToOne(() => Rider, (rider) => rider.assignments)
    @JoinColumn({ name: "riderId" })
    rider: Rider;

    @Column()
    riderId: number;

    @Column({ default: AssignmentStatus.ASSIGNED })
    assignmentStatus: AssignmentStatus;

    @Column({ nullable: true })
    pickedUpAt: Date;

    @Column({ nullable: true })
    deliveredAt: Date;

    @Column({ nullable: true, type: "text" })
    failureReason: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
