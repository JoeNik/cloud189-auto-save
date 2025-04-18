const { Cloud189Service } = require('./cloud189');
const { MessageUtil } = require('./message');
const { BatchTaskDto } = require('../dto/BatchTaskDto');
const { Console } = require('console');

class TaskService {
    constructor(taskRepo, accountRepo, taskLogRepo, configService) {
        this.taskRepo = taskRepo;
        this.accountRepo = accountRepo;
        this.taskLogRepo = taskLogRepo;
        this.messageUtil = new MessageUtil();
        this.configService = configService;
        this.taskExpireDays = 10; // 默认值

        // 从配置服务加载过期天数
        this.loadConfig();
        
        // 默认的集数匹配正则表达式
        this.defaultEpisodeRegex = [
            /[Ss]\d+[Ee](\d+)/,    // S01E01 格式，只提取E后面的集数
            /[Ee][Pp]?(\d+)/i,     // EP01 或 E01 格式
            /第(\d+)[集话]/,       // 第01集 格式
            /\.E(\d+)\./i,         // .E01. 格式
            /[\[\(](\d+)[\]\)]/    // [01] 或 (01) 格式
        ];
    }

    // 加载配置
    async loadConfig() {
        if (this.configService) {
            const expireDays = await this.configService.getConfigValue('TASK_EXPIRE_DAYS', '10');
            this.taskExpireDays = parseInt(expireDays);
            console.log(`任务过期天数配置加载完成: ${this.taskExpireDays}天`);
        }
    }

    // 从文件名中提取集数
    _getEpisodeNumber(fileName, episodeRegex, episodeUseRegex) {
        console.log(`开始解析 ${fileName} 的集数,正则: ${episodeRegex},是否使用正则: ${episodeUseRegex}`);

        // 如果不使用正则表达式
        if (episodeUseRegex === 0) {
            console.log(`[${fileName}] 不使用正则表达式解析集数`);
            return null;
        }
        // 如果提供了自定义正则表达式
        if (episodeRegex) {
            try {
                console.log('[自定义正则] 使用自定义正则表达式解析集数')
                const regex = new RegExp(episodeRegex);
                const match = fileName.match(regex);
                if (match && match[1]) {
                    return parseInt(match[1]);
                }
            } catch (error) {
                console.error('自定义正则表达式解析失败:', error);
            }
        }

        // 使用默认正则表达式
        for (const regex of this.defaultEpisodeRegex) {
            const match = fileName.match(regex);
            console.log(`[默认正则] 使用正则 ${regex}`);
            if (match && match[1]) {
                const episodeNumber = parseInt(match[1]);
                if (!isNaN(episodeNumber)) {
                    // console.log(`[默认正则] 使用正则 ${regex} 从文件 ${fileName} 中提取到第 ${episodeNumber} 集`);
                    return episodeNumber;
                }
            }
        }
        return null;
    }

    // 检查文件是否符合黑白名单规则
    _checkFileNameFilters(fileName, task) {
        // 检查白名单
        if (task.whitelistKeywords) {
            const whitelistKeywords = task.whitelistKeywords.split(',').map(k => k.trim());
            if (whitelistKeywords.length > 0) {
                const matchesWhitelist = whitelistKeywords.some(keyword => 
                    fileName.toLowerCase().includes(keyword.toLowerCase())
                );
                if (!matchesWhitelist) {
                    console.log(`[${task.resourceName}] 文件 ${fileName} 不在白名单中，跳过`);
                    return false;
                }
            }
        }

        // 检查黑名单
        if (task.blacklistKeywords) {
            const blacklistKeywords = task.blacklistKeywords.split(',').map(k => k.trim());
            if (blacklistKeywords.length > 0) {
                const matchesBlacklist = blacklistKeywords.some(keyword => 
                    fileName.toLowerCase().includes(keyword.toLowerCase())
                );
                if (matchesBlacklist) {
                    console.log(`[${task.resourceName}] 文件 ${fileName} 在黑名单中，跳过`);
                    return false;
                }
            }
        }

        return true;
    }

