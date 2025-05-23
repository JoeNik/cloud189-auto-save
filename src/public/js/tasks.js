// 任务相关功能
function createProgressRing(current, total) {
    if (!total) return '';
    
    const radius = 12;
    const circumference = 2 * Math.PI * radius;
    const progress = (current / total) * 100;
    const offset = circumference - (progress / 100) * circumference;
    const percentage = Math.round((current / total) * 100);
    
    return `
        <div class="progress-ring">
            <svg width="30" height="30">
                <circle
                    stroke="#e8f5e9"
                    stroke-width="3"
                    fill="transparent"
                    r="${radius}"
                    cx="15"
                    cy="15"
                />
                <circle
                    stroke="#52c41a"
                    stroke-width="3"
                    fill="transparent"
                    r="${radius}"
                    cx="15"
                    cy="15"
                    style="stroke-dasharray: ${circumference} ${circumference}; stroke-dashoffset: ${offset}"
                />
            </svg>
            <span class="progress-ring__text">${percentage}%</span>
        </div>
    `;
}

var taskList = []
// 从taskList中获取任务
function getTaskById(id) {
    return taskList.find(task => task.id == id);
}
async function fetchTasks() {
    taskList = []
    const response = await fetch('/api/tasks');
    const data = await response.json();
    if (data.success) {
        const tbody = document.querySelector('#taskTable tbody');
        tbody.innerHTML = '';
        data.data.forEach(task => {
            taskList.push(task)
            const progressRing = task.totalEpisodes ? createProgressRing(task.currentEpisodes || 0, task.totalEpisodes) : '';
            tbody.innerHTML += `
                <tr>
                    <td>
                        <button class="btn-warning" onclick="deleteTask(${task.id})">删除</button>
                        <button onclick="executeTask(${task.id})">执行</button>
                        <button onclick="showEditTaskModal(${task.id}, '${task.targetFolderId || ''}',
                         ${task.currentEpisodes || 0}, ${task.totalEpisodes || 0}, 
                         '${task.status}','${task.shareLink}', '${task.accessCode}', '${task.shareFolderId}','${task.shareFolderName}', '${task.resourceName}', '${task.targetFolderName}', 
                         ${task.episodeThreshold || 1000}, '${task.episodeRegex || ''}', ${task.episodeUseRegex},'${task.maxKeepSaveFile}', '${task.whitelistKeywords || ''}', '${task.blacklistKeywords || ''}', '${task.cronExpression || ''}')">修改</button>
                    </td>
                    <td data-label="资源名称"><a href="${task.shareLink}" target="_blank" class='ellipsis' title="${task.shareFolderName ? (task.resourceName + '/' + task.shareFolderName) : task.resourceName || '未知'}">${task.shareFolderName?(task.resourceName + '/' + task.shareFolderName): task.resourceName || '未知'}</a></td>
                    <td data-label="账号ID">${task.accountId}</td>
                    <td data-label="首次保存目录"><a href="https://cloud.189.cn/web/main/file/folder/${task.targetFolderId}" target="_blank">${task.targetFolderId}</a></td>
                    <td data-label="更新目录"><a href="javascript:void(0)" onclick="showFileListModal('${task.id}')">${task.targetFolderName || task.targetFolderId}</a></td>
                    <td data-label="截止集数">${task.episodeThreshold || 0}</td>
                    <td data-label="更新数/总数">${task.currentEpisodes || 0}/${task.totalEpisodes || '未知'}${progressRing}</td>
                    <td data-label="定时任务">${task.cronExpression || '默认'}</td>
                    <td data-label="使用正则匹配">${task.episodeUseRegex == 1 ? '是':'否'}</td>
                    <td data-label="状态"><span class="status-badge status-${task.status}">${task.status}</span></td>
                </tr>
            `;
        });
    }
}

 // 删除任务
 async function deleteTask(id) {
    if (!confirm('确定要删除这个任务吗？')) return;

    const response = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE'
    });

    const data = await response.json();
    if (data.success) {
        toast.success('任务删除成功');
        fetchTasks();
    } else {
        toast.error('任务删除失败: ' + data.error);
    }
}


