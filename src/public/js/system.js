// 系统设置相关功能
let systemConfigs = [];

// 加载系统配置
async function loadSystemConfig() {
    try {
        const response = await fetch('/api/system/config');
        const data = await response.json();
        
        if (data.success) {
            systemConfigs = data.data || [];
            const form = document.getElementById('systemConfigForm');
            
            // 填充表单数据
            systemConfigs.forEach(config => {
                const input = form.querySelector(`[name="${config.key}"]`);
                if (input) {
                    if (input.type === 'checkbox') {
                        // 处理复选框
                        input.checked = config.value === '1' || config.value === 'true';
                        // 更新复选框的值
                        input.value = input.checked ? '1' : '0';
                    } else {
                        // 处理其他输入框
                        input.value = config.value;
                    }
                }
            });
        } else {
            toast.error('加载系统配置失败：' + data.error);
        }
    } catch (error) {
        console.error('加载系统配置出错：', error);
        toast.error('加载系统配置失败：' + error.message);
    }
}

// 切换个人回收站清理开关
function toggleRecycle(checkbox) {
    console.log('切换个人回收站清理开关：', checkbox.checked);
    // 复选框的value值会根据是否选中改变
    checkbox.value = checkbox.checked ? '1' : '0';
    // 显示提示信息
    if (checkbox.checked) {
        toast.info('启用个人回收站自动清理');
    } else {
        toast.info('禁用个人回收站自动清理');
    }
}

// 切换家庭回收站清理开关
function toggleFamilyRecycle(checkbox) {
    console.log('切换家庭回收站清理开关：', checkbox.checked);
    // 复选框的value值会根据是否选中改变
    checkbox.value = checkbox.checked ? '1' : '0';
    // 显示提示信息
    if (checkbox.checked) {
        toast.info('启用家庭回收站自动清理');
    } else {
        toast.info('禁用家庭回收站自动清理');
    }
}

// 切换签到功能开关
function toggleSignIn(checkbox) {
    console.log('切换签到功能开关：', checkbox.checked);
    // 复选框的value值会根据是否选中改变
    checkbox.value = checkbox.checked ? '1' : '0';
    // 显示提示信息
    if (checkbox.checked) {
        toast.info('启用自动签到功能');
    } else {
        toast.info('禁用自动签到功能');
    }
}

// 立即执行签到
async function executeSignInNow() {
    const statusElement = document.getElementById('signInStatus');
    const signInButton = document.getElementById('signInNow');
    
    try {
        statusElement.textContent = '签到中...';
        signInButton.disabled = true;
        
        // 获取当前签到并发数设置
        const execThreshold = document.getElementById('signInExecThreshold').value || 1;
        // 获取家庭ID列表
        const families = document.getElementById('signInFamilies').value || '';
        
        const response = await fetch('/api/cloud189/sign-in', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                execThreshold: parseInt(execThreshold),
                families: families.split(',').filter(id => id.trim() !== '')
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            statusElement.textContent = '签到成功！' + (data.message ? ` ${data.message}` : '');
            toast.success('签到成功！');
        } else {
            statusElement.textContent = '签到失败：' + data.error;
            toast.error('签到失败：' + data.error);
        }
    } catch (error) {
        console.error('执行签到出错：', error);
        statusElement.textContent = '签到失败：' + error.message;
        toast.error('签到失败：' + error.message);
    } finally {
        signInButton.disabled = false;
    }
}

// 为复选框添加事件监听器
function setupCheckboxListeners() {
    // 个人回收站复选框
    const recycleCheckbox = document.getElementById('Enable_Auto_Clear_Recycle');
    if (recycleCheckbox) {
        recycleCheckbox.addEventListener('change', function() {
            toggleRecycle(this);
        });
    }
    
    // 家庭回收站复选框
    const familyRecycleCheckbox = document.getElementById('Enable_Auto_Clear_Family_Recycle');
    if (familyRecycleCheckbox) {
        familyRecycleCheckbox.addEventListener('change', function() {
            toggleFamilyRecycle(this);
        });
    }
    
    // 签到功能复选框
    const signInCheckbox = document.getElementById('Enable_Sign_In_Task');
    if (signInCheckbox) {
        signInCheckbox.addEventListener('change', function() {
            toggleSignIn(this);
        });
    }
    
    // 立即签到按钮
    const signInButton = document.getElementById('signInNow');
    if (signInButton) {
        signInButton.addEventListener('click', executeSignInNow);
    }
}

