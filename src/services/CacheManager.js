// 缓存管理类
class CacheManager {
    constructor(ttl = 600) {
        this.cache = new Map();
        this.ttl = ttl; // 缓存过期时间，单位秒
        this.prefixMap = new Map(); // 存储前缀和键的映射关系
        // 定期清理过期缓存
        setInterval(() => this.cleanup(), this.ttl * 1000); // 每2分钟清理一次
    }

    // 设置缓存过期时间
    setTTL(ttl) {
        if (ttl > 0) {
            this.ttl = ttl;
            console.log(`缓存过期时间已更新为 ${ttl} 秒`);
        } else {
            console.error('无效的缓存过期时间:', ttl);
        }
    }

    // 设置缓存
    set(key, value) {
        const expireAt = Date.now() + this.ttl * 1000;
        this.cache.set(key, { value, expireAt });
        
        // 添加前缀映射
        const prefix = key.split('_')[0];
        if (prefix) {
            if (!this.prefixMap.has(prefix)) {
                this.prefixMap.set(prefix, new Set());
            }
            this.prefixMap.get(prefix).add(key);
        }
    }

    // 获取缓存
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }
        
        // 检查是否过期
        if (entry.expireAt < Date.now()) {
            this.cache.delete(key);
            return null;
        }
        
        return entry.value;
    }

    // 检查缓存是否存在
    has(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return false;
        }
        
        // 检查是否过期
        if (entry.expireAt < Date.now()) {
            this.cache.delete(key);
            return false;
        }
        
        return true;
    }

    // 删除缓存
    delete(key) {
        return this.cache.delete(key);
    }

    // 清空缓存
    clear() {
        this.cache.clear();
        this.prefixMap.clear();
    }

    // 清空指定前缀的缓存
    clearPrefix(prefix) {
        if (this.prefixMap.has(prefix)) {
            const keys = this.prefixMap.get(prefix);
            for (const key of keys) {
                this.cache.delete(key);
            }
            this.prefixMap.delete(prefix);
        }
    }

    cleanup() {
        const now = Date.now();
        for (const [key, data] of this.cache.entries()) {
            if (now - data.timestamp > this.ttl) {
                this.cache.delete(key);
            }
        }
    }
}

module.exports = { CacheManager };