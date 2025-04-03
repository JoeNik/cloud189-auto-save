const crypto = require('crypto');

class CryptoUtil {
    constructor(secretKey = process.env.CRYPTO_SECRET_KEY || 'your-secret-key') {
        this.secretKey = secretKey;
        this.algorithm = 'aes-256-cbc';
    }

    // 生成密码哈希
    hashPassword(password) {
        return crypto.createHash('sha256')
            .update(password + this.secretKey)
            .digest('hex');
    }

    // 验证密码
    verifyPassword(password, envPassword) {
        const envPasswordHash = this.hashPassword(envPassword);
        console.log('登录密码:', password, '本地密码:', envPasswordHash);
        return password === envPasswordHash;
    }

    // 加密数据
    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, Buffer.from(this.secretKey), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    }

    // 解密数据
    decrypt(text) {
        try {
            console.log('解密数据:', text);
            const textParts = text.split(':');
            const iv = Buffer.from(textParts.shift(), 'hex');
            const encryptedText = Buffer.from(textParts.join(':'), 'hex');
            const decipher = crypto.createDecipheriv(this.algorithm, Buffer.from(this.secretKey), iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString();
        } catch (error) {
            console.error('解密失败:', error);
            return text; // 如果解密失败,返回原文
        }
    }

    // 对敏感信息进行脱敏处理
    maskSensitiveInfo(text, start = 3, end = 3) {
        if (!text) return '';
        const length = text.length;
        if (length <= start + end) {
            return '*'.repeat(length);
        }
        return text.substr(0, start) + '*'.repeat(length - start - end) + text.substr(length - end);
    }
}

module.exports = new CryptoUtil(); 