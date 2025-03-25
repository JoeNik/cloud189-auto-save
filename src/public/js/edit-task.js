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

function showEditTaskModal(id, targetFolderId, currentEpisodes, totalEpisodes, status, shareLink, shareFolderId, shareFolderName, resourceName, targetFolderName, episodeThreshold, episodeRegex, whitelistKeywords, blacklistKeywords) {
    document.getElementById('editTaskId').value = id;
    document.getElementById('editResourceName').value = resourceName;
    console.log(1111,targetFolderName,targetFolderId);
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
        const accountId = document.getElementById('accountId').value;
        if (!accountId) {
            alert('请先选择账号');
            return;
        }
        shareFolderSelector.show(accountId);
    });

    // 更新目录也改为点击触发
    document.getElementById('editTargetFolder').addEventListener('click', (e) => {
        e.preventDefault();
        const accountId = document.getElementById('accountId').value;
        if (!accountId) {
            alert('请先选择账号');
            return;
        }
        editFolderSelector.show(accountId);
    });

    document.getElementById('editTaskForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editTaskId').value;
        const resourceName = document.getElementById('editResourceName').value;
        const targetFolderId = document.getElementById('editTargetFolderId').value;
        const targetFolderName = document.getElementById('editTargetFolder').value;
        const currentEpisodes = document.getElementById('editCurrentEpisodes').value;
        const totalEpisodes = document.getElementById('editTotalEpisodes').value;
        const episodeThreshold = document.getElementById('editEpisodeThreshold').value;
        const episodeRegex = document.getElementById('editEpisodeRegex').value;
        const whitelistKeywords = document.getElementById('editWhitelistKeywords').value;
        const blacklistKeywords = document.getElementById('editBlacklistKeywords').value;
        const shareFolderName = document.getElementById('shareFolder').value;
        const shareFolderId = document.getElementById('shareFolderId').value;
        const status = document.getElementById('editStatus').value;
        console.log(333,targetFolderName,shareFolderName);

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
            } else {
                const error = await response.json();
                alert(error.message || '修改任务失败');
            }
        } catch (error) {
            alert('修改任务失败：' + error.message);
        }
    });
}