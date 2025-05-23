const { CloudClient, FileTokenStore } = require('cloud189-sdk');
const crypto = require('crypto');
const { rawListeners } = require('process');
class Cloud189Service {
    static instances = new Map();

    static getInstance(account) {
        const key = account.username;
        if (!this.instances.has(key)) {
            this.instances.set(key, new Cloud189Service(account));
        }
        return this.instances.get(key);
    }

    constructor(account) {

        const _options = {
            username: account.username,
            password: account.password,
            token: new FileTokenStore(`data/${account.username}.json`)
        }
        if (!account.password && account.cookies) {
            _options.ssonCookie = account.cookies
            _options.password = null   
        }

        this.client = new CloudClient(_options);
    }

    // 解析分享链接获取文件信息
    async getShareInfo(shareCode) {
        const response = await this.client.request.get('https://cloud.189.cn/api/open/share/getShareInfoByCodeV2.action', {
            searchParams: { shareCode },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response;
    }

    // 获取分享目录下的文件列表
    async listShareDir(shareId, fileId, shareMode, accessCode) {
        const response = await this.client.request.get('https://cloud.189.cn/api/open/share/listShareDir.action', {
            searchParams: {
                shareId,
                isFolder: true,
                fileId: fileId,
                orderBy: 'lastOpTime',
                descending: true,
                shareMode: shareMode,
                pageNum: 1,
                pageSize: 1000,
                descending:true,
                accessCode
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response;
    }

    // 递归获取所有文件列表
    async getAllShareFiles(shareId, fileId, shareMode, accessCode) {
        const result = await this.listShareDir(shareId, fileId, shareMode, accessCode);
        if (!result || (!result.fileListAO.folderList && !result.fileListAO.fileList)) {
            return [];
        }

        let allFiles = [...result.fileListAO.fileList];

        // 递归获取子文件夹中的文件
        for (const floder of result.fileListAO.folderList) {
            const subFiles = await this.getAllShareFiles(shareId, floder.id, shareMode, accessCode);
                allFiles = allFiles.concat(subFiles);
        }

        return allFiles;
    }

    // 搜索个人网盘文件
    async searchFiles(filename) {
        const response = await this.client.request('https://cloud.189.cn/api/open/file/searchFiles.action', {
            searchParams: {
                folderId: '-11',
                pageSize: '1000',
                pageNum: '1',
                recursive: 1,
                mediaType: 0,
                filename
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response;
    }

    // 获取个人网盘文件列表
    async listFiles(folderId) {
        const response = await this.client.request.get('https://cloud.189.cn/api/open/file/listFiles.action', {
            searchParams: {
                folderId,
                mediaType: 0,
                orderBy: 'lastOpTime',
                descending: true,
                pageNum: 1,
                pageSize: 1000
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response;
    }

    // 创建转存任务
    async createSaveTask(taskInfos, targetFolderId, shareId) {
        console.log("========== 开始创建转存任务 ============")
        console.log("taskInfos: ", taskInfos)
        console.log("targetFolderId: ", targetFolderId)
        console.log("shareId: ", shareId)
        const response = await this.client.request('https://cloud.189.cn/api/open/batch/createBatchTask.action', {
            method: 'POST',
            form: {
                type: 'SHARE_SAVE',
                taskInfos,
                targetFolderId,
                shareId
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response;
    }

     // 创建批量执行任务 跟这个createSaveTask方法一样，处理方式不一样，但是功能一样
    async createBatchTask(batchTaskDto) {
        console.log("创建批量任务")
        console.log(`batchTaskDto: ${batchTaskDto.toString()}`)
        const response = await this.client.request('https://cloud.189.cn/api/open/batch/createBatchTask.action', {
            method: 'POST',
            form: batchTaskDto,
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        
        if (!response) {
            throw new Error('创建批量任务失败：响应为空');
        }
        
        if (response.res_code !== 0) {
            throw new Error(`创建批量任务失败：${response.res_message || '未知错误'}`);
        }
        
        return response;
    }

    // 查询转存任务状态
    async checkTaskStatus(taskId) {
        const params = {taskId: taskId, type: 'SHARE_SAVE'}
        const response = await this.client.request('https://cloud.189.cn/api/open/batch/checkBatchTask.action', {
            method: 'POST',
            form: params,
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response;
    }

    // 获取目录树节点
    async getFolderNodes(folderId = '-11') {
        const response = await this.client.request('https://cloud.189.cn/api/portal/getObjectFolderNodes.action', {
            method: 'POST',
            form: {
                id: folderId,
                orderBy: 1,
                order: 'ASC'
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response;
    }

    // 新建目录
    async createFolder(folderName, parentFolderId) {
        const response = await this.client.request('https://cloud.189.cn/api/open/file/createFolder.action', {
            method: 'POST',
            form: {
                parentFolderId: parentFolderId,
                folderName: folderName
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            },
        }).json();
        return response;
    }

     // 验证分享链接访问码
     async checkAccessCode(shareCode, accessCode) {
        const response = await this.client.request.get('https://cloud.189.cn/api/open/share/checkAccessCode.action', {
            searchParams: {
                shareCode,
                accessCode,
                uuid: crypto.randomUUID()
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response;
    }
    // 获取冲突的文件 
    async getConflictTaskInfo(taskId) {
        const response = await this.client.request('https://cloud.189.cn/api/open/batch/getConflictTaskInfo.action', {
            method: 'POST',
            json: {
                taskId,
                type: 'SHARE_SAVE'
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response
    }

    // 处理冲突 taskInfos: [{"fileId":"","fileName":"","isConflict":1,"isFolder":0,"dealWay":1}]
    async manageBatchTask(taskId,targetFolderId, taskInfos) {
        const response = await this.client.request('https://cloud.189.cn/api/open/batch/manageBatchTask.action', {
            method: 'POST',
            json: {
                taskId,
                type: 'SHARE_SAVE',
                targetFolderId,
                taskInfos
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response
    }


    // 重命名文件
    async renameFile(fileId, destFileName) {
        try{
            const response = await this.client.request('https://cloud.189.cn/api/open/file/renameFile.action', {
                method: 'POST',
                form: {
                    fileId,
                    destFileName
                },
                headers: {
                    'Accept': 'application/json;charset=UTF-8'
                }
            }).json();
            return response;
        }catch(e){
            if (JSON.parse(e.response.body).res_code == "FileAlreadyExists") {
                return {
                    res_code: "FileAlreadyExists",
                    res_msg: "文件已存在"
                }
            }
            throw e;
        }
    }

    // 保存分享文件
    async saveShareFile(shareId, fileId, targetFolderId, shareMode) {
        try {
            const response = await this.client.request('https://cloud.189.cn/api/open/share/saveShare2PersonalSpace.action', {
                method: 'POST',
                form: {
                    shareId,
                    fileId,
                    targetFolderId,
                    shareMode
                },
                headers: {
                    'Accept': 'application/json;charset=UTF-8'
                }
            }).json();
            return response;
        } catch(e) {
            console.error('保存分享文件失败:', e);
            throw e;
        }
    }

    // 获取家庭信息
    async getFamilyInfo() {
        const familyList = await this.client.getFamilyList()
        if (!familyList || !familyList.familyInfoResp) {
            return null
        }
        const resp = familyList.familyInfoResp
        for (const family of resp) {
            if (family.userRole == 1) {
                return family
            }
        }
        return null
    }

    // 删除文件 fileinfos和targetFolderId选一个即可，勿同时使用
    async delFile(fileinfos, targetFolderId) {
        console.log("========== 开始删除任务 ============")
        console.log("taskInfos: ", fileinfos)
        console.log("targetFolderId: ", targetFolderId)
        const response = await this.client.request('https://cloud.189.cn/api/open/batch/createBatchTask.action', {
            method: 'POST',
            form: {
                type: 'DELETE',
                taskInfos:JSON.stringify(fileinfos), // [{"fileId":"223503189144344415","fileName":"云盘接入DeepSeek满血版：免费稳定流畅.mp4","isFolder":0}]
                targetFolderId: null
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8',
                "Content-Type": "application/x-www-form-urlencoded"
            }
        }).json();
        return response;
    }

    //  个人签到 execThreshold: 并发数 默认1,若要填，建议5
    async userSign(execThreshold = 1) {
        const tasks = Array.from({ length: execThreshold }, () =>
            this.client.userSign()
        );
        const result = (await Promise.allSettled(tasks)).filter(
            ({ status, value }) => status === "fulfilled" && !value.isSign && value.netdiskBonus
        );
        const rlt = `个人签到任务: 成功数/总请求数 ${result.length}/${tasks.length} 获得 ${
            result.map(({ value }) => value.netdiskBonus)?.join(",") || "0"
        }M 空间`;
        console.log(rlt);
        return rlt;
    }

    async familySign(families = []) {
        const { familyInfoResp } = await this.client.getFamilyList();
        if (familyInfoResp) {
            let familyId = null;
            //指定家庭签到
            if (families.length > 0) {
                const tagetFamily = familyInfoResp.find((familyInfo) =>
                families.includes(familyInfo.remarkName)
            );
            if (tagetFamily) {
                familyId = tagetFamily.familyId;
            } else {
                return `没有加入到指定家庭分组${families.toString()}`;
            }
            } else {
                familyId = familyInfoResp[0].familyId;
            }
            console.log(`执行家庭签到ID:${familyId}`);
            const tasks = [ this.client.familyUserSign(familyId) ];
            const result = (await Promise.allSettled(tasks)).filter(
                ({ status, value }) => status === "fulfilled" && !value.signStatus && value.bonusSpace
            );
            console.log('家庭签到返回:', result);
            return `家庭签到任务: 获得 ${
                result.map(({ value }) => value.bonusSpace)?.join(",") || "0"
            }M 空间`;
        }
        return "没有找到家庭信息";
    }
}

module.exports = { Cloud189Service };