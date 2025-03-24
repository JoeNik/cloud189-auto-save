const axios = require('axios');

class DingtalkService {
    constructor(webhook, secret = null) {
        this.webhook = webhook;
        this.secret = secret;
    }

    // 生成签名
    _generateSign() {
        if (!this.secret) return '';

        const timestamp = Date.now();
        const stringToSign = `${timestamp}\n${this.secret}`;
        const hmac = require('crypto').createHmac('sha256', this.secret);
        const sign = hmac.update(stringToSign).digest('base64');

        return `&timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
    }

    // 发送消息
    async sendMessage(content) {
        try {
            const sign = this._generateSign();
            const url = `${this.webhook}${sign}`;

            const response = await axios.post(url, {
                msgtype: 'text',
                text: {
                    content: content
                }
            });

            if (response.data.errcode !== 0) {
                throw new Error(response.data.errmsg);
            }

            return true;
        } catch (error) {
            console.error('钉钉推送失败:', error.message);
            return false;
        }
    }
}

module.exports = { DingtalkService }; 