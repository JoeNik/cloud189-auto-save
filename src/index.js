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
    const taskService = new TaskService(taskRepo, accountRepo);
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
                    resourceName
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
            const task = await taskService.createTask(accountId, shareLink, targetFolderId, totalEpisodes, accessCode);
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
            const { resourceName, realFolderId, currentEpisodes, totalEpisodes, status, shareFolderName, shareFolderId, realFolderName, episodeThreshold, episodeRegex } = req.body;
            const updates = { resourceName, realFolderId, currentEpisodes, totalEpisodes, status, shareFolderName, shareFolderId, realFolderName, episodeThreshold, episodeRegex };
            const updatedTask = await taskService.updateTask(taskId, updates);
            res.json({ success: true, data: updatedTask });
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
                DINGTALK_TOKEN: process.env.DINGTALK_TOKEN || '',
                DINGTALK_SECRET: process.env.DINGTALK_SECRET || ''
            };
            res.json({ success: true, data: config });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 更新通知配置
    app.post('/api/config/notification', async (req, res) => {
        try {
            const { DINGTALK_TOKEN, DINGTALK_SECRET } = req.body;
            const envPath = path.resolve(process.cwd(), '.env');
            let envContent = await fs.readFile(envPath, 'utf8');

            // 更新环境变量
            envContent = envContent.replace(/DINGTALK_TOKEN=.*\n/, `DINGTALK_TOKEN=${DINGTALK_TOKEN}\n`);
            envContent = envContent.replace(/DINGTALK_SECRET=.*\n/, `DINGTALK_SECRET=${DINGTALK_SECRET}\n`);

            await fs.writeFile(envPath, envContent);

            // 更新当前进程的环境变量
            process.env.DINGTALK_TOKEN = DINGTALK_TOKEN;
            process.env.DINGTALK_SECRET = DINGTALK_SECRET;

            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 获取更新记录
    app.get('/api/logs/updates', async (req, res) => {
        try {
            const logs = await taskLogRepo.find({
                order: { timestamp: 'DESC' },
                take: 100
            });
            res.json({ success: true, data: logs });
        } catch (error) {
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