const got = require('got');
const MessageService = require('./MessageService');

class DingtalkService extends MessageService {
    /**
     * 检查服务是否启用
     * @returns {boolean}
     */
    checkEnabled() {
        return this.config.enabled === '1' && !!this.config.webhook;
    }

    /**
     * 实际发送消息
     * @param {string} message - 要发送的消息内容
     * @returns {Promise<boolean>} - 发送结果
     */
    async _send(message) {
        try {
            const url = this.config.webhook;
            const data = {
                msgtype: 'text',
                text: {
                    content: message
                }
            };

            // 如果有签名密钥，添加签名
            if (this.config.secret) {
                const timestamp = Date.now();
                const stringToSign = `${timestamp}\n${this.config.secret}`;
                const hmac = require('crypto').createHmac('sha256', this.config.secret);
                const sign = hmac.update(stringToSign).digest('base64');
                const signUrl = `${url}${url.includes('?') ? '&' : '?'}timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
                await got.post(signUrl, { json: data });
            } else {
                await got.post(url, { json: data });
            }

            return true;
        } catch (error) {
            console.error('钉钉消息推送异常:', error);
            return false;
        }
    }
}

module.exports = DingtalkService; 