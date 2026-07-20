
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToOne, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from './user.entity';
import { Order } from './order.entity';
import { District } from './district.entity';

export enum Province {
    Koshi = 'Koshi',
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

    @ManyToOne(() => District, (district) => district.addresses, { nullable: true, eager: true })
    @JoinColumn({ name: 'districtId' })
    districtRef: District | null;

    @Column({ nullable: true })
    districtId: number | null;

    @Column()
    city: string;

    @Column({ nullable: true })
    localAddress: string;

    @Column({nullable: true})
    landmark: string;

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
