const messageManager = require('./message/MessageManager');
const { ConfigService } = require('./config');
const { AppDataSource } = require('../database');
const { SystemConfig, NotificationConfig } = require('../entities');

class MessageUtil {
    constructor() {
        this.configService = null;
        this.isInitialized = false;
        this.config = {};
    }

    // 初始化消息推送服务
    async initialize() {
        if (this.isInitialized) return;

        try {
            // 从数据库加载通知配置
            const notificationConfigs = await AppDataSource.getRepository(NotificationConfig).find();
            
            // 转换为配置对象
            this.config = notificationConfigs.reduce((acc, config) => {
                acc[config.key] = config.value;
                return acc;
            }, {});

            // 设置默认配置(如果数据库中没有)
            const defaultConfig = {
                DINGTALK_ENABLED: '0',
                DINGTALK_WEBHOOK: '',
                DINGTALK_SECRET: '',
                WECOM_ENABLED: '0',
                WECOM_WEBHOOK: '',
                TELEGRAM_ENABLED: '0',
                TELEGRAM_BOT_TOKEN: '',
                TELEGRAM_CHAT_ID: '',
                CF_PROXY_DOMAIN: '',
                PROXY_TYPE: '',
                PROXY_HOST: '',
                PROXY_PORT: '',
                PROXY_USERNAME: '',
                PROXY_PASSWORD: '',
                WXPUSHER_ENABLED: '0',
                WXPUSHER_SPT: ''
            };

            // 检查并添加缺失的默认配置
            for (const [key, value] of Object.entries(defaultConfig)) {
                if (!(key in this.config)) {
                    await AppDataSource.getRepository(NotificationConfig).save({
                        key,
                        value,
                        description: `默认${key}配置`
                    });
                    this.config[key] = value;
                }
            }

            // 初始化消息管理器
            messageManager.initialize({
                dingtalk: {
                    enabled: this.config.DINGTALK_ENABLED,
                    webhook: this.config.DINGTALK_WEBHOOK,
                    secret: this.config.DINGTALK_SECRET
                },
                wework: {
                    enabled: this.config.WECOM_ENABLED,
                    webhook: this.config.WECOM_WEBHOOK
                },
                telegram: {
                    enabled: this.config.TELEGRAM_ENABLED,
                    botToken: this.config.TELEGRAM_BOT_TOKEN,
                    chatId: this.config.TELEGRAM_CHAT_ID,
                    proxy: {
                        type: this.config.PROXY_TYPE,
                        host: this.config.PROXY_HOST,
                        port: this.config.PROXY_PORT,
                        username: this.config.PROXY_USERNAME,
                        password: this.config.PROXY_PASSWORD
                    },
                    cfProxyDomain: this.config.CF_PROXY_DOMAIN
                },
                wxpusher: {
                    enabled: this.config.WXPUSHER_ENABLED,
                    spt: this.config.WXPUSHER_SPT
                }
            });

            this.isInitialized = true;
            console.log('消息服务初始化成功');
        } catch (error) {
            console.error('消息服务初始化失败:', error);
            // 设置默认配置
            this.config = {
                DINGTALK_ENABLED: '0',
                DINGTALK_WEBHOOK: '',
                DINGTALK_SECRET: '',
                WECOM_ENABLED: '0',
                WECOM_WEBHOOK: '',
                TELEGRAM_ENABLED: '0',
                TELEGRAM_BOT_TOKEN: '',
                TELEGRAM_CHAT_ID: '',
                CF_PROXY_DOMAIN: '',
                PROXY_TYPE: '',
                PROXY_HOST: '',
                PROXY_PORT: '',
                PROXY_USERNAME: '',
                PROXY_PASSWORD: '',
                WXPUSHER_ENABLED: '0',
                WXPUSHER_SPT: ''
            };
        }
    }

    // 发送消息
    async sendMessage(message) {
        // 确保服务已初始化
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        // 发送消息
        return await messageManager.sendMessage(message);
    }

    // 测试发送消息
    async testSendMessage() {
        const testMessage = `测试消息 - ${new Date().toLocaleString()}\n\n这是一条测试消息，用于验证通知服务是否正常工作。`;
        return await this.sendMessage(testMessage);
    }
}

module.exports = { MessageUtil };