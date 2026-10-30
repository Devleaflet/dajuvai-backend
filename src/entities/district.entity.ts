import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Address } from "./address.entity";
import { Province } from "./province.enum";
import { Vendor } from "./vendor.entity";

@Entity('district')
export class District {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    name: string

    /** Null only for a row the province migration could not place; an admin sets it. */
    @Column({ type: 'enum', enum: Province, nullable: true })
    province: Province | null;

    @OneToMany(() => Address, address => address.district)
    addresses: Address[];

    @OneToMany(() => Vendor, vendor => vendor.district)
    vendors: Vendor[];
}