// 账号相关功能
async function fetchAccounts() {
    try {
        const response = await fetch('/api/accounts');
        const data = await response.json();
        if (data.success) {
            const tbody = document.querySelector('#accountTable tbody');
            const select = document.querySelector('#accountId');
            tbody.innerHTML = '';
            select.innerHTML = '';
            
            data.data.forEach(account => {
                let cloudSize = '未知';
                let familySize = '';
                
                // 格式化云盘容量信息
                if (account.capacity && account.capacity.cloudCapacityInfo) {
                    const info = account.capacity.cloudCapacityInfo;
                    const used = formatFileSize(info.usedSize);
                    const total = formatFileSize(info.totalSize);
                    cloudSize = `${used} / ${total}`;
                }
                
                // 格式化家庭云容量信息
                if (account.capacity && account.capacity.familyCapacityInfo) {
                    const info = account.capacity.familyCapacityInfo;
                    const used = formatFileSize(info.usedSize);
                    const total = formatFileSize(info.totalSize);
                    familySize = `家庭云: ${used} / ${total}`;
                }
                
                tbody.innerHTML += `
                    <tr>
                        <td>${account.id}</td>
                        <td>${account.username}</td>
                        <td>${cloudSize}<br>${familySize}</td>
                        <td>
                            <button onclick="deleteAccount(${account.id})">删除</button>
                        </td>
                    </tr>
                `;
                select.innerHTML += `
                    <option value="${account.id}">${account.username}</option>
                `;
            });
        } else {
            toast.error('获取账号列表失败');
        }
    } catch (error) {
        toast.error('获取账号列表失败: ' + error.message);
    }
}

async function deleteAccount(id) {
    if (!confirm('确定要删除这个账号吗？这将同时删除与此账号关联的所有任务。')) return;

    try {
        const response = await fetch(`/api/accounts/${id}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (data.success) {
            toast.success('账号删除成功');
            await fetchAccounts();
            refreshAccountSelect();
        } else {
            toast.error('账号删除失败: ' + data.error);
        }
    } catch (error) {
        toast.error('账号删除失败: ' + error.message);
    }
}

// 添加账号表单处理
async function initAccountForm() {
    document.getElementById('accountForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
    
        try {
            // 先获取加密密钥
            const keyResponse = await fetch('/api/auth/encryption-key');
            const keyData = await keyResponse.json();
            
            if (!keyData.success) {
                alert('获取加密密钥失败: ' + (keyData.error || '未知错误'));
                return;
            }
            
            // 使用新的加密函数加密密码
            const encryptedPassword = encryptPassword(password, keyData.publicKey, keyData.timestamp);
            
            const response = await fetch('/api/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username, 
                    password: encryptedPassword,
                    encryptionData: {
                        timestamp: keyData.timestamp,
                        keyId: keyData.keyId
                    }
                })
            });
    
            const data = await response.json();
            if (data.success) {
                document.getElementById('accountForm').reset();
                toast.success('账号添加成功');
                await fetchAccounts();
                refreshAccountSelect();
            } else {
                toast.error('账号添加失败: ' + data.error);
            }
        } catch (error) {
            toast.error('账号添加失败: ' + error.message);
        }
    });
}

// 刷新账号下拉选择框
async function refreshAccountSelect() {
    try {
        const response = await fetch('/api/accounts');
        const data = await response.json();
    
        if (data.success) {
            const accountSelect = document.getElementById('accountId');
            accountSelect.innerHTML = '';
    
            data.data.forEach(account => {
                const option = document.createElement('option');
                option.value = account.id;
                option.textContent = `${account.username} (ID: ${account.id})`;
                accountSelect.appendChild(option);
            });
        }
    } catch (error) {
        toast.error('获取账号列表失败: ' + error.message);
    }
}

// 初始化
async function init() {
    await fetchAccounts();
    refreshAccountSelect();
    initAccountForm();
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}