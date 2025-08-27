import { Column, CreateDateColumn, Entity, JoinColumn, OneToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm"
import { Product } from './product.entity';
import { Address } from "./address.entity";
import { Order } from "./order.entity";


export enum AuthProvider {
    LOCAL = "local",
    FACEBOOK = "facebook",
    GOOGLE = "google",
}

export enum UserRole {
    ADMIN = "admin",
    USER = "user",
    STAFF = "staff"
}

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ nullable: true })
    fullName: string;

    @Column({ nullable: true })
    username: string;

    @Column({ unique: true, nullable: true })
    email: string;

    @Column({unique: true, nullable: true})
    phoneNumber: string;

    @Column({
        type: "enum",
        enum: UserRole,
        default: UserRole.USER
    })
    role: UserRole;

    @OneToMany(() => Product, (product) => product.vendor)
    products: Product[]
    @OneToOne(() => Address, (address) => address.user, { cascade: true, eager: true })
    address: Address;

    @Column({ nullable: true })
    addressId: number;

    @OneToMany(() => Order, (order) => order.orderedBy)
    orders: Order[];

    @Column({ nullable: true })
    googleId?: string

    @Column({ nullable: true })
    facebookId?: string

    @Column({
        type: "enum",
        enum: AuthProvider,
        default: AuthProvider.LOCAL
    })
    provider: AuthProvider;

    @Column({ default: false })
    isVerified: boolean

    @Column({ nullable: true })
    password?: string

    @Column({ nullable: true })
    verificationCode?: string; // for email verification 

    @Column({ nullable: true })
    verificationCodeExpire?: Date // for email verification 

    @Column({ nullable: true })
    resetToken?: string //for forgot password 

    @Column({ nullable: true })
    resetTokenExpire?: Date //for forgot password 

    @Column({ default: 0, nullable: true })
    resendCount: number; // Tracks number of resend attempts

    @Column({ nullable: true })
    resendBlockUntil?: Date; // Blocks resends until this time

    @CreateDateColumn()
    createdAt: Date

    @UpdateDateColumn()
    updatedAt: Date;
}