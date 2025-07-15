import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('contacts')
export class Contact {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 100 })
    firstName: string;

    @Column({ length: 100 })
    lastName: string;

    @Column({ unique: false })
    email: string;

    @Column({ length: 20, nullable: true })
    phone: string;

    @Column({ length: 255 })
    subject: string;

    @Column('text')
    message: string;

    @CreateDateColumn()
    createdAt: Date;
}
