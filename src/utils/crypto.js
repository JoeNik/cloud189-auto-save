const crypto = require('crypto');

class CryptoUtil {
    constructor(secretKey = process.env.CRYPTO_SECRET_KEY || 'your-secret-key') {
        this.secretKey = secretKey;
        this.algorithm = 'aes-256-cbc';
        // 使用固定的 IV 以简化实现
        this.iv = Buffer.from('0123456789abcdef0123456789abcdef'.slice(0, 16));
    }

    // 生成密码哈希
    hashPassword(password) {
        return crypto.createHash('sha256')
            .update(password + this.secretKey)
            .digest('hex');
    }

    // 基于挑战-响应的密码哈希
    hashChallengePassword(password, salt, timestamp) {
        return crypto.createHash('sha256')
            .update(password + salt + timestamp)
            .digest('hex');
    }

    // 验证密码
    verifyPassword(password, envPassword) {
        const envPasswordHash = this.hashPassword(envPassword);
        console.log('登录密码:', password, '本地密码:', envPasswordHash);
        return password === envPasswordHash;
    }

    // 简单的AES加密
    encrypt(text) {
        try {
            // 确保密钥长度为32字节(256位)
            const key = crypto.createHash('sha256').update(this.secretKey).digest();
            const cipher = crypto.createCipheriv(this.algorithm, key, this.iv);
            let encrypted = cipher.update(text, 'utf8', 'base64');
            encrypted += cipher.final('base64');
            return encrypted;
        } catch (error) {
            console.error('加密失败:', error);
            throw error;
        }
    }

    // 简单的AES解密
    decrypt(text) {
        try {
            // 确保密钥长度为32字节(256位)
            const key = crypto.createHash('sha256').update(this.secretKey).digest();
            const decipher = crypto.createDecipheriv(this.algorithm, key, this.iv);
            let decrypted = decipher.update(text, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            console.error('解密失败:', error);
            throw error;
        }
    }

    // 使用临时密钥的AES解密
    aesDecrypt(ciphertext, tempKey) {
        try {
            console.log('解密开始，参数:', {
                ciphertext: ciphertext,
                tempKey: tempKey
            });
            
            // 确保IV长度为16字节(128位)
            // 在16进制表示中，每两个字符代表1字节，所以需要32个16进制字符
            const ivHex = '0123456789abcdef0123456789abcdef';
            const iv = Buffer.from(ivHex.slice(0, 32), 'hex');
            console.log('IV(hex):', iv.toString('hex'));
            console.log('IV长度(字节):', iv.length);
            
            // 使用与前端相同的密钥派生方式
            const key = crypto.createHash('sha256').update(tempKey).digest();
            console.log('派生的密钥:', key.toString('hex'));
            
            // 从base64解码密文
            const encryptedBytes = Buffer.from(ciphertext, 'base64');
            console.log('解码后的密文长度:', encryptedBytes.length);
            console.log('解码后的密文(hex):', encryptedBytes.toString('hex'));
            
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            let decrypted = decipher.update(encryptedBytes);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            
            const result = decrypted.toString('utf8');
            console.log('解密成功，结果:', result);
            return result;
        } catch (error) {
            console.error('解密失败，详细错误:', error);
            throw error;
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