async function executeTask(id, refresh = true) {
    const executeBtn = document.querySelector(`button[onclick="executeTask(${id})"]`);
    if (executeBtn) {
        executeBtn.classList.add('loading');
        executeBtn.disabled = true;
    }
    try {
        const response = await fetch(`/api/tasks/${id}/execute`, {
            method: 'POST'
        });
        if (response.ok) {
            refresh && toast.success('任务执行完成');
            refresh && fetchTasks();
        } else {
            toast.error('任务执行失败');
        }
    } catch (error) {
        toast.error('任务执行失败: ' + error.message);
    } finally {
        if (executeBtn) {
            executeBtn.classList.remove('loading');
            executeBtn.disabled = false;
        }
    }
}

// 初始化任务表单
function initTaskForm() {
    document.getElementById('taskForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
    
        try {
            const accountId = document.getElementById('accountId').value;
            const shareLink = document.getElementById('shareLink').value;
            const totalEpisodes = document.getElementById('totalEpisodes').value;
            const targetFolderId = document.getElementById('targetFolderId').value;
            const accessCode = document.getElementById('accessCode').value;
    
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId, shareLink, totalEpisodes, targetFolderId, accessCode })
            });
    
            const data = await response.json();
            if (data.success) {
                if (data.needFolderSelection) {
                    // 显示文件夹选择弹窗
                    showFolderSelectModal(data.folders, data.shareInfo);
                } else {
                    document.getElementById('taskForm').reset();
                    const ids = Array.isArray(data.data) ? data.data.map(item => item.id) : [data.data.id];
                    await Promise.all(ids.map(id => executeTask(id, false)));
                    toast.success('任务执行完成');
                    fetchTasks();
                }
            } else {
                toast.error('任务创建失败: ' + data.error);
            }
        } catch (error) {
            toast.error('任务创建失败: ' + error.message);
        } finally {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    });
}


