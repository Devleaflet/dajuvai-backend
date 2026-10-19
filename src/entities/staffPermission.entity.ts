import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";
import { User } from "./user.entity";
import { ModuleName, PermissionLevel, PermissionAction } from "./permission.enum";

@Entity("staff_permissions")
@Index(["staffId", "module"])
export class StaffPermission{
    @PrimaryGeneratedColumn()
    id:number;

    @Column()
    staffId: number;

    @ManyToOne(()=>User, {onDelete: "CASCADE"})
    @JoinColumn({name:"staffId"})
    staff: User;

    @Column({type:"enum", enum: ModuleName})
    module: ModuleName

    @Column({type: "enum", enum: PermissionLevel})
    permissionLevel: PermissionLevel

    @Column({type: "enum", enum: PermissionAction})
    permissionAction: PermissionAction

    @CreateDateColumn()
    createdAt: Date;
}