    // 检查文件是否需要转存
    _shouldSaveFile(fileName, task) {
        // 首先检查黑白名单
        if (!this._checkFileNameFilters(fileName, task)) {
            return false;
        }

        if (!task.episodeThreshold) {
            console.log(`[${task.resourceName}] 文件 ${fileName} 无截止集数配置，默认保存`);
            return true;
        }

        const episodeNumber = this._getEpisodeNumber(fileName, task.episodeRegex, task.episodeUseRegex);
        if (episodeNumber === null) {
            console.log(`[${task.resourceName}] 文件 ${fileName} 无法解析集数，默认保存`);
            return true;
        }
        if(episodeNumber > task.episodeThreshold) {
            console.log(`[${task.resourceName}] 文件 ${fileName} 解析到第 ${episodeNumber} 集，截止集数为 ${task.episodeThreshold}，${episodeNumber > task.episodeThreshold ? '需要' : '不需要'}保存`);
        }
        return episodeNumber > task.episodeThreshold;
    }

    // 解析分享码
    async parseShareCode(shareLink) {
        // 解析分享链接
        let shareCode;
        const shareUrl = new URL(shareLink);
        if (shareUrl.pathname === '/web/share') {
            shareCode = shareUrl.searchParams.get('code');
        } else if (shareUrl.pathname.startsWith('/t/')) {
            shareCode = shareUrl.pathname.split('/').pop();
        }else if (shareUrl.hash && shareUrl.hash.includes('/t/')) {
            shareCode = shareUrl.hash.split('/').pop();
        }else if (shareUrl.pathname.includes('share.html')) {
            // 其他可能的 share.html 格式
            const hashParts = shareUrl.hash.split('/');
            shareCode = hashParts[hashParts.length - 1];
        }
        
        if (!shareCode) throw new Error('无效的分享链接');
        return shareCode
    }

    // 解析分享链接
    async getShareInfo(cloud189, shareCode) {
         console.log("解析分享链接")
         const shareInfo = await cloud189.getShareInfo(shareCode);
        //  console.log(shareInfo)
         if (!shareInfo) throw new Error('获取分享信息失败');
         return shareInfo;
    }

    // 创建任务的基础配置
    _createTaskConfig(accountId, shareLink, targetFolderId, totalEpisodes, shareInfo, targetFolder, resourceName, currentEpisodes = 0, shareFolderId = null, shareFolderName = "", episodeThreshold = 1000) {
        return {
            accountId,
            shareLink,
            targetFolderId: targetFolder.id,
            targetFolderName: targetFolder.name,
            status: 'pending',
            totalEpisodes,
            resourceName,
            currentEpisodes,
            shareFileId: shareInfo.fileId,
            shareFolderId: shareFolderId || shareInfo.fileId,
            shareFolderName,
            shareId: shareInfo.shareId,
            shareMode: shareInfo.shareMode,
            accessCode: shareInfo.userAccessCode,
            episodeThreshold: episodeThreshold
        };
    }

     // 验证并创建目标目录
     async _validateAndCreateTargetFolder(cloud189, targetFolderId, shareInfo) {
        const folderInfo = await cloud189.listFiles(targetFolderId);
        if (folderInfo.fileListAO.folderList.length > 0 && 
            folderInfo.fileListAO.folderList.find(folder => folder.name === shareInfo.fileName)) {
            throw new Error('目标已存在同名目录，请选择其他目录');
        }
        
        const targetFolder = await cloud189.createFolder(shareInfo.fileName, targetFolderId);
        if (!targetFolder || !targetFolder.id) throw new Error('创建目录失败');
        return targetFolder;
    }

