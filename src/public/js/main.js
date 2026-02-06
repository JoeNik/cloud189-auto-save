// 主入口文件
document.addEventListener('DOMContentLoaded', () => {
    checkLogin();
    initializeApp();
});

// 全局变量
let pendingFolders = [];
let shareInfo = null;
let selectedFolders = [];

// 文件夹选择相关函数
function showFolderSelectModal(folders, shareInfoData) {
    shareInfo = shareInfoData;
    pendingFolders = folders;
    const tbody = document.getElementById('folderListBody');
    tbody.innerHTML = '';
    folders.forEach(folder => {
        tbody.innerHTML += `
            <tr>
                <td><input type="checkbox" class="folder-checkbox" data-id="${folder.id}" data-name="${folder.name}"></td>
                <td>${folder.name}</td>
            </tr>
        `;
    });
    document.getElementById('folderSelectModal').style.display = 'block';
}

function toggleSelectAllFolders() {
    const selectAll = document.getElementById('selectAllFolders');
    const checkboxes = document.querySelectorAll('.folder-checkbox');
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
}

function closeFolderSelectModal() {
    document.getElementById('folderSelectModal').style.display = 'none';
}

async function confirmFolderSelection() {
    const selectedFolders = Array.from(document.querySelectorAll('.folder-checkbox:checked')).map(cb => ({
        id: cb.dataset.id,
        name: cb.dataset.name
    }));

    if (selectedFolders.length === 0) {
        toast.error('请至少选择一个文件夹');
        return;
    }

    const accountId = document.getElementById('accountId').value;
    const shareLink = document.getElementById('shareLink').value;
    const totalEpisodes = document.getElementById('totalEpisodes').value;
    const targetFolderId = document.getElementById('targetFolderId').value;
    const accessCode = document.getElementById('accessCode').value;

    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountId,
                shareLink,
                totalEpisodes,
                targetFolderId,
                accessCode,
                selectedFolders,
                resourceName: shareInfo.fileName
            })
        });

        if (!response.ok) {
            const error = await response.json();
            toast.error(`创建任务失败: ${error.error}`);
            return;
        }

        const data = await response.json();
        if (data.success) {
            closeFolderSelectModal();
            document.getElementById('taskForm').reset();
            toast.success('任务创建成功');

            // 执行新创建的任务
            const tasks = Array.isArray(data.data) ? data.data : [data.data];
            for (const task of tasks) {
                await executeTask(task.id, false);
            }

            fetchTasks();
        } else {
            throw new Error(data.error || '创建任务失败');
        }
    } catch (error) {
        toast.error('创建任务失败: ' + error.message);
    }
}

// 通知配置相关函数
function showNotificationConfigModal() {
    fetch('/api/config/notification')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const config = data.data;
                // 加载现有配置
                document.getElementById('dingTalkEnabled').checked = config.DINGTALK_ENABLED === 'true' || config.DINGTALK_ENABLED === '1';
                document.getElementById('dingTalkToken').value = config.DINGTALK_WEBHOOK || '';
                document.getElementById('dingTalkSecret').value = config.DINGTALK_SECRET || '';

                document.getElementById('wecomEnabled').checked = config.WECOM_ENABLED === 'true' || config.WECOM_ENABLED === '1';
                document.getElementById('wecomWebhook').value = config.WECOM_WEBHOOK || '';

                document.getElementById('telegramEnabled').checked = config.TELEGRAM_ENABLED === 'true' || config.TELEGRAM_ENABLED === '1';
                document.getElementById('telegramBotToken').value = config.TELEGRAM_BOT_TOKEN || '';
                document.getElementById('telegramChatId').value = config.TELEGRAM_CHAT_ID || '';
                document.getElementById('cfProxyDomain').value = config.CF_PROXY_DOMAIN || '';
                document.getElementById('proxyType').value = config.PROXY_TYPE || '';
                document.getElementById('proxyHost').value = config.PROXY_HOST || '';
                document.getElementById('proxyPort').value = config.PROXY_PORT || '';
                document.getElementById('proxyUsername').value = config.PROXY_USERNAME || '';
                document.getElementById('proxyPassword').value = config.PROXY_PASSWORD || '';

                document.getElementById('wxPusherEnabled').checked = config.WXPUSHER_ENABLED === 'true' || config.WXPUSHER_ENABLED === '1';
                document.getElementById('wxPusherSpt').value = config.WXPUSHER_SPT || '';
            }
        });
    document.getElementById('notificationConfigModal').style.display = 'block';
}

