import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Address } from "./address.entity";
import { Vendor } from "./vendor.entity";

@Entity('district')
export class District {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    name: string

    @OneToMany(() => Address, address => address.district)
    addresses: Address[];

    @OneToMany(() => Vendor, vendor => vendor.district)
    vendors: Vendor[];
}