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
                          <button class="btn-info" onclick="updateAccountId(${account.id})" style="margin-right: 5px;">修改ID</button>
                          ${account.cookies && !account.password ?
                        `<button class="btn-warning" onclick="updateCookie(${account.id})" style="margin-right: 5px;">修改Cookie</button>`
                        : ''}<button class="btn-danger" onclick="deleteAccount(${account.id})">删除</button></td>
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
        const cookies = document.getElementById('cookies').value;

        if (!username) {
            alert('用户名不能为空');
            return;
        }
        if (!password && !cookies) {
            alert('密码和Cookie不能同时为空');
            return;
        }

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
                    },
                    cookies
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

// 更新 cookie
async function updateCookie(id) {
    const newCookie = prompt('请输入新的Cookie');
    if (!newCookie) return;

    const response = await fetch(`/api/accounts/${id}/cookie`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie: newCookie })
    });

    const data = await response.json();
    if (data.success) {
        alert('Cookie更新成功');
        fetchAccounts();
    } else {
        alert('Cookie更新失败: ' + data.error);
    }
}

// 修改账号ID
async function updateAccountId(id) {
    const newId = prompt('请输入新的账号ID (请确保ID唯一且为数字)');
    if (!newId) return;

    if (isNaN(newId)) {
        alert('账号ID必须是数字');
        return;
    }

    try {
        const response = await fetch(`/api/accounts/${id}/id`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newId: parseInt(newId) })
        });
        const data = await response.json();
        if (data.success) {
            toast.success('账号ID修改成功');
            await fetchAccounts();
            refreshAccountSelect();
        } else {
            toast.error('修改失败: ' + data.error);
        }
    } catch (e) {
        toast.error('请求失败: ' + e.message);
    }
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