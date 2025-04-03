import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity()
class Account {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('text')
    username!: string;

    @Column('text')
    password!: string;

    @Column('boolean', { default: true })
    isActive!: boolean;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}

@Entity()
class Task {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('integer')
    accountId!: number;

    @Column('text')
    shareLink!: string;

    @Column('text', { nullable: true })
    videoType!: string;

    @Column('text', { default: 'pending' })
    status!: string;

    @Column('text', { nullable: true })
    lastError!: string;

    @Column('datetime', { nullable: true })
    lastCheckTime!: Date;

    @Column('datetime', { nullable: true })
    lastFileUpdateTime!: Date;

    @Column('text', { nullable: true })
    resourceName!: string;

    @Column('integer', { default: 0 })
    totalEpisodes!: number;

    @Column('integer', { default: 0 })
    currentEpisodes!: number;

    @Column('text', { nullable: true })
    targetFolderId!: string;

    @Column('text', { nullable: true })
    targetFolderName!: string;

    @Column('text', { nullable: true })
    shareFileId!: string;

    @Column('text', { nullable: true })
    shareFolderId!: string;

    @Column('text', { nullable: true })
    shareFolderName!: string;

    @Column('text', { nullable: true })
    shareId!: string;
    
    @Column('text', { nullable: true })
    shareMode!: string;

    @Column('text', { nullable: true })
    pathType!: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @Column('text', { nullable: true })
    accessCode!: string;

    @Column('text', { nullable: true })
    sourceRegex!: string;
    
    @Column('text', { nullable: true })
    targetRegex!: string;

    @Column('integer', { nullable: true, default: 0 })
    episodeThreshold!: number;

    @Column('text', { nullable: true })
    episodeRegex!: string;

    @Column('text', { nullable: true })
    whitelistKeywords!: string;

    @Column('text', { nullable: true })
    blacklistKeywords!: string;
}

@Entity()
class TaskLog {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('integer')
    taskId!: number;

    @Column('text')
    message!: string;

    @CreateDateColumn()
    createdAt!: Date;
}

@Entity('sessions')
@Index(['expiredAt'])
class Session {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column('bigint')
    expiredAt!: number;

    @Column('text', { nullable: true })
    data!: string;

    @Column('text', { nullable: true })
    json!: string;
}

export { Account, Task, TaskLog, Session };
export default { Account, Task, TaskLog, Session };