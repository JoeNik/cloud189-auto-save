require('reflect-metadata');
require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const session = require('express-session');
const fs = require('fs').promises;
const path = require('path');
const { AppDataSource } = require('./database');
const { Account, Task, TaskLog, Session, SystemConfig } = require('./entities');
const { TaskService } = require('./services/task');
const { Cloud189Service } = require('./services/cloud189');
const { MessageUtil } = require('./services/message');
const { CacheManager } = require('./services/CacheManager');
const { CustomSessionStore } = require('./services/SessionStore');
const { ConfigService } = require('./services/config');
const cryptoUtil = require('./utils/crypto');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static('src/public'));

// 给需要保护的API添加验证中间件的函数，在数据库初始化后使用
const addAuthMiddleware = () => {
    app.use('/api/accounts', authMiddleware);
    app.use('/api/tasks', authMiddleware);
    app.use('/api/folders', authMiddleware);
    app.use('/api/share', authMiddleware);
    app.use('/api/config', authMiddleware);
};

// 登录验证中间件
const authMiddleware = (req, res, next) => {
    // 检查是否已登录
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ success: false, error: '未登录或会话已过期' });
    }
};

// 初始化数据库连接
AppDataSource.initialize().then(async () => {
    console.log('数据库连接成功');
    const accountRepo = AppDataSource.getRepository(Account);
    const taskRepo = AppDataSource.getRepository(Task);
    const taskLogRepo = AppDataSource.getRepository(TaskLog);
    const configRepo = AppDataSource.getRepository(SystemConfig);
    
    // 初始化配置服务
    const configService = new ConfigService(configRepo);
    await configService.initDefaultConfig();
    
    // 初始化任务服务，传入配置服务
    const taskService = new TaskService(taskRepo, accountRepo, taskLogRepo, configService);
    const messageUtil = new MessageUtil();
    
    // 初始化缓存管理器
    const folderCacheTTL = await configService.getConfigValue('FOLDER_CACHE_TTL', '600');
    const folderCache = new CacheManager(parseInt(folderCacheTTL));

    // 初始化session存储
    const sessionRepository = AppDataSource.getRepository(Session);
    const sessionStore = new CustomSessionStore(sessionRepository);
    
    // 配置session中间件
    app.use(session({
        name: 'cloud189.sid',
        secret: await configService.getConfigValue('SESSION_SECRET'),
        resave: false,
        saveUninitialized: false,
        rolling: true,
        store: sessionStore,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30天
            sameSite: 'lax'
        }
    }));

    // 添加会话调试中间件
    app.use((req, res, next) => {
        const oldSave = req.session.save;
        req.session.save = function(cb) {
            console.log('保存会话:', {
                id: req.sessionID,
                data: req.session
            });
            return oldSave.call(req.session, function(err) {
                if (err) {
                    console.error('会话保存错误:', err);
                }
                if (cb) cb(err);
            });
        };
        next();
    });
    
    // 检查登录状态API - 必须在session中间件之后
    app.get('/api/auth/check', (req, res) => {
        if (req.session.user) {
            res.json({ 
                success: true, 
                data: { 
                    username: req.session.user.username,
                    loginTime: req.session.user.loginTime
                } 
            });
        } else {
            res.status(401).json({ success: false, error: '未登录或会话已过期' });
        }
    });
    
    // 登录验证挑战（生成随机盐值）
    app.post('/api/auth/challenge', (req, res) => {
        const { username } = req.body;

        // 生成随机盐值
        const salt = crypto.randomBytes(16).toString('hex');
        const timestamp = Date.now();

        // 存储挑战信息到session，供之后的登录验证使用
        req.session.loginChallenge = {
            salt,
            timestamp,
            username,
            expires: timestamp + 5 * 60 * 1000 // 5分钟有效期
        };
        
        // 确保会话保存
        req.session.save(err => {
            if (err) {
                console.error('保存会话失败:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: '会话保存失败' 
                });
            }
            
            res.json({
                success: true,
                salt,
                timestamp
            });
        });
    });
    
    // 登录接口
    app.post('/api/login', async (req, res) => {
        const { username, password, salt, timestamp, remember } = req.body;
        
        // 检查会话是否存在
        if (!req.session) {
            return res.status(500).json({
                success: false,
                error: '会话初始化失败'
            });
        }
        
        // 检查挑战是否有效
        const challenge = req.session.loginChallenge;
        console.log('登录挑战信息:', challenge);
        
        if (!challenge || 
            challenge.salt !== salt || 
            challenge.timestamp !== timestamp ||
            challenge.username !== username || 
            challenge.expires < Date.now()) {
            
            return res.status(401).json({ 
                success: false, 
                error: '登录挑战无效或已过期，请重新登录'
            });
        }

        // 获取配置中的用户名和密码
        const configUsername = await configService.getConfigValue('AUTH_USERNAME');
        const configPassword = await configService.getConfigValue('AUTH_PASSWORD');

        // 在服务器端计算预期的密码哈希
        const expectedHash = cryptoUtil.hashChallengePassword(
            configPassword, 
            salt, 
            timestamp
        );
        
        // 验证用户名和密码
        if (username === configUsername && password === expectedHash) {
            // 设置session
            req.session.user = {
                username,
                loginTime: new Date()
            };

            // 如果选择了记住登录,延长cookie过期时间
            if (remember) {
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
            } else {
                // 未选择记住登录时，使用默认的过期时间
                req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 * 24小时
            }

            // 清除挑战信息
            delete req.session.loginChallenge;

            // 确保会话保存
            req.session.save(err => {
                if (err) {
                    console.error('保存会话失败2:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: '会话保存失败' 
                    });
                }
                
                res.json({ success: true });
            });
        } else {
            res.status(401).json({ success: false, error: '用户名或密码错误' });
        }
    });
    
    // 登出接口
    app.post('/api/logout', (req, res) => {
        req.session.destroy(err => {
            if (err) {
                console.error('销毁会话失败:', err);
                return res.status(500).json({ success: false, error: '登出失败' });
            }
            res.json({ success: true });
        });
    });
    
    // 提供临时加密密钥的端点
    app.get('/api/auth/encryption-key', (req, res) => {
        // 生成临时密钥和ID
        const keyId = crypto.randomBytes(8).toString('hex');
        const publicKey = crypto.randomBytes(16).toString('hex');
        const timestamp = Date.now();
        
        // 存储密钥信息到会话中，服务器端会用这个解密
        req.session.encryptionKeys = req.session.encryptionKeys || {};
        req.session.encryptionKeys[keyId] = {
            publicKey,
            timestamp,
            expires: timestamp + 10 * 60 * 1000 // 10分钟过期
        };
        
        // 清理过期的密钥
        for (const id in req.session.encryptionKeys) {
            if (req.session.encryptionKeys[id].expires < Date.now()) {
                delete req.session.encryptionKeys[id];
            }
        }
        
        res.json({
            success: true,
            publicKey,
            timestamp,
            keyId
        });
    });

    // 添加会话验证中间件
    addAuthMiddleware();

    // 账号相关API
    app.get('/api/accounts', async (req, res) => {
        try {
            console.log('正在获取账号列表...');
            const accounts = await accountRepo.find();
            console.log(`找到 ${accounts.length} 个账号`);
            // 获取容量并处理敏感信息
            for (const account of accounts) {
                const cloud189 = Cloud189Service.getInstance(account);
                const capacity = await cloud189.client.getUserSizeInfo();
                account.capacity = {
                    cloudCapacityInfo: null,
                    familyCapacityInfo: null
                };
                if (capacity && capacity.res_code == 0) {
                    account.capacity.cloudCapacityInfo = capacity.cloudCapacityInfo;
                    account.capacity.familyCapacityInfo = capacity.familyCapacityInfo;
                }
                // 脱敏处理
                account.username = cryptoUtil.maskSensitiveInfo(account.username);
                account.password = cryptoUtil.maskSensitiveInfo(account.password);
            }
            res.json({ success: true, data: accounts });
        } catch (error) {
            console.error('获取账号列表失败:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.post('/api/accounts', async (req, res) => {
        try {
            const { username, password, encryptionData } = req.body;
            
            if (!encryptionData || !encryptionData.keyId || !encryptionData.timestamp) {
                return res.status(400).json({ 
                    success: false, 
                    error: '请求缺少必要的加密信息' 
                });
            }
            
            // 验证加密密钥是否有效
            const { keyId, timestamp } = encryptionData;
            const keyInfo = req.session.encryptionKeys && req.session.encryptionKeys[keyId];
            
            if (!keyInfo || keyInfo.expires < Date.now()) {
                return res.status(400).json({ 
                    success: false, 
                    error: '加密密钥无效或已过期' 
                });
            }
            
            // 使用临时公钥解密
            let decryptedPassword;
            try {
                decryptedPassword = cryptoUtil.aesDecrypt(password, keyInfo.publicKey);
            } catch (e) {
                return res.status(400).json({ 
                    success: false, 
                    error: '密码解密失败' 
                });
            }
            
            // 创建账号数据,直接使用解密后的密码
            const accountData = { 
                username,
                password: decryptedPassword // 直接使用解密后的密码
            };
            
            // 保存账号
            const account = accountRepo.create(accountData);
            await accountRepo.save(account);
            
            // 清除已使用的加密密钥
            delete req.session.encryptionKeys[keyId];
            
            res.json({ success: true, data: account });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.delete('/api/accounts/:id', async (req, res) => {
        try {
            const account = await accountRepo.findOneBy({ id: parseInt(req.params.id) });
            if (!account) throw new Error('账号不存在');
            await accountRepo.remove(account);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 任务相关API
    app.get('/api/tasks', async (req, res) => {
        try {
            console.log('正在获取任务列表...');
            const tasks = await taskRepo.find({
                order: { id: 'DESC' }
            });
            console.log(`找到 ${tasks.length} 个任务`);
            res.json({ success: true, data: tasks });
        } catch (error) {
            console.error('获取任务列表失败:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.post('/api/tasks', async (req, res) => {
        try {
            const { accountId, shareLink, targetFolderId, totalEpisodes, accessCode, selectedFolders, resourceName } = req.body;
            
            // 如果提供了选中的文件夹列表，为每个文件夹创建任务
            if (selectedFolders && selectedFolders.length > 0) {
                const tasks = [];
                const task = await taskService.createTask(accountId, shareLink, targetFolderId, totalEpisodes, accessCode, selectedFolders.map(folder => folder.id));
                tasks.push(task)
                // for (const folder of selectedFolders) {
                //     // const task = await taskService.createTask(accountId, shareLink, targetFolderId, totalEpisodes, accessCode, {
                //     //     shareFolderId: folder.id,
                //     //     shareFolderName: folder.name,
                //     //     resourceName: resourceName
                //     // });

                //     const task = await taskService.createTask(accountId, shareLink, targetFolderId, totalEpisodes, accessCode, [folder.id]);
                //     tasks.push(task);
                // }
                res.json({ success: true, data: tasks });
                return;
            }

            // 否则获取文件夹列表
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) throw new Error('账号不存在');
            
            const cloud189 = Cloud189Service.getInstance(account);
            const shareCode = await taskService.parseShareCode(shareLink);
            const shareInfo = await taskService.getShareInfo(cloud189, shareCode);
            
            if (shareInfo.isFolder) {
                const result = await cloud189.listShareDir(shareInfo.shareId, shareInfo.fileId, shareInfo.shareMode, accessCode);
                if (!result?.fileListAO?.folderList) {
                    throw new Error('获取文件夹列表失败');
                }
                
                if (result.fileListAO.folderList.length > 0) {
                    // 返回文件夹列表供前端选择
                    res.json({ 
                        success: true, 
                        needFolderSelection: true,
                        shareInfo,
                        folders: result.fileListAO.folderList 
                    });
                    return;
                }
            }
            
            // 如果没有子文件夹，创建单个任务
            const task = await taskService.createTask(accountId, shareLink, targetFolderId, totalEpisodes, accessCode);
            res.json({ success: true, data: task });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 存储定时任务的映射关系，方便后续更新或删除
    const taskSchedulers = new Map();
    // 存储全局定时任务
    let globalTaskScheduler = null;
    
    // 系统设置相关API
    app.get('/api/system/config', async (req, res) => {
        try {
            // 从配置服务获取所有系统设置
            const configs = await configService.getAllConfigs();
            // 敏感信息处理
            const safeConfigs = configs.map(config => {
                // 如果是AUTH_PASSWORD，不返回具体值
                if (config.key === 'AUTH_PASSWORD') {
                    return {
                        ...config,
                        value: '********' // 替换为星号
                    };
                }
                return config;
            });
            
            res.json({ success: true, data: safeConfigs });
        } catch (error) {
            console.error('获取系统设置失败:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 设置全局定时任务
    const setupGlobalTaskScheduler = async () => {
        // 如果已存在全局定时任务，先停止
        if (globalTaskScheduler) {
            globalTaskScheduler.stop();
            console.log('已停止旧的全局定时任务');
        }
        
        // 从数据库获取定时任务表达式
        const taskCheckInterval = await configService.getConfigValue('TASK_CHECK_INTERVAL', '0 */30 * * * *');
        console.log(`设置全局定时任务，表达式: ${taskCheckInterval}`);
        
        // 创建新的全局定时任务
        globalTaskScheduler = cron.schedule(taskCheckInterval, async () => {
            console.log('执行全局定时任务检查...');
            const tasks = await taskService.getPendingTasks();
            let saveResults = [];
            
            // 只处理没有自定义cron表达式的任务
            const defaultTasks = tasks.filter(task => !task.cronExpression);
            console.log(`找到${defaultTasks.length}个使用全局定时任务的待处理任务`);
            
            for (const task of defaultTasks) {
                try {
                    const result = await taskService.processTask(task);
                    if (result) {
                        saveResults.push(result);
                    }
                } catch (error) {
                    console.error(`任务${task.id}执行失败:`, error);
                }
            }
            
            if (saveResults.length > 0) {
                messageUtil.sendMessage(saveResults.join("\n\n"));
            }
        }, {
            scheduled: true,
            timezone: "Asia/Shanghai" // 设置为北京时间(UTC+8)
        });
        
        return globalTaskScheduler;
    };

    // 为任务创建或更新定时任务
    const createOrUpdateTaskScheduler = (task) => {
        // 如果已存在此任务的定时器，先移除旧的
        if (taskSchedulers.has(task.id)) {
            const oldScheduler = taskSchedulers.get(task.id);
            oldScheduler.stop();
            taskSchedulers.delete(task.id);
            console.log(`已停止任务[${task.id}]的旧定时任务`);
        }
        
        // 如果任务有自定义cron表达式，创建新的定时任务
        if (task.cronExpression) {
            try {
                const scheduler = cron.schedule(task.cronExpression, async () => {
                    console.log(`执行自定义定时任务[${task.id}]: ${task.resourceName}，cron表达式: ${task.cronExpression}`);
                    try {
                        const result = await taskService.processTask(task);
                        if (result) {
                            messageUtil.sendMessage(result);
                        }
                    } catch (error) {
                        console.error(`自定义任务${task.id}执行失败:`, error);
                    }
                }, {
                    scheduled: true,
                    timezone: "Asia/Shanghai" // 设置为北京时间(UTC+8)
                });
                
                taskSchedulers.set(task.id, scheduler);
                console.log(`已为任务[${task.id}]创建自定义定时任务，cron表达式: ${task.cronExpression}`);
            } catch (error) {
                console.error(`为任务${task.id}创建自定义定时任务失败:`, error);
            }
        }
    };
    
    // 初始化自定义定时任务
    const initCustomTaskSchedulers = async () => {
        console.log('初始化自定义定时任务...');
        const tasks = await taskService.getPendingTasks();
        const customTasks = tasks.filter(task => task.cronExpression);
        console.log(`找到${customTasks.length}个使用自定义定时任务的待处理任务`);
        
        customTasks.forEach(task => {
            createOrUpdateTaskScheduler(task);
        });
    };
    
    // 修改任务更新API，处理cron表达式变更
    app.put('/api/tasks/:id', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            // console.log('收到更新请求:', {
            //     taskId,
            //     body: req.body
            // });

            const { 
                resourceName, targetFolderId, currentEpisodes, totalEpisodes, 
                status, shareFolderName, shareFolderId, targetFolderName, 
                episodeThreshold, episodeRegex, whitelistKeywords, blacklistKeywords,
                cronExpression 
            } = req.body;
            
            // 如果shareFolderId为"root",则获取原任务的shareFileId
            let updates = { 
                resourceName, targetFolderId, currentEpisodes, totalEpisodes, 
                status, shareFolderName, targetFolderName, 
                episodeThreshold, episodeRegex, whitelistKeywords, blacklistKeywords,
                cronExpression 
            };

            if(shareFolderId === "root") {
                // 获取原任务数据
                const task = await taskRepo.findOneBy({ id: taskId });
                if(!task) {
                    throw new Error('任务不存在');
                }
                // 使用原任务的shareFileId
                updates.shareFolderId = task.shareFileId;
            } else {
                updates.shareFolderId = shareFolderId;
            }

            // console.log('准备更新的字段:', updates);
            
            const updatedTask = await taskService.updateTask(taskId, updates);
            // console.log('更新后的任务:', updatedTask);
            
            // 处理定时任务更新
            createOrUpdateTaskScheduler(updatedTask);
            
            res.json({ success: true, data: updatedTask });
        } catch (error) {
            console.error('更新任务失败:', error);
            res.json({ success: false, error: error.message });
        }
    });
    
    // 任务删除时也需要停止定时任务
    app.delete('/api/tasks/:id', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            
            // 如果有定时任务，先停止
            if (taskSchedulers.has(taskId)) {
                const scheduler = taskSchedulers.get(taskId);
                scheduler.stop();
                taskSchedulers.delete(taskId);
                console.log(`已停止并删除任务[${taskId}]的定时任务`);
            }
            
            await taskService.deleteTask(taskId);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/tasks/:id/execute', async (req, res) => {
        try {
            const task = await taskRepo.findOneBy({ id: parseInt(req.params.id) });
            if (!task) throw new Error('任务不存在');
            const result = await taskService.processTask(task);
            if (result) {
                messageUtil.sendMessage(result);
            }
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 获取目录树
    app.get('/api/folders/:accountId', async (req, res) => {
        try {
            const accountId = parseInt(req.params.accountId);
            const folderId = req.query.folderId || '-11';
            const forceRefresh = req.query.refresh === 'true';
            const cacheKey = `folders_${accountId}_${folderId}`;
            // forceRefresh 为true 则清空所有folders_开头的缓存
            if (forceRefresh) {
                folderCache.clearPrefix("folders_");
            }
            if (folderCache.has(cacheKey)) {
                return res.json({ success: true, data: folderCache.get(cacheKey) });
            }
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('账号不存在');
            }

            const cloud189 = Cloud189Service.getInstance(account);
            const folders = await cloud189.getFolderNodes(folderId);
            folderCache.set(cacheKey, folders);
            res.json({ success: true, data: folders });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 处理分享链接获取文件夹列表
    app.post('/api/folders/:accountId', async (req, res) => {
        try {
            const accountId = parseInt(req.params.accountId);
            const { shareLink, accessCode } = req.body;
            
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('账号不存在');
            }

            const cloud189 = Cloud189Service.getInstance(account);
            const shareCode = await taskService.parseShareCode(shareLink);
            const shareInfo = await taskService.getShareInfo(cloud189, shareCode);
            
            if (shareInfo.isFolder) {
                const result = await cloud189.listShareDir(shareInfo.shareId, shareInfo.fileId, shareInfo.shareMode, accessCode);
                if (!result?.fileListAO?.folderList) {
                    throw new Error('获取文件夹列表失败');
                }
                res.json({ success: true, data: result.fileListAO.folderList });
            } else {
                res.json({ success: true, data: [] });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 根据分享链接获取文件目录
    app.get('/api/share/folders/:accountId', async (req, res) => {
        try {
            const taskId = parseInt(req.query.taskId);
            const folderId = req.query.folderId;
            const forceRefresh = req.query.refresh === 'true';
            const cacheKey = `share_folders_${taskId}_${folderId}`;
            if (forceRefresh) {
                folderCache.clearPrefix("share_folders_");
            }
            if (folderCache.has(cacheKey)) {
                return res.json({ success: true, data: folderCache.get(cacheKey) });
            }
            const task = await taskRepo.findOneBy({ id: parseInt(taskId) });
            if (!task) {
                throw new Error('任务不存在');
            }
            if (folderId == -11) {
                // 返回顶级目录
                res.json({success: true, data: [{id: task.shareFileId, name: task.resourceName}]});
                return 
            }
            const account = await accountRepo.findOneBy({ id: req.params.accountId });
            if (!account) {
                throw new Error('账号不存在');
            }
            const cloud189 = Cloud189Service.getInstance(account);
            // 查询分享目录
            const shareDir = await cloud189.listShareDir(task.shareId, req.query.folderId, task.shareMode);
            if (!shareDir || !shareDir.fileListAO) {
                res.json({ success: true, data: [] });    
            }
            const folders = shareDir.fileListAO.folderList;
            folderCache.set(cacheKey, folders);
            res.json({ success: true, data: folders });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

     // 获取目录下的文件
     app.get('/api/folder/files', async (req, res) => {
        const { accountId, folderId } = req.query;
        const account = await accountRepo.findOneBy({ id: accountId });
        if (!account) {
            throw new Error('账号不存在');
        }
        const cloud189 = Cloud189Service.getInstance(account);
        const fileList = await taskService.getAllFolderFiles(cloud189, folderId);
        res.json({ success: true, data: fileList });
    });
    app.post('/api/files/rename', async (req, res) => {
        const {taskId, accountId, files, sourceRegex, targetRegex } = req.body;
        if (files.length == 0) {
            throw new Error('未获取到需要修改的文件');
        }
        const account = await accountRepo.findOneBy({ id: accountId });
        if (!account) {
            throw new Error('账号不存在');
        }
        const task = await taskRepo.findOneBy({ id: taskId });
        if (!task) {
            throw new Error('任务不存在');
        }
        const cloud189 = Cloud189Service.getInstance(account);
        const result = []
        for (const file of files) {
            const renameResult = await cloud189.renameFile(file.fileId, file.destFileName);
            if (renameResult.res_code != 0) {
                result.push(`文件${file.destFileName} ${renameResult.res_msg}`)
            }
        }
        if (sourceRegex && targetRegex) {
            task.sourceRegex = sourceRegex
            task.targetRegex = targetRegex
            taskRepo.save(task)
        }
        res.json({ success: true, data: result });
    });

    // 获取通知配置
    app.get('/api/config/notification', async (req, res) => {
        try {
            const config = {
                // 钉钉配置
                DINGTALK_ENABLED: process.env.DINGTALK_ENABLED || 'false',
                DINGTALK_WEBHOOK: process.env.DINGTALK_WEBHOOK || '',
                DINGTALK_SECRET: process.env.DINGTALK_SECRET || '',
                
                // 企业微信配置
                WECOM_ENABLED: process.env.WECOM_ENABLED || 'false',
                WECOM_WEBHOOK: process.env.WECOM_WEBHOOK || '',
                
                // Telegram配置
                TELEGRAM_ENABLED: process.env.TELEGRAM_ENABLED || 'false',
                TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
                TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
                CF_PROXY_DOMAIN: process.env.CF_PROXY_DOMAIN || '',
                PROXY_TYPE: process.env.PROXY_TYPE || '',
                PROXY_HOST: process.env.PROXY_HOST || '',
                PROXY_PORT: process.env.PROXY_PORT || '',
                PROXY_USERNAME: process.env.PROXY_USERNAME || '',
                PROXY_PASSWORD: process.env.PROXY_PASSWORD || '',
                
                // WxPusher配置
                WXPUSHER_ENABLED: process.env.WXPUSHER_ENABLED || 'false',
                WXPUSHER_SPT: process.env.WXPUSHER_SPT || ''
            };
            res.json({ success: true, data: config });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 更新通知配置
    app.post('/api/config/notification', async (req, res) => {
        try {
            const config = req.body;
            const envPath = path.resolve(process.cwd(), '.env');
            let envContent = await fs.readFile(envPath, 'utf8');
            let envLines = envContent.split('\n');

            // 更新环境变量内容
            const updateEnvVar = (name, value) => {
                const existingLineIndex = envLines.findIndex(line => 
                    line.trim().startsWith(`${name}=`)
                );
                
                if (existingLineIndex !== -1) {
                    // 更新已存在的变量
                    envLines[existingLineIndex] = `${name}=${value}`;
                } else {
                    // 在相同类型配置的最后一行后添加新变量
                    const lastIndex = envLines.reduce((last, line, index) => {
                        if (line.includes(name.split('_')[0])) {
                            return index;
                        }
                        return last;
                    }, -1);
                    
                    if (lastIndex !== -1) {
                        envLines.splice(lastIndex + 1, 0, `${name}=${value}`);
                    } else {
                        envLines.push(`${name}=${value}`);
                    }
                }
                process.env[name] = value;
            };

            // 更新钉钉配置
            if (config.DINGTALK_ENABLED !== undefined) updateEnvVar('DINGTALK_ENABLED', config.DINGTALK_ENABLED);
            if (config.DINGTALK_WEBHOOK !== undefined) updateEnvVar('DINGTALK_WEBHOOK', config.DINGTALK_WEBHOOK);
            if (config.DINGTALK_SECRET !== undefined) updateEnvVar('DINGTALK_SECRET', config.DINGTALK_SECRET);

            // 更新企业微信配置
            if (config.WECOM_ENABLED !== undefined) updateEnvVar('WECOM_ENABLED', config.WECOM_ENABLED);
            if (config.WECOM_WEBHOOK !== undefined) updateEnvVar('WECOM_WEBHOOK', config.WECOM_WEBHOOK);

            // 更新Telegram配置
            if (config.TELEGRAM_ENABLED !== undefined) updateEnvVar('TELEGRAM_ENABLED', config.TELEGRAM_ENABLED);
            if (config.TELEGRAM_BOT_TOKEN !== undefined) updateEnvVar('TELEGRAM_BOT_TOKEN', config.TELEGRAM_BOT_TOKEN);
            if (config.TELEGRAM_CHAT_ID !== undefined) updateEnvVar('TELEGRAM_CHAT_ID', config.TELEGRAM_CHAT_ID);
            if (config.CF_PROXY_DOMAIN !== undefined) updateEnvVar('CF_PROXY_DOMAIN', config.CF_PROXY_DOMAIN);
            if (config.PROXY_TYPE !== undefined) updateEnvVar('PROXY_TYPE', config.PROXY_TYPE);
            if (config.PROXY_HOST !== undefined) updateEnvVar('PROXY_HOST', config.PROXY_HOST);
            if (config.PROXY_PORT !== undefined) updateEnvVar('PROXY_PORT', config.PROXY_PORT);
            if (config.PROXY_USERNAME !== undefined) updateEnvVar('PROXY_USERNAME', config.PROXY_USERNAME);
            if (config.PROXY_PASSWORD !== undefined) updateEnvVar('PROXY_PASSWORD', config.PROXY_PASSWORD);

            // 更新WxPusher配置
            if (config.WXPUSHER_ENABLED !== undefined) updateEnvVar('WXPUSHER_ENABLED', config.WXPUSHER_ENABLED);
            if (config.WXPUSHER_SPT !== undefined) updateEnvVar('WXPUSHER_SPT', config.WXPUSHER_SPT);

            // 保存更新后的环境变量文件
            await fs.writeFile(envPath, envLines.join('\n'));

            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 获取更新记录
    app.get('/api/logs', async (req, res) => {
        try {
            const logs = await AppDataSource
                .getRepository(TaskLog)
                .createQueryBuilder('log')
                .orderBy('log.createdAt', 'DESC')
                .take(100)
                .getMany();

            res.json({ 
                success: true, 
                data: logs.map(log => ({
                    id: log.id,
                    taskId: log.taskId,
                    message: log.message,
                    createdAt: log.createdAt
                }))
            });
        } catch (error) {
            console.error('获取更新记录失败:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 修改系统设置API，处理配置变更
    app.post('/api/system/config', async (req, res) => {
        try {
            console.log('收到系统设置更新请求:', req.body)
            const { configs } = req.body;
            if (!Array.isArray(configs)) {
                return res.status(400).json({ success: false, error: '无效的配置数据格式' });
            }
            
            // 标记是否需要重新设置全局定时任务
            let needResetGlobalScheduler = false;
            let needReloadTaskExpireDays = false;
            
            // 保存配置到数据库
            for (const config of configs) {
                // 处理密码加密
                if (config.key === 'AUTH_PASSWORD' && config.value !== '********') {
                    // 如果包含加密信息，则需要解密
                    if (config.encryptionData) {
                        const { keyId, publicKey, timestamp } = config.encryptionData;
                        
                        // 验证加密密钥是否有效
                        const keyInfo = req.session.encryptionKeys && req.session.encryptionKeys[keyId];
                        
                        if (!keyInfo || keyInfo.expires < Date.now()) {
                            return res.status(400).json({ 
                                success: false, 
                                error: '加密密钥无效或已过期' 
                            });
                        }
                        
                        // 使用临时公钥解密
                        try {
                            const decryptedPassword = cryptoUtil.aesDecrypt(config.value, keyInfo.publicKey);
                            // 使用解密后的明文密码更新配置
                            await configService.setConfig(config.key, decryptedPassword, config.description);
                            
                            // 清除已使用的加密密钥
                            delete req.session.encryptionKeys[keyId];
                        } catch (e) {
                            console.error('密码解密失败:', e);
                            return res.status(400).json({ 
                                success: false, 
                                error: '密码解密失败' 
                            });
                        }
                    } else {
                        // 如果没有加密信息，直接保存（明文）
                        await configService.setConfig(config.key, config.value, config.description);
                    }
                } else {
                    // 其他配置正常保存
                    await configService.setConfig(config.key, config.value, config.description);
                }
                
                // 检查是否修改了关键配置
                if (config.key === 'TASK_CHECK_INTERVAL') {
                    needResetGlobalScheduler = true;
                } else if (config.key === 'TASK_EXPIRE_DAYS') {
                    needReloadTaskExpireDays = true;
                }
            }
            
            // 更新缓存过期时间
            const newFolderCacheTTL = configs.find(c => c.key === 'FOLDER_CACHE_TTL')?.value;
            if (newFolderCacheTTL) {
                folderCache.setTTL(parseInt(newFolderCacheTTL));
            }
            
            // 重新初始化定时任务
            if (needResetGlobalScheduler) {
                await setupGlobalTaskScheduler();
            }
            
            // 重新加载任务过期天数
            if (needReloadTaskExpireDays) {
                await taskService.loadConfig();
            }
            
            res.json({ success: true });
        } catch (error) {
            console.error('更新系统设置失败:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 验证当前密码API
    app.post('/api/system/verify-password', async (req, res) => {
        try {
            const { currentPassword } = req.body;
            const storedPassword = await configService.getConfigValue('AUTH_PASSWORD');
            
            // 验证密码是否正确
            if (currentPassword === storedPassword) {
                res.json({ success: true });
            } else {
                res.json({ success: false, error: '当前密码不正确' });
            }
        } catch (error) {
            console.error('验证密码失败:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 启动服务器
    const port = process.env.PORT || 3000;
    app.listen(port, async () => {
        console.log(`服务器运行在 http://0.0.0.0:${port}`);
        // 设置全局定时任务
        await setupGlobalTaskScheduler();
        // 初始化自定义定时任务
        await initCustomTaskSchedulers();
    });
}).catch(error => {
    console.error('数据库连接失败:', error);
});