
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from './user.entity';
import { Order } from './order.entity';

export enum Province {
    PROVINCE_1 = 'Province 1',
    MADHESH = 'Madhesh',
    BAGMATI = 'Bagmati',
    GANDAKI = 'Gandaki',
    LUMBINI = 'Lumbini',
    KARNALI = 'Karnali',
    SUDURPASHCHIM = 'Sudurpashchim'
}

@Entity('addresses')
export class Address {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'enum', enum: Province, nullable: true })
    province: Province;

    @Column({ nullable: true })
    district: string;

    @Column()
    city: string;

    @Column({ nullable: true })
    localAddress: string;

    @OneToOne(() => User, user => user.address, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column()
    userId: number;

    @OneToMany(() => Order, order => order.shippingAddress)
    orders: Order[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