    // 处理文件夹分享
    async _handleFolderShare(cloud189, shareInfo, accountId, shareLink, targetFolderId, totalEpisodes, rootFolder, tasks, selectedFolders = []) {
        
        const result = await cloud189.listShareDir(shareInfo.shareId, shareInfo.fileId, shareInfo.shareMode, shareInfo.userAccessCode);
        if (!result?.fileListAO) return;

        if (totalEpisodes == null || totalEpisodes == 0) {
            totalEpisodes = 100;
        }

        const { fileList: rootFiles = [], folderList: subFolders = [] } = result.fileListAO;
        
        // 处理根目录文件
        if (rootFiles.length > 0 && (selectedFolders.length === 0 || selectedFolders.includes('root'))) {
            const rootTask = this.taskRepo.create(
                this._createTaskConfig(
                    accountId, shareLink, targetFolderId, totalEpisodes,
                    shareInfo, rootFolder, `${shareInfo.fileName}(根)`, rootFiles.length
                )
            );
            tasks.push(await this.taskRepo.save(rootTask));
        }

        // 处理子文件夹,只处理选中的文件夹
        for (const folder of subFolders) {
            // 如果指定了selectedFolders且当前文件夹不在选中列表中,则跳过
            if (selectedFolders.length > 0 && !selectedFolders.includes(folder.id)) {
                continue;
            }
            
            const targetFolder = await cloud189.createFolder(folder.name, rootFolder.id);
            if (!targetFolder?.id) throw new Error('创建目录失败');

            console.log("创建子目录: ", folder.name)

            const subTask = this.taskRepo.create(
                this._createTaskConfig(
                    accountId, shareLink, targetFolderId, totalEpisodes,
                    shareInfo, targetFolder, shareInfo.fileName, 0, folder.id, folder.name, 1000
                )
            );
            tasks.push(await this.taskRepo.save(subTask));
        }
    }

    // 处理单文件分享
    async _handleSingleShare(cloud189, shareInfo, accountId, shareLink, targetFolderId, totalEpisodes, rootFolderId, tasks) {
        const shareFiles = await cloud189.getAllShareFiles(shareInfo.shareId, shareInfo.fileId, shareInfo.shareMode, shareInfo.userAccessCode);
        if (!shareFiles?.length) throw new Error('获取文件列表失败');

        const task = this.taskRepo.create(
            this._createTaskConfig(
                accountId, shareLink, targetFolderId, totalEpisodes,
                shareInfo, rootFolderId, shareInfo.fileName, shareFiles.length
            )
        );
        tasks.push(await this.taskRepo.save(task));
    }

    // 创建新任务
    async createTask(accountId, shareLink, targetFolderId, totalEpisodes = 100, accessCode = null, selectedFolders = []) {
        // 确保 selectedFolders 是数组
        if (!Array.isArray(selectedFolders)) {
            selectedFolders = [];
        }

        // 获取分享信息
        const account = await this.accountRepo.findOneBy({ id: accountId });
        if (!account) throw new Error('账号不存在');
        
        const cloud189 = Cloud189Service.getInstance(account);
        const shareCode = await this.parseShareCode(shareLink);
        const shareInfo = await this.getShareInfo(cloud189, shareCode);
        // 如果分享链接是加密链接, 且没有提供访问码, 则抛出错误
        if (shareInfo.shareMode == 1 ) {
            if (!accessCode) {
                throw new Error('分享链接为加密链接, 请提供访问码');
            }
            // 校验访问码是否有效
            const accessCodeResponse = await cloud189.checkAccessCode(shareCode, accessCode);
            console.log(accessCodeResponse)
            if (!accessCodeResponse.shareId) {
                throw new Error('访问码无效');
            }
            shareInfo.shareId = accessCodeResponse.shareId;
        }
        if (!shareInfo.shareId) {
            throw new Error('获取分享信息失败');
        }
        // 检查并创建目标目录
        const rootFolder = await this._validateAndCreateTargetFolder(cloud189, targetFolderId, shareInfo);
        const tasks = [];
        shareInfo.userAccessCode = accessCode;
        if (shareInfo.isFolder) {
            await this._handleFolderShare(cloud189, shareInfo, accountId, shareLink, targetFolderId, totalEpisodes, rootFolder, tasks, selectedFolders);
        }

         // 处理单文件或空文件夹情况
         if (tasks.length === 0) {
            await this._handleSingleShare(cloud189, shareInfo, accountId, shareLink, targetFolderId, totalEpisodes, rootFolder, tasks);
        }
        return tasks;
    }

    // 删除任务
    async deleteTask(taskId) {
        const task = await this.taskRepo.findOneBy({ id: taskId });
        if (!task) throw new Error('任务不存在');
        await this.taskRepo.remove(task);
    }