function closeNotificationConfigModal() {
    document.getElementById('notificationConfigModal').style.display = 'none';
}

// 更新记录相关函数
function showUpdateLogsModal() {
    fetch('/api/logs')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const tbody = document.getElementById('updateLogsBody');
                tbody.innerHTML = '';
                data.data.forEach(log => {
                    tbody.innerHTML += `
                        <tr>
                            <td>${new Date(log.createdAt).toLocaleString()}</td>
                            <td>${log.taskId}</td>
                            <td>${log.message}</td>
                        </tr>
                    `;
                });
            }
        });
    document.getElementById('updateLogsModal').style.display = 'block';
}

function closeUpdateLogsModal() {
    document.getElementById('updateLogsModal').style.display = 'none';
}

// 加载通知配置
async function loadNotificationConfig() {
    try {
        const response = await fetch('/api/config/notification');
        const data = await response.json();
        if (data.success) {
            const config = data.data;

            // 钉钉配置
            document.getElementById('dingTalkEnabled').checked = config.DINGTALK_ENABLED === 'true' || config.DINGTALK_ENABLED === '1';
            document.getElementById('dingTalkToken').value = config.DINGTALK_WEBHOOK || '';
            document.getElementById('dingTalkSecret').value = config.DINGTALK_SECRET || '';

            // 企业微信配置
            document.getElementById('wecomEnabled').checked = config.WECOM_ENABLED === 'true' || config.WECOM_ENABLED === '1';
            document.getElementById('wecomWebhook').value = config.WECOM_WEBHOOK || '';

            // Telegram配置
            document.getElementById('telegramEnabled').checked = config.TELEGRAM_ENABLED === 'true' || config.TELEGRAM_ENABLED === '1';
            document.getElementById('telegramBotToken').value = config.TELEGRAM_BOT_TOKEN || '';
            document.getElementById('telegramChatId').value = config.TELEGRAM_CHAT_ID || '';
            document.getElementById('cfProxyDomain').value = config.CF_PROXY_DOMAIN || '';
            document.getElementById('proxyType').value = config.PROXY_TYPE || '';
            document.getElementById('proxyHost').value = config.PROXY_HOST || '';
            document.getElementById('proxyPort').value = config.PROXY_PORT || '';
            document.getElementById('proxyUsername').value = config.PROXY_USERNAME || '';
            document.getElementById('proxyPassword').value = config.PROXY_PASSWORD || '';

            // WxPusher配置
            document.getElementById('wxPusherEnabled').checked = config.WXPUSHER_ENABLED === 'true' || config.WXPUSHER_ENABLED === '1';
            document.getElementById('wxPusherSpt').value = config.WXPUSHER_SPT || '';
        }
    } catch (error) {
        console.error('加载通知配置失败:', error);
        toast.error('加载通知配置失败: ' + error.message);
    }
}

// 保存通知配置
async function saveNotificationConfig(config) {
    try {
        const response = await fetch('/api/config/notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        if (!response.ok) {
            throw new Error('保存失败');
        }

        const data = await response.json();
        if (data.success) {
            console.log('配置保存成功1');
            toast.success('配置保存成功');
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('保存通知配置失败:', error);
        toast.success('保存通知配置失败: ' + error.message);
    }
}

// 加载更新记录
async function loadUpdateLogs() {
    try {
        const response = await fetch('/api/logs');
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || '获取更新记录失败');
        }

        const tbody = document.getElementById('updateLogsBody');
        if (!tbody) {
            throw new Error('找不到更新记录容器');
        }

        tbody.innerHTML = '';

        data.data.forEach(log => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(log.createdAt).toLocaleString()}</td>
                <td>${log.taskId}</td>
                <td class="whitespace-pre-wrap">${log.message}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('加载更新记录失败:', error);
        toast.error(error.message || '加载更新记录失败');
    }
}

