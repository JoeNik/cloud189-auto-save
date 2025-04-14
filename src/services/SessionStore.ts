import { Repository } from 'typeorm';
import { ISession } from 'connect-typeorm';
import { Session } from '../entities';
import { Store } from 'express-session';

export class CustomSessionStore extends Store {
    private repository: Repository<Session>;

    constructor(repository: Repository<Session>) {
        super();
        this.repository = repository;
    }

    async get(id: string, callback: (err: any, session?: any) => void): Promise<void> {
        try {
            const session = await this.repository.findOne({ where: { id } });
            if (!session) {
                return callback(null);
            }
            
            if (session.expiredAt < Date.now()) {
                await this.repository.remove(session);
                return callback(null);
            }
            
            try {
                const data = JSON.parse(session.json);
                callback(null, data);
            } catch (err) {
                callback(err);
            }
        } catch (err) {
            callback(err);
        }
    }

    async set(id: string, data: any, callback?: (err?: any) => void): Promise<void> {
        try {
            const session = await this.repository.findOne({ where: { id } });
            const expiredAt = typeof data.cookie?.expires === 'number' 
                ? data.cookie.expires
                : typeof data.cookie?.expires === 'string' 
                    ? new Date(data.cookie.expires).getTime() 
                    : Date.now() + 86400000;

            if (session) {
                // 更新现有会话
                session.expiredAt = expiredAt;
                session.json = JSON.stringify(data);
                await this.repository.save(session);
            } else {
                // 创建新会话
                const newSession = this.repository.create({
                    id,
                    expiredAt,
                    json: JSON.stringify(data)
                });
                await this.repository.save(newSession);
            }
            
            callback?.();
        } catch (err) {
            console.error('保存会话时出错:', err);
            callback?.(err);
        }
    }

    async destroy(id: string, callback?: (err?: any) => void): Promise<void> {
        try {
            await this.repository
                .createQueryBuilder()
                .delete()
                .where('id = :id', { id })
                .execute();
            callback?.();
        } catch (err) {
            callback?.(err);
        }
    }

    async touch(id: string, data: any, callback?: (err?: any) => void): Promise<void> {
        try {
            const session = await this.repository.findOne({ where: { id } });
            if (session) {
                const expiredAt = typeof data.cookie?.expires === 'number'
                    ? data.cookie.expires
                    : typeof data.cookie?.expires === 'string'
                        ? new Date(data.cookie.expires).getTime()
                        : Date.now() + 86400000;
                
                session.expiredAt = expiredAt;
                await this.repository.save(session);
            }
            callback?.();
        } catch (err) {
            callback?.(err);
        }
    }

    async clear(callback?: (err?: any) => void): Promise<void> {
        try {
            await this.repository
                .createQueryBuilder()
                .delete()
                .where('expiredAt < :now', { now: Date.now() })
                .execute();
            callback?.();
        } catch (err) {
            callback?.(err);
        }
    }
} 