    // 记录任务日志
    async logTaskEvent(taskId, message) {
        const log = this.taskLogRepo.create({
            taskId,
            message
        });
        await this.taskLogRepo.save(log);
    }

    // 获取文件夹下的所有文件
    async getAllFolderFiles(cloud189, folderId) {
        const folderInfo = await cloud189.listFiles(folderId);
        if (!folderInfo || !folderInfo.fileListAO) {
            return [];
        }

        let allFiles = [...(folderInfo.fileListAO.fileList || [])];
        // const folders = folderInfo.fileListAO.folderList || [];

        // for (const folder of folders) {
        //     const subFiles = await this.getAllFolderFiles(cloud189, folder.id);
        //     allFiles = allFiles.concat(subFiles);
        // }

        return allFiles;
    }

    // 格式化文件大小
    _formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 执行任务
    async processTask(task) {
        let saveResults = [];
        try {
            console.log(`[${task.resourceName}] 开始执行任务...`);
            const account = await this.accountRepo.findOneBy({ id: task.accountId });
            if (!account) {
                throw new Error('账号不存在');
            }
            // console.log(`[${task.resourceName}] 账号信息:`, account);
            const cloud189 = Cloud189Service.getInstance(account);
            // 获取分享文件列表并进行增量转存
            const shareDir = await cloud189.listShareDir(task.shareId, task.shareFolderId, task.shareMode,task.accessCode);
            if (!shareDir || !shareDir.fileListAO.fileList) {
                console.log("获取文件列表失败: " + JSON.stringify(shareDir))
                throw new Error('获取文件列表失败');
            }
            let shareFiles = [...shareDir.fileListAO.fileList];
            let existingFiles = new Set();
            
            const folderFiles = await this.getAllFolderFiles(cloud189, task.targetFolderId);
            existingFiles = new Set(
                folderFiles
                    .filter(file => !file.isFolder)
                    .map(file => file.md5)
            );
            const newFiles = shareFiles
                .filter(file => !file.isFolder && !existingFiles.has(file.md5))
                .filter(file => this._shouldSaveFile(file.name, task));

            if (newFiles.length > 0) {
                const resourceName = task.shareFolderName ? `${task.resourceName}/${task.shareFolderName}` : task.resourceName;
                const taskInfoList = [];
                const fileDetailsList = [];
                let maxEpisode = task.episodeThreshold || 1000;
                let totalSize = 0;

                // 构建任务信息列表
                for (const file of newFiles) {
                    taskInfoList.push({
                        fileId: file.id,
                        fileName: file.name,
                        isFolder: 0
                    });
                    
                    // 记录文件详情,包含大小信息
                    fileDetailsList.push(`📄 ${file.name} (${this._formatFileSize(file.size)})`);
                    totalSize += file.size;

                    // 更新最大集数
                    const episodeNumber = this._getEpisodeNumber(file.name, task.episodeRegex,task.episodeUseRegex);
                    if (episodeNumber!= null && episodeNumber && episodeNumber > maxEpisode) {
                        maxEpisode = episodeNumber;
                    }
                }

                // 创建批量转存任务
                const taskResp = await cloud189.createSaveTask(
                    JSON.stringify(taskInfoList),
                    task.targetFolderId,
                    task.shareId
                );

                if (taskResp.res_code !== 0) {
                    throw new Error(`创建转存任务失败: ${taskResp.res_message}`);
                }

                // 记录日志
                const logMessage = `${resourceName}更新${taskInfoList.length}个文件:\n${fileDetailsList.join('\n')}`;
                await this.logTaskEvent(task.id, logMessage);

                // 构建通知消息
                let notificationMessage = `📢 ${resourceName}\n`;
                notificationMessage += `✨ 更新${taskInfoList.length}个文件 (总计: ${this._formatFileSize(totalSize)})\n`;
                notificationMessage += `\n${fileDetailsList.join('\n')}`;

                // 更新截止集数
                if (maxEpisode > task.episodeThreshold) {
                    const oldThreshold = task.episodeThreshold;
                    task.episodeThreshold = maxEpisode;
                    console.log(`[${task.resourceName}] 更新截止集数：${oldThreshold || '无'} -> ${maxEpisode}`);
                    notificationMessage += `\n\n🔄 更新截止集数：${oldThreshold || '无'} -> ${maxEpisode}`;
                }

                saveResults.push(notificationMessage);
                task.status = 'processing';
                task.lastFileUpdateTime = new Date();
                task.currentEpisodes += 1;
                await this.taskRepo.save(task);
            }
            return saveResults.length > 0 ? saveResults.join('\n\n') : null;
        } catch (error) {
            console.error('处理任务失败:', error);
            task.status = 'failed';
            await this.taskRepo.save(task);
            throw error;
        }
    }

