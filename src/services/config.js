const crypto = require('crypto');

class ConfigService {
    constructor(configRepository) {
        this.configRepository = configRepository;
        this.defaultConfigs = [
            { key: 'AUTH_USERNAME', value: 'admin', description: '系统管理员用户名' },
            { key: 'AUTH_PASSWORD', value: 'admin123', description: '系统管理员密码' },
            { key: 'SESSION_SECRET', value: crypto.randomBytes(32).toString('hex'), description: '会话加密密钥' },
            { key: 'TASK_CHECK_INTERVAL', value: '0 */30 * * * *', description: '全局定时任务执行间隔（Cron表达式）' },
            { key: 'TASK_EXPIRE_DAYS', value: '3', description: '任务过期天数' },
            { key: 'FOLDER_CACHE_TTL', value: '600', description: '文件目录缓存时间（秒）' },
            { key: 'CLEAR_RECYCLE_INTERVAL', value: '0 2 * * * *', description: '清空回收站定时任务执行间隔（Cron表达式）' },
            { key: 'ENABLE_AUTO_CLEAR_RECYCLE', value: '0', description: '清理个人空间(0:不清理 1:清理)' },
            { key: 'ENABLE_AUTO_CLEAR_FAMILY_RECYCLE', value: '0', description: '清理家庭空间(0:不清理 1:清理)' },
            { key: 'DELETE_EXTRAFILES_INTERVAL', value: '0 23 * * * *', description: '删除指定文件夹下文件任务执行间隔（Cron表达式）' },
        ];
    }

    // 初始化默认配置
    async initDefaultConfig() {
        for (const config of this.defaultConfigs) {
            const existingConfig = await this.configRepository.findOneBy({ key: config.key });
            if (!existingConfig) {
                // 如果配置不存在，则创建默认配置
                console.log(`创建默认配置: ${config.key} = ${config.key === 'AUTH_PASSWORD' ? '******' : config.value}`);
                await this.configRepository.save({
                    key: config.key,
                    value: config.value,
                    description: config.description
                });
            }
        }
    }

    // 获取所有配置
    async getAllConfigs() {
        return await this.configRepository.find();
    }

    // 获取单个配置值
    async getConfigValue(key, defaultValue = null) {
        const config = await this.configRepository.findOneBy({ key });
        return config ? config.value : defaultValue;
    }

    // 设置配置值
    async setConfig(key, value, description = null) {
        let config = await this.configRepository.findOneBy({ key });
        
        if (config) {
            // 更新现有配置
            config.value = value;
            if (description) {
                config.description = description;
            }
            await this.configRepository.save(config);
        } else {
            // 创建新配置
            config = this.configRepository.create({
                key,
                value,
                description
            });
            await this.configRepository.save(config);
        }
        
        return config;
    }

    // 删除配置
    async deleteConfig(key) {
        const config = await this.configRepository.findOneBy({ key });
        if (config) {
            await this.configRepository.remove(config);
            return true;
        }
        return false;
    }
}

module.exports = { ConfigService }; 