var chooseTask = undefined
// 文件列表弹窗
async function showFileListModal(taskId) {
    chooseTask = getTaskById(taskId);
    const accountId = chooseTask.accountId;
    const folderId = chooseTask.targetFolderId;
    // 创建弹窗
    const modal = document.createElement('div');
    modal.className = 'modal files-list-modal'; 
    modal.innerHTML = `
        <div class="modal-content" style="width: 80%; max-width: 1000px;">
            <h2>文件列表</h2>
            <button class="batch-rename-btn" onclick="showBatchRenameOptions()">批量重命名</button>
            <div style="max-height: 40vh; overflow-y: auto;">
            <table>
                <thead>
                    <tr>
                        <th><input type="checkbox" id="selectAll" onclick="toggleSelectAll()"></th>
                        <th>文件名</th>
                        <th>大小</th>
                        <th>修改时间</th>
                    </tr>
                </thead>
                <tbody id="fileListBody"></tbody>
            </table>
            </div>
            <div class="modal-footer">
                <button onclick="closeFileListModal()">关闭</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    // 获取文件列表
    try {
        const response = await fetch(`/api/folder/files?accountId=${accountId}&folderId=${folderId}`);
        const data = await response.json();
        if (data.success) {
            const tbody = document.getElementById('fileListBody');
            data.data.forEach(file => {
                tbody.innerHTML += `
                    <tr>
                        <td><input type="checkbox" class="file-checkbox" data-filename="${file.name}" data-id="${file.id}"></td>
                        <td>${file.name}</td>
                        <td>${formatFileSize(file.size)}</td>
                        <td>${file.createDate}</td>
                    </tr>
                `;
            });
        }
    } catch (error) {
        toast.error('获取文件列表失败：' + error.message);
    }
}
// 显示批量重命名选项
function showBatchRenameOptions() {
    const sourceRegex = escapeHtmlAttr(chooseTask.sourceRegex)?? ''
    const targetRegex = escapeHtmlAttr(chooseTask.targetRegex)?? ''
    const selectedFiles = Array.from(document.querySelectorAll('.file-checkbox:checked')).map(cb => cb.dataset.filename);
    if (selectedFiles.length === 0) {
        toast.error('请选择要重命名的文件');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal rename-options-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>批量重命名</h3>
            <div class="rename-type-selector">
                <label class="radio-label">
                    <input type="radio" name="renameType" value="regex" checked>
                    正则表达式重命名
                </label>
                <label class="radio-label">
                    <input type="radio" name="renameType" value="sequential">
                    顺序重命名
                </label>
            </div>
            <div id="renameDescription" class="rename-description">
                正则表达式文件重命名。在第一行输入源文件名正则表达式，并在第二行输入新文件名正则表达式。
            </div>
            <div id="regexInputs" class="rename-inputs">
                <div class="form-group">
                    <input type="text" id="sourceRegex" class="form-input" placeholder="源文件名正则表达式" value="${sourceRegex}">
                </div>
                <div class="form-group">
                    <input type="text" id="targetRegex" class="form-input" placeholder="新文件名正则表达式" value="${targetRegex}">
                </div>
            </div>
            <div id="sequentialInputs" class="rename-inputs" style="display: none;">
                <div class="form-group">
                    <input type="text" id="newNameFormat" class="form-input" placeholder="新文件名格式">
                </div>
                <div class="form-group">
                    <input type="number" id="startNumber" class="form-input" value="" min="1" placeholder="起始序号">
                </div>
            </div>
            <div class="form-actions">
                <button class="saveAndAutoUpdate btn-warning" onclick="previewRename(true)">确定并自动更新</button>
                <button class="btn-default" onclick="closeRenameOptionsModal()">取消</button>
                <button class="btn-primary" onclick="previewRename(false)">确定</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';

    // 添加单选框切换事件
    const radioButtons = modal.querySelectorAll('input[name="renameType"]');
    const description = modal.querySelector('#renameDescription');
    const regexInputs = modal.querySelector('#regexInputs');
    const sequentialInputs = modal.querySelector('#sequentialInputs')
    modal.querySelector('.modal-content').style.height = '40%';

    radioButtons.forEach(radio => {
        radio.addEventListener('change', (e) => {
            modal.querySelector('.saveAndAutoUpdate').style.display = 'none';
            if (e.target.value === 'regex') {
                description.textContent = '正则表达式文件重命名。 在第一行输入源文件名正则表达式，并在第二行输入新文件名正则表达式。如果新旧名称相同, 则跳过该文件。';
                regexInputs.style.display = 'block';
                sequentialInputs.style.display = 'none';
                modal.querySelector('.saveAndAutoUpdate').style.display = 'block';
            } else {
                description.textContent = '新文件名将有一个数值起始值附加到它， 并且它将通过向起始值添加 1 来按顺序显示。 在第一行输入新的文件名，并在第二行输入起始值。';
                regexInputs.style.display = 'none';
                sequentialInputs.style.display = 'block';
            }
        });
    });
}

// 预览重命名
async function previewRename(autoUpdate = false) {
    const selectedFiles = Array.from(document.querySelectorAll('.file-checkbox:checked')).map(cb => cb.dataset.filename);
    const renameType = document.querySelector('input[name="renameType"]:checked').value;
    let newNames = [];

    if (renameType === 'regex') {
        const sourceRegex = escapeRegExp(document.getElementById('sourceRegex').value);
        const targetRegex = escapeRegExp(document.getElementById('targetRegex').value);
        newNames = selectedFiles
            .map(filename => {
                const checkbox = document.querySelector(`.file-checkbox[data-filename="${filename}"]`);
                try {
                    const destFileName = filename.replace(new RegExp(sourceRegex), targetRegex);
                    // 如果文件名没有变化，说明没有匹配成功
                    return destFileName !== filename ? {
                        fileId: checkbox.dataset.id,
                        oldName: filename,
                        destFileName
                    } : null;
                } catch (e) {
                    return null;
                }
            })
            .filter(Boolean);
    } else {
        const nameFormat = document.getElementById('newNameFormat').value;
        const startNum = parseInt(document.getElementById('startNumber').value);
        const padLength = document.getElementById('startNumber').value.length;
        
        newNames = selectedFiles.map((filename, index) => {
            const checkbox = document.querySelector(`.file-checkbox[data-filename="${filename}"]`);
            const ext = filename.split('.').pop();
            const num = (startNum + index).toString().padStart(padLength, '0');
            return {
                fileId: checkbox.dataset.id,
                oldName: filename,
                destFileName: `${nameFormat}${num}.${ext}`
            };
        });
        autoUpdate = false
    }
    showRenamePreview(newNames, autoUpdate);
}

function showRenamePreview(newNames, autoUpdate) {
    const modal = document.createElement('div');
    modal.className = 'modal preview-rename-modal';
    modal.innerHTML = `
        <div class="modal-content" style="width: 80%; max-width: 1000px;">
            <h3>重命名预览</h3>
            <div class="preview-container" style="max-height: 40vh; overflow-y: auto;">
                <table>
                    <thead>
                        <tr>
                            <th tyle="width: 400px;">原文件名</th>
                            <th tyle="width: 400px;">新文件名</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${newNames.map(file => `
                            <tr data-file-id="${file.fileId}">
                                <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.oldName}</td>
                                <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.destFileName}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="form-actions">
                <button onclick="submitRename(${autoUpdate})">确定</button>
                <button onclick="backToRenameOptions()">返回</button>
                <button onclick="closeRenamePreviewModal()">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function backToRenameOptions() {
    closeRenamePreviewModal();
}

async function submitRename(autoUpdate) {
    const files = Array.from(document.querySelectorAll('.preview-rename-modal tr[data-file-id]')).map(row => ({
        fileId: row.dataset.fileId,
        destFileName: row.querySelector('td:last-child').textContent
    }));
    if (files.length == 0) {
        toast.error('没有需要重命名的文件');
        return
    }
    if (autoUpdate) {
        if (!confirm('当前选择的是自动更新, 请确认正则表达式是否正确, 否则后续的文件可能无法正确重命名')){
            return;
        }
    }
    const accountId = chooseTask.accountId;
    const taskId = chooseTask.id;
    const sourceRegex = autoUpdate ? escapeRegExp(document.getElementById('sourceRegex').value): null;
    const targetRegex = autoUpdate ? escapeRegExp(document.getElementById('targetRegex').value): null;
    try {
        const response = await fetch('/api/files/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId, accountId, files, sourceRegex, targetRegex })
        });
        const data = await response.json();
        if (data.success) {
            if (data.data && data.data.length > 0) {
                toast.warning('部分文件重命名失败:'+ data.data.join(', '));
            }else{
                toast.success('重命名成功');
            }
            closeRenamePreviewModal();
            closeRenameOptionsModal();
            closeFileListModal()
            chooseTask.sourceRegex = sourceRegex;
            chooseTask.targetRegex = targetRegex;
            // 刷新文件列表
            showFileListModal(taskId);
        } else {
            toast.error('重命名失败: ' + data.error);
        }
    } catch (error) {
        toast.error('重命名失败: ' + error.message);
    }
}
// 辅助函数
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('.file-checkbox');
    const selectAll = document.getElementById('selectAll');
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
}

// 修改关闭弹窗函数
function closeFileListModal() {
    const modal = document.querySelector('.files-list-modal');
    modal?.remove();
}

function closeRenameOptionsModal() {
    const modal = document.querySelector('.rename-options-modal');
    modal?.remove();
}

function closeRenameModal() {
    const modal = document.querySelector('.regex-rename-modal, .sequential-rename-modal');
    modal?.remove();
}

function closeRenamePreviewModal() {
    const modal = document.querySelector('.preview-rename-modal');
    modal?.remove();
}

// 处理反斜杠
function escapeRegExp(regexStr) {
    return regexStr?regexStr.replace(/\\\\/g, '\\'):'';
}

// 转义HTML属性中的特殊字符
function escapeHtmlAttr(str) {
    if (!str) return '';
    return str
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}