    // 获取所有任务
    async getTasks() {
        return await this.taskRepo.find({
            order: {
                id: 'ASC'
            }
        });
    }

    // 获取待处理任务
    async getPendingTasks() {
        return await this.taskRepo.find({
            where: [
                { status: 'pending' },
                { status: 'processing' }
            ]
        });
    }

    // 更新任务
    async updateTask(taskId, updates) {
        const task = await this.taskRepo.findOneBy({ id: taskId });
        if (!task) throw new Error('任务不存在');

        // console.log('更新前的任务:', {
        //     id: task.id,
        //     targetFolderId: task.targetFolderId,
        //     targetFolderName: task.targetFolderName,
        //     shareFolderId: task.shareFolderId,
        //     shareFolderName: task.shareFolderName
        // });

        // 更新特定字段
        const allowedFields = [
            'resourceName', 'targetFolderId', 'currentEpisodes', 'totalEpisodes', 
            'status', 'shareFolderName', 'shareFolderId', 'targetFolderName', 
            'episodeThreshold', 'episodeRegex','episodeUseRegex','maxKeepSaveFile', 'whitelistKeywords', 'blacklistKeywords',
            'cronExpression'
        ];
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                task[field] = updates[field];
            }
        }

        // console.log('更新后的任务:', {
        //     id: task.id,
        //     targetFolderId: task.targetFolderId,
        //     targetFolderName: task.targetFolderName,
        //     shareFolderId: task.shareFolderId,
        //     shareFolderName: task.shareFolderName
        // });

        // 验证状态值
        const validStatuses = ['pending', 'processing', 'completed', 'failed'];
        if (!validStatuses.includes(task.status)) {
            throw new Error('无效的状态值');
        }

        // 验证数值字段
        if (task.currentEpisodes !== null && task.currentEpisodes < 0) {
            throw new Error('更新数不能为负数');
        }
        if (task.totalEpisodes !== null && task.totalEpisodes < 0) {
            throw new Error('总数不能为负数');
        }
        if (task.episodeThreshold !== null && task.episodeThreshold < 0) {
            throw new Error('截止集数不能为负数');
        }

        if(task.maxKeepSaveFile!== null && task.maxKeepSaveFile < 0) {
            throw new Error('最大保存文件数不能为负数');
        }

        // 验证黑白名单关键字格式
        if (task.whitelistKeywords && typeof task.whitelistKeywords !== 'string') {
            throw new Error('白名单关键字格式错误');
        }
        if (task.blacklistKeywords && typeof task.blacklistKeywords !== 'string') {
            throw new Error('黑名单关键字格式错误');
        }

        return await this.taskRepo.save(task);
    }

    // 自动重命名
    async autoRename(cloud189, task) {
        if (!task.sourceRegex || !task.targetRegex) return;
        const folderInfo = await cloud189.listFiles(task.targetFolderId);
        if (!folderInfo ||!folderInfo.fileListAO) return;
        const files = folderInfo.fileListAO.fileList;
        const message = []
        for (const file of files) {
            if (file.isFolder) continue;
            const destFileName = file.name.replace(new RegExp(task.sourceRegex), task.targetRegex);
            if (destFileName === file.name) continue;
            const renameResult = await cloud189.renameFile(file.id, destFileName);
            if (renameResult.res_code != 0) {
                console.log(`${file.name}重命名为${destFileName}失败, 原因:${destFileName}${renameResult.res_msg}`)
                message.push(` > <font color="comment">${file.name} => ${destFileName}失败, 原因:${destFileName}${renameResult.res_msg}</font>`)
            }else{
                console.log(`${file.name}重命名为${destFileName}成功`)
                message.push(` > <font color="info">${file.name} => ${destFileName}成功</font>`)
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        this.messageUtil.sendMessage(`${task.resourceName}自动重命名: \n ${message.join('\n')}`)
    }

    // 检查任务状态
    async checkTaskStatus(cloud189, taskId, count = 0, type) {
        if (count > 5) {
             return false;
        }
        // 轮询任务状态
        const task = await cloud189.checkTaskStatus(taskId)
        if (task.taskStatus == 3) {
            // 暂停200毫秒
            await new Promise(resolve => setTimeout(resolve, 200));
            // 确保this上下文正确
            return await this.checkTaskStatus.bind(this)(cloud189, taskId, count++, type)
        }
        if (task.taskStatus == 4) {
            return true;
        }
        // 如果status == 2 说明有冲突
        if (task.taskStatus == 2) {
            const conflictTaskInfo = await cloud189.getConflictTaskInfo(taskId);
            // 忽略冲突
            const taskInfos = conflictTaskInfo.taskInfos;
            for (const taskInfo of taskInfos) {
                taskInfo.dealWay = 1;
            }
            await cloud189.manageBatchTask(taskId, conflictTaskInfo.targetFolderId, taskInfos);
            await new Promise(resolve => setTimeout(resolve, 200));
            // 确保this上下文正确
            return await this.checkTaskStatus.bind(this)(cloud189, taskId, count++, type)
        }
        return false;
    }

     // 创建批量任务
     async createBatchTask(cloud189, batchTaskDto) {
        console.log(`[批量任务] 开始创建任务, 参数: ${JSON.stringify(batchTaskDto)}`)
        const resp = await cloud189.createBatchTask(batchTaskDto);
        if (!resp) {
            throw new Error('批量任务处理失败: 响应为空');
        }
        if (resp.res_code != 0) {
            throw new Error(`批量任务处理失败: ${resp.res_msg}`);
        }
        if (!resp.taskId) {
            throw new Error('批量任务处理失败: 任务ID为空');
        }
        console.log(`[批量任务] 任务创建成功, 任务ID: ${resp.taskId}, 类型: ${batchTaskDto.type}`)
        
        // 确保this上下文正确
        try {
            const success = await this.checkTaskStatus.bind(this)(cloud189, resp.taskId, 0, batchTaskDto.type);
            if (!success) {
                throw new Error(`批量任务处理失败: 任务状态检查失败, 任务ID: ${resp.taskId}`);
            }
            console.log(`[批量任务] 任务处理完成, 任务ID: ${resp.taskId}`)
        } catch (error) {
            console.error(`[批量任务] 任务处理异常, 任务ID: ${resp.taskId}, 错误: ${error.message}`)
            throw error;
        }
    }

     // 定时清空回收站
     async clearRecycleBin(enableAutoClearRecycle, enableAutoClearFamilyRecycle) {
        console.log(`定时清空回收站任务开始执行`)
        const accounts = await this.accountRepo.find()
        if (accounts) {
            for (const account of accounts) {
                let username = account.username.replace(/(.{3}).*(.{4})/, '$1****$2');
                try {
                    const cloud189 = Cloud189Service.getInstance(account); 
                    // 确保this上下文正确
                    await this._clearRecycleBin.bind(this)(cloud189, username, enableAutoClearRecycle, enableAutoClearFamilyRecycle)
                    // 记录成功日志
                    console.log(`清理回收站任务执行成功: ${username}`);
                    // await this.logTaskEvent(0, `清理回收站任务执行成功: ${username}`);
                } catch (error) {
                    console.log(`定时[${username}]清空回收站任务执行失败:${error.message}`);
                    // 记录失败日志
                    await this.logTaskEvent.bind(this)(0, `清理回收站任务执行失败: ${username}, 错误: ${error.message}`);
                }
            }
        }
    }

    // 执行清空回收站
    async _clearRecycleBin(cloud189, username, enableAutoClearRecycle, enableAutoClearFamilyRecycle) {
        const params = {
            taskInfos: '[]',
            type: 'EMPTY_RECYCLE',
        }   
        const batchTaskDto = new BatchTaskDto(params);
        if (enableAutoClearRecycle) {
            console.log(`开始清空[${username}]个人回收站`)
            // 确保this上下文正确
            await this.createBatchTask.bind(this)(cloud189, batchTaskDto)
            console.log(`清空[${username}]个人回收站完成`)
            await this.logTaskEvent.bind(this)(0, `清空[${username}]个人回收站完成`);
            // 延迟10秒
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
        if (enableAutoClearFamilyRecycle) {
            // 获取家庭id
            const familyInfo = await cloud189.getFamilyInfo()
            if (familyInfo == null) {
                console.log(`用户${username}没有家庭主账号, 跳过`)
                return
            }
            console.log(`开始清空[${username}]家庭回收站`)
            batchTaskDto.familyId = familyInfo.familyId
            // 确保this上下文正确
            await this.createBatchTask.bind(this)(cloud189, batchTaskDto)
            console.log(`清空[${username}]家庭回收站完成`)
            await this.logTaskEvent.bind(this)(0, `清空[${username}]家庭回收站完成`);
        }
    }

    // 删除任务下的文件夹目录多余的文件
    async processDeleteExtraFilesTask(cloud189, task) {
        try{
            // console.log('---------------',task)
            const folderInfo = await this.getAllFolderFiles(cloud189, task.targetFolderId);
            const files = folderInfo.filter(file =>!file.isFolder);
            if (files.length > task.maxKeepSaveFile) {
                const sortedFiles = files.sort((a, b) => b.createTime - a.createTime);
                const filesToDelete = sortedFiles.slice(task.maxKeepSaveFile).map(file => ({ fileId: file.id, fileName: file.name, isFolder: 0 }));
                console.log("目录下的文件", sortedFiles)
                console.log("准备删除的文件", filesToDelete)
                const deleteResult = await cloud189.delFile(filesToDelete, null); // 使用批量删除接口
                if (deleteResult.res_code !== 0) {
                    console.log(`删除${task.resourceName}目录下的文件失败, 原因:${deleteResult.res_msg}`)
                    await this.logTaskEvent.bind(this)(0, `删除文件失败, 原因:${deleteResult.res_msg}`);
                    return `删除文件失败, 原因:${deleteResult.res_msg}`
                } else {
                    console.log(`删除文件成功`)
                    await this.logTaskEvent.bind(this)(0, `${task.resourceName}目录下的文件数量: ${files.length}, 超过最大保存文件数: ${task.maxKeepSaveFile}, 删除${files.length - task.maxKeepSaveFile}个文件成功`);
                    return `${task.resourceName}目录下的文件数量: ${files.length}, 超过最大保存文件数: ${task.maxKeepSaveFile}, 删除${files.length - task.maxKeepSaveFile}个文件成功`
                }
            } else {
                console.log(`${task.targetFolderName}目录下的文件数量: ${files.length}, 小于最大保存文件数: ${task.maxKeepSaveFile}, 无需删除`)
                return null
            }
        } catch (error) {
            console.error('删除文件任务执行失败:', error);
            await this.logTaskEvent.bind(this)(0, `删除文件任务执行失败: ${error.message}`);
            throw error;
        }
    }

    async cloudSignTask(cloud189, execThreshold=1, families=[]){
        try{
            const signRlt = await cloud189.userSign(execThreshold);
            // 延迟10秒
            await new Promise(resolve => setTimeout(resolve, 10000));

            const familySignRlt = await cloud189.familySign(families);

            // 确保this上下文正确
            await this.logTaskEvent.bind(this)(0, `签到完成, ${signRlt}, 家庭签到:${familySignRlt}`);
            
            // 返回签到结果
            return `${signRlt}, ${familySignRlt}`;
        } catch (error) {
            console.error('签到失败:', error);
            // 确保this上下文正确
            await this.logTaskEvent.bind(this)(0, `签到失败:${error.message}`);
            throw error;
        }
    }
}

module.exports = { TaskService };