// 初始化通知配置表单
function initNotificationConfig() {
    document.getElementById('notificationConfigForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const config = {
            DINGTALK_ENABLED: document.getElementById('dingTalkEnabled').checked ? '1' : '0',
            DINGTALK_WEBHOOK: document.getElementById('dingTalkToken').value,
            DINGTALK_SECRET: document.getElementById('dingTalkSecret').value,

            WECOM_ENABLED: document.getElementById('wecomEnabled').checked ? '1' : '0',
            WECOM_WEBHOOK: document.getElementById('wecomWebhook').value,

            TELEGRAM_ENABLED: document.getElementById('telegramEnabled').checked ? '1' : '0',
            TELEGRAM_BOT_TOKEN: document.getElementById('telegramBotToken').value,
            TELEGRAM_CHAT_ID: document.getElementById('telegramChatId').value,
            CF_PROXY_DOMAIN: document.getElementById('cfProxyDomain').value,
            PROXY_TYPE: document.getElementById('proxyType').value,
            PROXY_HOST: document.getElementById('proxyHost').value,
            PROXY_PORT: document.getElementById('proxyPort').value,
            PROXY_USERNAME: document.getElementById('proxyUsername').value,
            PROXY_PASSWORD: document.getElementById('proxyPassword').value,

            WXPUSHER_ENABLED: document.getElementById('wxPusherEnabled').checked ? '1' : '0',
            WXPUSHER_SPT: document.getElementById('wxPusherSpt').value
        };

        try {
            const response = await fetch('/api/config/notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            if (!response.ok) {
                throw new Error('保存失败');
            }

            const data = await response.json();
            if (data.success) {
                console.log('通知配置保存成功');
                toast.success('通知配置已保存');
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error('保存通知配置失败:', error);
            toast.error('保存通知配置失败: ' + error.message);
        }
    });
}

// 初始化应用
async function initializeApp() {
    // 初始化所有功能
    initTabs();
    initAccountForm();
    initTaskForm();
    initEditTaskForm();
    initViewToggle();
    initNotificationConfig();

    // 初始化目录选择器
    const folderSelector = new FolderSelector({
        onSelect: ({ id, name }) => {
            document.getElementById('targetFolder').value = name;
            document.getElementById('targetFolderId').value = id;
        }
    });

    // 修改目录选择触发方式
    document.getElementById('targetFolder').addEventListener('click', (e) => {
        e.preventDefault();
        const accountId = document.getElementById('accountId').value;
        if (!accountId) {
            toast.error('请先选择账号');
            return;
        }
        folderSelector.show(accountId);
    });

    // 初始化数据
    fetchAccounts();
    fetchTasks();
    loadNotificationConfig();

    // 定时刷新数据
    setInterval(() => {
        fetchAccounts();
        fetchTasks();
    }, 600000);
}

// 处理任务提交
async function handleTaskSubmit(e) {
    e.preventDefault();
    const formData = {
        shareLink: document.getElementById('shareLink').value,
        accessCode: document.getElementById('accessCode').value,
        totalEpisodes: document.getElementById('totalEpisodes').value || null,
        selectedFolders: selectedFolders
    };

    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            toast.success('任务创建成功');
            document.getElementById('taskForm').reset();
            selectedFolders = [];
            document.getElementById('folderSelection').classList.add('hidden');
            await loadTasks();
        } else {
            const error = await response.json();
            throw new Error(error.message || '创建任务失败');
        }
    } catch (error) {
        console.error('创建任务失败:', error);
        toast.error(error.message || '创建任务失败');
    }
}

