import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, PrimaryColumn } from 'typeorm';
import { ISession } from 'connect-typeorm';

@Entity()
export class Account {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    username!: string;

    @Column()
    password!: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}

@Entity()
export class Task {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('text')
    shareLink!: string;

    @Column()
    accountId!: number;

    @Column()
    shareId!: string;

    @Column('text', { nullable: true })
    shareFolderId!: string;

    @Column()
    shareFileId!: string;

    @Column({ nullable: true })
    shareFolderName?: string;

    @Column('text', { nullable: true })
    videoType!: string;

    @Column('datetime', { nullable: true })
    lastCheckTime!: Date;

    @Column('datetime', { nullable: true })
    lastFileUpdateTime!: Date;

    @Column()
    resourceName!: string;

    @Column()
    targetFolderId!: string;

    @Column({ nullable: true })
    targetFolderName?: string;

    @Column({ default: 0 })
    currentEpisodes!: number;

    @Column({ default: 0 })
    totalEpisodes!: number;

    @Column({ default: 0 })
    episodeThreshold!: number;

    @Column({ nullable: true })
    episodeRegex?: string;

    @Column({ nullable: true })
    sourceRegex?: string;

    @Column({ nullable: true })
    targetRegex?: string;

    @Column({ nullable: true })
    whitelistKeywords?: string;

    @Column({ nullable: true })
    blacklistKeywords?: string;

    @Column({ default: 'pending' })
    status!: string;

    @Column({ default: 0 })
    shareMode!: number;

    @Column({ nullable: true })
    accessCode?: string;

    @Column('text', { nullable: true })
    pathType!: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}

@Entity()
export class TaskLog {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    taskId!: number;

    @Column()
    message!: string;

    @CreateDateColumn()
    createdAt!: Date;
}

@Entity('sessions')
export class Session implements ISession {
    @PrimaryColumn('varchar')
    id: string = '';

    @Index()
    @Column('bigint')
    expiredAt: number = Date.now();

    @Column('text')
    json: string = '';

    @CreateDateColumn()
    createdAt: Date = new Date();

    @UpdateDateColumn()
    updatedAt: Date = new Date();
}