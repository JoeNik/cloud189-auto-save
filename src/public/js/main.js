// 主入口文件
document.addEventListener('DOMContentLoaded', () => {
    // 初始化所有功能
    initTabs();
    initAccountForm();
    initTaskForm();
    initEditTaskForm();
    initViewToggle();

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
            alert('请先选择账号');
            return;
        }
        folderSelector.show(accountId);
    });

    // 初始化数据
    fetchAccounts();
    fetchTasks();

    // 定时刷新数据
    setInterval(() => {
        fetchAccounts();
        fetchTasks();
    }, 30000);
});

// 全局变量
let pendingFolders = [];
let shareInfo = null;

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
        alert('请至少选择一个文件夹');
        return;
    }

    const accountId = document.getElementById('accountId').value;
    const shareLink = document.getElementById('shareLink').value;
    const totalEpisodes = document.getElementById('totalEpisodes').value;
    const targetFolderId = document.getElementById('targetFolderId').value;
    const accessCode = document.getElementById('accessCode').value;

    try {
        for (const folder of selectedFolders) {
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accountId,
                    shareLink,
                    totalEpisodes,
                    targetFolderId,
                    accessCode,
                    shareFolderId: folder.id,
                    shareFolderName: folder.name,
                    resourceName: shareInfo.fileName
                })
            });

            if (!response.ok) {
                const error = await response.json();
                alert(`创建任务失败: ${error.error}`);
                return;
            }
        }
        closeFolderSelectModal();
        alert('任务创建成功');
        fetchTasks();
    } catch (error) {
        alert('创建任务失败: ' + error.message);
    }
}

// 通知配置相关函数
function showNotificationConfigModal() {
    fetch('/api/config/notification')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                document.getElementById('dingTalkToken').value = data.data.DINGTALK_TOKEN || '';
                document.getElementById('dingTalkSecret').value = data.data.DINGTALK_SECRET || '';
            }
        });
    document.getElementById('notificationConfigModal').style.display = 'block';
}

function closeNotificationConfigModal() {
    document.getElementById('notificationConfigModal').style.display = 'none';
}

// 更新记录相关函数
function showUpdateLogsModal() {
    fetch('/api/logs/updates')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const tbody = document.getElementById('updateLogsBody');
                tbody.innerHTML = '';
                data.data.forEach(log => {
                    tbody.innerHTML += `
                        <tr>
                            <td>${new Date(log.timestamp).toLocaleString()}</td>
                            <td>${log.taskName}</td>
                            <td>${log.content}</td>
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

// 初始化表单事件监听
document.addEventListener('DOMContentLoaded', function() {
    // 通知配置表单提交
    document.getElementById('notificationConfigForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = document.getElementById('dingTalkToken').value;
        const secret = document.getElementById('dingTalkSecret').value;

        try {
            const response = await fetch('/api/config/notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    DINGTALK_TOKEN: token,
                    DINGTALK_SECRET: secret
                })
            });

            if (response.ok) {
                alert('配置保存成功');
                closeNotificationConfigModal();
            } else {
                const error = await response.json();
                alert('保存失败: ' + error.error);
            }
        } catch (error) {
            alert('保存失败: ' + error.message);
        }
    });
});