// 处理编辑任务提交
async function handleEditTaskSubmit(e) {
    e.preventDefault();
    const taskId = document.getElementById('editTaskId').value;
    const epThresholdVal = document.getElementById('editEpisodeThreshold').value;
    const maxKeepVal = document.getElementById('editMaxKeepSaveFile').value;
    const curEpVal = document.getElementById('editCurrentEpisodes').value;

    const formData = {
        resourceName: document.getElementById('editResourceName').value,
        totalEpisodes: document.getElementById('editTotalEpisodes').value || null,
        currentEpisodes: curEpVal === '' ? null : parseInt(curEpVal),
        episodeThreshold: epThresholdVal === '' ? 1000 : parseInt(epThresholdVal),
        episodeRegex: document.getElementById('editEpisodeRegex').value || null,
        episodeUseRegex: document.getElementById('editEpisodeUseRegex').checked ? 1 : 0,
        maxKeepSaveFile: maxKeepVal === '' ? 100 : parseInt(maxKeepVal),
        whitelistKeywords: document.getElementById('editWhitelistKeywords').value || null,
        blacklistKeywords: document.getElementById('editBlacklistKeywords').value || null,
        cronExpression: document.getElementById('editCronExpression').value || null,
        targetFolderId: document.getElementById('editTargetFolderId').value || null,
        targetFolderName: document.getElementById('editTargetFolder').value || null,
        shareFolderId: document.getElementById('shareFolderId').value || null,
        shareFolderName: document.getElementById('shareFolder').value || null,
        shareLink: document.getElementById('editShareLink').value || null,
        accessCode: document.getElementById('editAccessCode').value || null,
        status: document.getElementById('editStatus').value,
        accountId: document.getElementById('editAccountId').value
    };

    console.log('提交的表单数据:', formData);

    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            const result = await response.json();
            console.log('服务器响应:', result);
            toast.success('任务更新成功');
            document.getElementById('editTaskModal').style.display = 'none';
            fetchTasks();
        } else {
            const error = await response.json();
            throw new Error(error.message || '更新任务失败');
        }
    } catch (error) {
        console.error('更新任务失败:', error);
        toast.success(error.message || '更新任务失败');
    }
}

// 加载任务列表
async function loadTasks() {
    try {
        const response = await fetch('/api/tasks');
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || '加载任务列表失败');
        }
        const taskList = document.getElementById('taskList');
        taskList.innerHTML = '';

        data.data.forEach(task => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900">${task.resourceName}</div>
                    <div class="text-xs text-gray-500">${task.targetFolderName || ''}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="badge badge-${task.status}">${getStatusText(task.status)}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900">
                        ${task.currentEpisodes || 0}${task.totalEpisodes ? ` / ${task.totalEpisodes}` : ''}
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <button onclick="showEditTaskModal(${task.id}, '${task.targetFolderId || ''}',
                    ${task.currentEpisodes || 0}, ${task.totalEpisodes || 0}, '${task.status}', 
                    '${task.shareLink}', '${task.accessCode}', '${task.shareFolderId || ''}', '${task.shareFolderName || ''}', '${task.resourceName}', 
                    '${task.targetFolderName || ''}', ${task.episodeThreshold !== undefined ? task.episodeThreshold : 1000}, '${task.episodeRegex || ''}', ${task.episodeUseRegex}, '${task.maxKeepSaveFile}','${task.whitelistKeywords || ''}', 
                    '${task.blacklistKeywords || ''}','${task.cronExpression || ''}', ${task.accountId})" class="btn btn-secondary mr-2">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="showUpdateLogs(${task.id})" class="btn btn-secondary mr-2">
                        <i class="fas fa-history"></i>
                    </button>
                    <button onclick="deleteTask(${task.id})" class="btn btn-danger">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            taskList.appendChild(row);
        });
    } catch (error) {
        console.error('加载任务列表失败:', error);
    }
}

