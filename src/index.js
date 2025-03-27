require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const basicAuth = require('express-basic-auth');
const fs = require('fs').promises;
const path = require('path');
const { AppDataSource } = require('./database');
const { Account, Task, TaskLog } = require('./entities');
const { TaskService } = require('./services/task');
const { Cloud189Service } = require('./services/cloud189');
const { MessageUtil } = require('./services/message');
const { CacheManager } = require('./services/CacheManager')

const app = express();
app.use(express.json());
app.use(express.static('src/public'));

// 添加HTTP基本认证
app.use(basicAuth({
    users: { [process.env.AUTH_USERNAME]: process.env.AUTH_PASSWORD },
    challenge: true,
    realm: encodeURIComponent('天翼云盘自动转存系统')
}));

// 初始化数据库连接
AppDataSource.initialize().then(() => {
    console.log('数据库连接成功');
    const accountRepo = AppDataSource.getRepository(Account);
    const taskRepo = AppDataSource.getRepository(Task);
    const taskLogRepo = AppDataSource.getRepository(TaskLog);
    const taskService = new TaskService(taskRepo, accountRepo, taskLogRepo);
    const messageUtil = new MessageUtil();
    // 初始化缓存管理器
    const folderCache = new CacheManager(parseInt(process.env.FOLDER_CACHE_TTL || 600));

    // 账号相关API
    app.get('/api/accounts', async (req, res) => {
        const accounts = await accountRepo.find();
        // 获取容量
        for (const account of accounts) {
            const cloud189 = Cloud189Service.getInstance(account);
            const capacity = await cloud189.client.getUserSizeInfo()
            account.capacity = {
                cloudCapacityInfo: null,
                familyCapacityInfo: null
            }
            if (capacity && capacity.res_code == 0) {
                account.capacity.cloudCapacityInfo = capacity.cloudCapacityInfo;
                account.capacity.familyCapacityInfo = capacity.familyCapacityInfo;
            }
        }
        res.json({ success: true, data: accounts });
    });

    app.post('/api/accounts', async (req, res) => {
        try {
            const account = accountRepo.create(req.body);
            await accountRepo.save(account);
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
        const tasks = await taskRepo.find({
            order: { id: 'DESC' }
        });
        res.json({ success: true, data: tasks });
    });

    app.post('/api/tasks', async (req, res) => {
        try {
            const { accountId, shareLink, targetFolderId, totalEpisodes, accessCode, shareFolderId, shareFolderName, resourceName } = req.body;
            
            // 如果提供了特定的文件夹信息，直接创建任务
            if (shareFolderId && shareFolderName) {
                const task = await taskService.createTask(accountId, shareLink, targetFolderId, totalEpisodes, accessCode, {
                    shareFolderId,
                    shareFolderName,
                    resourceName,
                    episodeThreshold: 1000 // 设置默认截止集数
                });
                res.json({ success: true, data: task });
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
            const task = await taskService.createTask(accountId, shareLink, targetFolderId, totalEpisodes, accessCode, {
                episodeThreshold: 1000 // 设置默认截止集数
            });
            res.json({ success: true, data: task });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.delete('/api/tasks/:id', async (req, res) => {
        try {
            await taskService.deleteTask(parseInt(req.params.id));
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

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
                episodeThreshold, episodeRegex, whitelistKeywords, blacklistKeywords 
            } = req.body;
            
            // 如果shareFolderId为"root",则获取原任务的shareFileId
            let updates = { 
                resourceName, targetFolderId, currentEpisodes, totalEpisodes, 
                status, shareFolderName, targetFolderName, 
                episodeThreshold, episodeRegex, whitelistKeywords, blacklistKeywords 
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
            
            res.json({ success: true, data: updatedTask });
        } catch (error) {
            console.error('更新任务失败:', error);
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/tasks/:id/execute', async (req, res) => {
        try {
            const task = await taskRepo.findOneBy({ id: parseInt(req.params.id) });
            if (!task) throw new Error('任务不存在');
            const result = await taskService.processTask(task);
            if (result) {
                messageUtil.sendMessage(result)
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
        const fileList =  await taskService.getAllFolderFiles(cloud189, folderId);
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

    // 启动定时任务
    cron.schedule(process.env.TASK_CHECK_INTERVAL, async () => {
        console.log('执行定时任务检查...');
        const tasks = await taskService.getPendingTasks();
        let saveResults = []
        for (const task of tasks) {
            try {
            result = await taskService.processTask(task);
            if (result) {
                saveResults.push(result)
            }
            } catch (error) {
                console.error(`任务${task.id}执行失败:`, error);
            }
        }
        if (saveResults.length > 0) {
            messageUtil.sendMessage(saveResults.join("\n\n"))
        }
    });

    // 启动服务器
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`服务器运行在 http://localhost:${port}`);
    });
}).catch(error => {
    console.error('数据库连接失败:', error);
});