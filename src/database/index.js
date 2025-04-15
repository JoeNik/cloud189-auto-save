const { DataSource } = require('typeorm');
const entities = require('../entities');
const { Account, Task, TaskLog, Session, SystemConfig } = entities;
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const AppDataSource = new DataSource({
    type: process.env.DB_TYPE || 'sqlite',
    database: process.env.DB_PATH || path.join(process.cwd(), 'data/database.sqlite'),
    synchronize: true,
    entities: [Account, Task, TaskLog, Session, SystemConfig],
    logging: process.env.NODE_ENV === 'development'
});

// 初始化数据库
async function initDatabase() {
    try {
        await AppDataSource.initialize();
        console.log('数据库连接成功(initDatabase)');
        return true;
    } catch (error) {
        console.error('数据库连接失败(initDatabase):', error);
        return false;
    }
}

// 获取仓库
const getAccountRepository = () => AppDataSource.getRepository(Account);
const getTaskRepository = () => AppDataSource.getRepository(Task);
const getTaskLogRepository = () => AppDataSource.getRepository(TaskLog);
const getSessionRepository = () => AppDataSource.getRepository(Session);
const getSystemConfigRepository = () => AppDataSource.getRepository(SystemConfig);

module.exports = {
    AppDataSource,
    initDatabase,
    getAccountRepository,
    getTaskRepository,
    getTaskLogRepository,
    getSessionRepository,
    getSystemConfigRepository
};