// 显示编辑任务模态框
async function showEditTaskModal(taskId, targetFolderId, currentEpisodes, totalEpisodes, status, shareLink, accessCode, shareFolderId, shareFolderName, resourceName, targetFolderName, episodeThreshold,
    episodeRegex, episodeUseRegex, maxKeepSaveFile, whitelistKeywords, blacklistKeywords, cronExpression, accountId) {

    // 加载账号列表
    try {
        const response = await fetch('/api/accounts');
        const data = await response.json();
        if (data.success) {
            const select = document.getElementById('editAccountId');
            select.innerHTML = '';
            data.data.forEach(account => {
                const option = document.createElement('option');
                option.value = account.id;
                option.textContent = account.username;
                if (account.id == accountId) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('加载账号列表失败:', error);
    }

    document.getElementById('editTaskId').value = taskId;
    document.getElementById('editResourceName').value = resourceName;
    document.getElementById('editTotalEpisodes').value = totalEpisodes || '';
    document.getElementById('editEpisodeThreshold').value = (episodeThreshold !== undefined && episodeThreshold !== null) ? episodeThreshold : 1000;
    document.getElementById('editEpisodeRegex').value = episodeRegex || '';
    document.getElementById('editEpisodeUseRegex').checked = episodeUseRegex === 1;
    document.getElementById('editMaxKeepSaveFile').value = (maxKeepSaveFile !== undefined && maxKeepSaveFile !== null) ? maxKeepSaveFile : 100;
    document.getElementById('editWhitelistKeywords').value = whitelistKeywords || '';
    document.getElementById('editBlacklistKeywords').value = blacklistKeywords || '';
    document.getElementById('editCronExpression').value = cronExpression || '';
    document.getElementById('editStatus').value = status;
    document.getElementById('shareFolder').value = shareFolderName || '';
    document.getElementById('shareFolderId').value = shareFolderId || '';
    document.getElementById('editShareLink').value = shareLink || '';
    document.getElementById('editAccessCode').value = accessCode || '';
    document.getElementById('editTargetFolder').value = targetFolderName || '';
    document.getElementById('editTargetFolderId').value = targetFolderId || '';
    document.getElementById('editCurrentEpisodes').value = (currentEpisodes !== undefined && currentEpisodes !== null) ? currentEpisodes : 0;

    document.getElementById('editTaskModal').style.display = 'block';
}

// 显示更新日志
async function showUpdateLogs(taskId) {
    try {
        const response = await fetch(`/api/logs/${taskId}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || '获取更新记录失败');
        }

        const tbody = document.getElementById('updateLogsBody');
        if (!tbody) {
            throw new Error('找不到更新记录容器');
        }

        tbody.innerHTML = '';

        data.data.forEach(log => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(log.createdAt).toLocaleString()}</td>
                <td>${log.taskId}</td>
                <td class="whitespace-pre-wrap">${log.message}</td>
            `;
            tbody.appendChild(row);
        });

        const modal = document.getElementById('updateLogsModal');
        if (!modal) {
            throw new Error('找不到更新记录弹框');
        }
        modal.style.display = 'block';
    } catch (error) {
        console.error('加载更新日志失败:', error);
        toast.error(error.message || '加载更新日志失败');
    }
}

// 删除任务
async function deleteTask(taskId) {
    if (!confirm('确定要删除此任务吗？')) return;

    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            toast.success('任务删除成功');
            fetchTasks();
        } else {
            toast.success('删除任务失败');
        }
    } catch (error) {
        console.error('删除任务失败:', error);
        toast.success('删除任务失败');
    }
}

// 获取状态文本
function getStatusText(status) {
    const statusMap = {
        'pending': '待处理',
        'processing': '处理中',
        'completed': '已完成',
        'failed': '失败'
    };
    return statusMap[status] || status;
}

