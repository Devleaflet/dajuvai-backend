// import { Column, CreateDateColumn, Entity, OneToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
// import { Vendor } from "./vendor.entity";

// @Entity('vendor_addresses')
// export class VendorAddress {
//     @PrimaryGeneratedColumn()
//     id: number;

//     @Column()
//     province: string;

//     @Column()
//     city: string;

//     @Column()
//     streetAddress: string;

//     @OneToOne(() => Vendor, (vendor) => vendor.address)
//     vendor: Vendor;

//     @CreateDateColumn()
//     createdAt: Date;

//     @UpdateDateColumn()
//     updatedAt: Date;
// }