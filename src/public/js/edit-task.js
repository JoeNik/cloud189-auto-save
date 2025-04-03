// 修改任务相关功能
let shareFolderSelector = new FolderSelector({
    apiUrl: "/api/share/folders",
    onSelect: ({ id, name }) => {
        document.getElementById('shareFolder').value = name;
        document.getElementById('shareFolderId').value = id;
    },
    buildParams: (accountId, folderId) => {
        const taskId = document.getElementById('editTaskId').value;
        return `${accountId}?folderId=${folderId}&taskId=${taskId}`;
    }
});

let editFolderSelector = new FolderSelector({
    onSelect: ({ id, name }) => {
        console.log(2222,id,name);
        document.getElementById('editTargetFolder').value = name;
        document.getElementById('editTargetFolderId').value = id;
    }
});

function showEditTaskModal(id, targetFolderId, currentEpisodes, totalEpisodes, status, shareLink, accessCode, shareFolderId, shareFolderName, resourceName, targetFolderName, episodeThreshold, episodeRegex, whitelistKeywords, blacklistKeywords) {
    document.getElementById('editTaskId').value = id;
    document.getElementById('editResourceName').value = resourceName;
    document.getElementById('editTargetFolder').value = targetFolderName?targetFolderName:targetFolderId;
    document.getElementById('editTargetFolderId').value = targetFolderId;
    document.getElementById('editCurrentEpisodes').value = currentEpisodes;
    document.getElementById('editTotalEpisodes').value = totalEpisodes;
    document.getElementById('editEpisodeThreshold').value = episodeThreshold || '';
    document.getElementById('editEpisodeRegex').value = episodeRegex || '';
    document.getElementById('editWhitelistKeywords').value = whitelistKeywords || '';
    document.getElementById('editBlacklistKeywords').value = blacklistKeywords || '';
    document.getElementById('editStatus').value = status;
    document.getElementById('shareLink').value = shareLink;
    document.getElementById('editAccessCode').value = accessCode || '';
    document.getElementById('shareFolder').value = shareFolderName;
    document.getElementById('shareFolderId').value = shareFolderId;
    document.getElementById('editTaskModal').style.display = 'block';
}

function closeEditTaskModal() {
    document.getElementById('editTaskModal').style.display = 'none';
}

function initEditTaskForm() {
    document.getElementById('shareFolder').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('shareFolderSelect').style.display = 'block';
        loadShareFolders();
    });

    document.getElementById('closeShareFolderSelect').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('shareFolderSelect').style.display = 'none';
    });

    document.getElementById('editTaskForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('editTaskId').value;
        const resourceName = document.getElementById('editResourceName').value;
        const targetFolderId = document.getElementById('editTargetFolderId').value;
        const targetFolderName = document.getElementById('editTargetFolderName').value;
        const currentEpisodes = document.getElementById('editCurrentEpisodes').value;
        const totalEpisodes = document.getElementById('editTotalEpisodes').value;
        const status = document.getElementById('editStatus').value;
        const shareFolderName = document.getElementById('editShareFolderName').value;
        const shareFolderId = document.getElementById('editShareFolderId').value;
        const episodeThreshold = document.getElementById('editEpisodeThreshold').value;
        const episodeRegex = document.getElementById('editEpisodeRegex').value;
        const whitelistKeywords = document.getElementById('editWhitelistKeywords').value;
        const blacklistKeywords = document.getElementById('editBlacklistKeywords').value;

        try {
            const response = await fetch(`/api/tasks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resourceName,
                    targetFolderId,
                    currentEpisodes: parseInt(currentEpisodes),
                    totalEpisodes: parseInt(totalEpisodes),
                    episodeThreshold: episodeThreshold ? parseInt(episodeThreshold) : null,
                    episodeRegex: episodeRegex || null,
                    whitelistKeywords: whitelistKeywords || null,
                    blacklistKeywords: blacklistKeywords || null,
                    status,
                    shareFolderName,
                    shareFolderId,
                    targetFolderName
                })
            });

            if (response.ok) {
                closeEditTaskModal();
                await fetchTasks();
                toast.success('任务修改成功');
            } else {
                const error = await response.json();
                toast.error(error.message || '修改任务失败');
            }
        } catch (error) {
            toast.error('修改任务失败：' + error.message);
        }
    });
}

// 加载分享文件夹列表
async function loadShareFolders() {
    const taskId = document.getElementById('editTaskId').value;
    const accountId = document.getElementById('editAccountId').value;
    
    if (!taskId || !accountId) {
        toast.error('任务ID或账号ID不存在');
        return;
    }

    try {
        const response = await fetch(`/api/share/folders/${accountId}?taskId=${taskId}&folderId=-11`);
        const data = await response.json();
        
        if (data.success) {
            const selectElement = document.getElementById('shareFolderOptions');
            selectElement.innerHTML = '';
            
            data.data.forEach(folder => {
                const option = document.createElement('option');
                option.value = folder.id;
                option.textContent = folder.name;
                selectElement.appendChild(option);
            });
            
            document.getElementById('shareFolderTreeContainer').style.display = 'block';
        } else {
            toast.error('加载文件夹列表失败');
        }
    } catch (error) {
        toast.error('加载文件夹列表失败: ' + error.message);
    }
}