// 处理文件夹选择
async function handleFolderSelection(shareLink, accessCode) {
    try {
        const accountId = document.getElementById('accountId').value;
        if (!accountId) {
            toast.error('请先选择账号');
            return;
        }

        const response = await fetch(`/api/folders/${accountId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shareLink, accessCode })
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || '获取文件夹列表失败');
        }

        const folders = data.data;
        const tbody = document.getElementById('folderListBody');
        if (!tbody) {
            throw new Error('找不到目录列表容器');
        }

        tbody.innerHTML = `
            <tr>
                <td><input type="checkbox" class="folder-checkbox" data-id="root" data-name="根目录"></td>
                <td>根目录</td>
            </tr>
        `;

        folders.forEach(folder => {
            tbody.innerHTML += `
                <tr>
                    <td><input type="checkbox" class="folder-checkbox" data-id="${folder.id}" data-name="${folder.name}"></td>
                    <td>${folder.name}</td>
                </tr>
            `;
        });

        const modal = document.getElementById('folderSelectModal');
        if (!modal) {
            throw new Error('找不到选择弹框');
        }
        modal.style.display = 'block';

        // 添加文件夹选择事件监听
        document.querySelectorAll('.folder-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    selectedFolders.push(checkbox.dataset.id);
                } else {
                    selectedFolders = selectedFolders.filter(id => id !== checkbox.dataset.id);
                }
            });
        });
    } catch (error) {
        console.error('获取文件夹列表失败:', error);
        toast.error(error.message || '获取文件夹列表失败');
    }
}

// 移除分享链接输入的自动触发
document.getElementById('shareLink').addEventListener('input', async function () {
    const shareLink = this.value;
    if (shareLink) {
        document.getElementById('folderSelection').classList.remove('hidden');
    } else {
        document.getElementById('folderSelection').classList.add('hidden');
        selectedFolders = [];
    }
});

// 初始化编辑任务表单
function initEditTaskForm() {
    const editForm = document.getElementById('editTaskForm');
    if (editForm) {
        editForm.addEventListener('submit', handleEditTaskSubmit);
    }

    // 初始化源目录选择器
    const shareFolderSelector = new ShareFolderSelector({
        onSelect: ({ id, name }) => {
            document.getElementById('shareFolder').value = name;
            document.getElementById('shareFolderId').value = id;
            document.getElementById('shareFolderSelectorModal').style.display = 'none';
        }
    });

    // 初始化更新目录选择器
    const targetFolderSelector = new FolderSelector({
        onSelect: ({ id, name }) => {
            document.getElementById('editTargetFolder').value = name;
            document.getElementById('editTargetFolderId').value = id;
        }
    });

    // 源目录选择触发
    const shareFolder = document.getElementById('shareFolder');
    const treeSelect = document.querySelector('.tree-select');
    if (shareFolder) {
        shareFolder.addEventListener('click', async (e) => {
            e.preventDefault();
            const taskId = document.getElementById('editTaskId').value;
            const accountId = document.getElementById('editAccountId').value;
            const shareLink = document.getElementById('editShareLink').value;
            const accessCode = document.getElementById('editAccessCode').value;
            if (!accountId) {
                toast.error('请先选择账号');
                return;
            }
            if (!taskId) {
                toast.error('任务ID不存在--');
                return;
            }
            if (!shareLink) {
                toast.error('分享链接不存在');
                return;
            }
            await shareFolderSelector.show(taskId, accountId, shareLink, accessCode);
        });
    }

    // 添加 tree-select 点击事件
    if (treeSelect) {
        treeSelect.addEventListener('click', async (e) => {
            e.preventDefault();
            const taskId = document.getElementById('editTaskId').value;
            const accountId = document.getElementById('editAccountId').value;
            const shareLink = document.getElementById('editShareLink').value;
            const accessCode = document.getElementById('editAccessCode').value;
            if (!accountId) {
                toast.error('请先选择账号');
                return;
            }
            if (!taskId) {
                toast.error('任务ID不存在');
                return;
            }
            if (!shareLink) {
                toast.error('分享链接不存在');
                return;
            }
            await shareFolderSelector.show(taskId, accountId, shareLink);
        });
    }

    // 更新目录选择触发
    const editTargetFolder = document.getElementById('editTargetFolder');
    if (editTargetFolder) {
        editTargetFolder.addEventListener('click', (e) => {
            e.preventDefault();
            const accountId = document.getElementById('editAccountId').value;
            if (!accountId) {
                toast.error('请先选择账号');
                return;
            }
            targetFolderSelector.show(accountId);
        });
    }

    // 监听分享链接变化
    const editShareLink = document.getElementById('editShareLink');
    if (editShareLink) {
        editShareLink.addEventListener('change', () => {
            // 清空已选择的源目录
            document.getElementById('shareFolder').value = '';
            document.getElementById('shareFolderId').value = '';
            // document.getElementById('shareFolderAccessCode').value = '';
        });
    }
}



// 分享目录选择器类
class ShareFolderSelector {
    constructor({ onSelect }) {
        this.onSelect = onSelect;
        this.selectedFolder = null;

        // 创建模态框
        const modal = document.createElement('div');
        modal.id = 'shareFolderSelectorModal';
        modal.className = 'modal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>选择分享目录</h3>
                    <button type="button" class="close" onclick="document.getElementById('shareFolderSelectorModal').style.display='none'">×</button>
                </div>
                <div class="modal-body">
                    <!--div class="form-group mb-4">
                        <label>访问码</label>
                        <input type="text" id="shareFolderAccessCode" class="form-control" placeholder="如果需要访问码,请在此输入">
                    </div-->
                    <div class="table-container">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th width="80">选择</th>
                                    <th>目录名称</th>
                                </tr>
                            </thead>
                            <tbody id="shareFolderListBody">
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('shareFolderSelectorModal').style.display='none'">取消</button>
                    <button type="button" class="btn btn-primary confirm-btn">确定</button>
                </div>
            </div>
        `;

        // 如果已存在则移除
        const existingModal = document.getElementById('shareFolderSelectorModal');
        if (existingModal) {
            existingModal.remove();
        }

        // 添加到 body
        document.body.appendChild(modal);

        // 添加确定按钮点击事件
        const confirmBtn = modal.querySelector('.confirm-btn');
        confirmBtn.onclick = () => {
            if (this.selectedFolder) {
                this.onSelect(this.selectedFolder);
                modal.style.display = 'none';
            } else {
                toast.error('请选择一个目录');
            }
        };
    }

    async show(taskId, accountId, shareLink, accessCode) {
        try {
            // const accessCode = document.getElementById('shareFolderAccessCode')?.value || '';

            if (!shareLink) {
                throw new Error('分享链接不存在');
            }

            const response = await fetch(`/api/folders/${accountId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shareLink, accessCode })
            });

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || '获取分享目录失败');
            }

            const tbody = document.getElementById('shareFolderListBody');
            if (!tbody) {
                throw new Error('找不到目录列表容器');
            }

            tbody.innerHTML = '';

            // 添加根目录选项
            const rootRow = document.createElement('tr');
            rootRow.className = 'folder-item';
            rootRow.innerHTML = `
                <td>
                    <input type="radio" name="shareFolder" class="form-radio" value="root">
                </td>
                <td>
                    <i class="fas fa-folder text-yellow-500 mr-2"></i>
                    根目录
                </td>
            `;
            rootRow.addEventListener('click', () => {
                tbody.querySelectorAll('tr').forEach(tr => tr.classList.remove('selected-folder'));
                rootRow.classList.add('selected-folder');
                rootRow.querySelector('input[type="radio"]').checked = true;
                this.selectedFolder = { id: 'root', name: '根目录' };
            });
            tbody.appendChild(rootRow);

            // 添加子目录选项
            data.data.forEach(folder => {
                const row = document.createElement('tr');
                row.className = 'folder-item';
                row.innerHTML = `
                    <td>
                        <input type="radio" name="shareFolder" class="form-radio" value="${folder.id}">
                    </td>
                    <td>
                        <i class="fas fa-folder text-yellow-500 mr-2"></i>
                        ${folder.name}
                    </td>
                `;
                row.addEventListener('click', () => {
                    tbody.querySelectorAll('tr').forEach(tr => tr.classList.remove('selected-folder'));
                    row.classList.add('selected-folder');
                    row.querySelector('input[type="radio"]').checked = true;
                    this.selectedFolder = folder;
                });
                tbody.appendChild(row);
            });

            // 显示弹框
            const modal = document.getElementById('shareFolderSelectorModal');
            if (modal) {
                // 重置选中状态
                this.selectedFolder = null;
                modal.style.display = 'block';
            } else {
                throw new Error('找不到弹框元素');
            }
        } catch (error) {
            console.error('获取分享目录失败:', error);
            toast.error(error.message || '获取分享目录失败');
        }
    }
}

// 检查登录状态
async function checkLogin() {
    try {
        const response = await fetch('/api/auth/check');
        if (!response.ok) {
            window.location.href = '/login.html';
            return;
        }
        const data = await response.json();
        if (!data.success) {
            window.location.href = '/login.html';
        }
    } catch (error) {
        toast.error('检查登录状态失败: ' + error.message);
        window.location.href = '/login.html';
    }
}

// 登出函数
async function logout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST'
        });
        const data = await response.json();
        if (data.success) {
            window.location.href = '/login.html';
        } else {
            toast.error('登出失败');
        }
    } catch (error) {
        toast.error('登出失败: ' + error.message);
    }
}