// 保存系统配置
async function saveSystemConfig(e) {
    e.preventDefault();
    
    try {
        const form = document.getElementById('systemConfigForm');
        const formData = new FormData(form);
        const configs = [];
        
        // 获取临时加密密钥（与登录时相同的方式）
        let encryptionInfo = null;
        const password = formData.get('AUTH_PASSWORD');
        
        // 如果有设置密码，则需要加密
        if (password && password.trim() !== '') {
            const keyResponse = await fetch('/api/auth/encryption-key');
            const keyData = await keyResponse.json();
            
            if (!keyData.success) {
                toast.error('获取加密密钥失败：' + keyData.error);
                return;
            }
            
            // 存储加密信息，供后续使用
            encryptionInfo = {
                publicKey: keyData.publicKey,
                timestamp: keyData.timestamp,
                keyId: keyData.keyId
            };
            
            // 使用AES加密密码
            const encryptedPassword = encryptPassword(password, keyData.publicKey, keyData.timestamp);
            
            // 替换明文密码为加密后的密码
            formData.set('AUTH_PASSWORD', encryptedPassword);
        }
        
        // 特别处理复选框，确保即使未选中也发送值
        const checkboxItems = [
            {id: 'Enable_Auto_Clear_Recycle', name: 'ENABLE_AUTO_CLEAR_RECYCLE'}, 
            {id: 'Enable_Auto_Clear_Family_Recycle', name: 'ENABLE_AUTO_CLEAR_FAMILY_RECYCLE'},
            {id: 'Enable_Sign_In_Task', name: 'ENABLE_SIGN_IN_TASK'}
        ];
        
        // 确保所有复选框都有值
        checkboxItems.forEach(item => {
            const checkbox = document.getElementById(item.id);
            if (checkbox && checkbox.type === 'checkbox') {
                const value = checkbox.checked ? '1' : '0';
                formData.set(item.name, value);
                console.log(`设置复选框 ${item.name} = ${value}, ID=${item.id}, 找到元素:`, !!checkbox);
            } else {
                console.log(`找不到复选框元素: ID=${item.id}`);
            }
        });
        
        // 收集表单数据
        for (const [key, value] of formData.entries()) {
            // 对于密码字段，如果为空则不更新
            if (key === 'AUTH_PASSWORD' && value === '') {
                continue;
            }
            console.log(`保存配置: ${key} = ${value} }`)
            
            // 查找原配置项
            const originalConfig = systemConfigs.find(c => c.key === key);
            
            const configItem = {
                key,
                value,
                description: originalConfig ? originalConfig.description : null
            };
            
            // 如果是密码字段并且有加密信息，添加加密信息
            if (key === 'AUTH_PASSWORD' && encryptionInfo && value !== '') {
                configItem.encryptionData = encryptionInfo;
            }
            
            configs.push(configItem);
        }
        
        const response = await fetch('/api/system/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ configs })
        });
        
        const data = await response.json();
        
        if (data.success) {
            toast.success('系统配置已保存');
            
            // 重新加载配置
            await loadSystemConfig();
        } else {
            toast.error('保存系统配置失败：' + data.error);
        }
    } catch (error) {
        console.error('保存系统配置出错：', error);
        toast.error('保存系统配置失败：' + error.message);
    }
}

// 初始化系统设置页面
function initSystemConfig() {
    const form = document.getElementById('systemConfigForm');
    if (form) {
        form.addEventListener('submit', saveSystemConfig);
        loadSystemConfig();
        // 设置复选框事件监听器
        setupCheckboxListeners();
    }
}

// 在页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initSystemConfig();
}); 