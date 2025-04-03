/**
 * 显示一个自动消失的通知
 * @param {string} message - 要显示的消息
 * @param {string} type - 通知类型: 'default', 'success', 'error', 'warning', 'info'
 * @param {number} duration - 通知显示时间(毫秒)
 */
function showToast(message, type = 'default', duration = 2500) {
    // 确保toast容器存在
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    // 创建toast元素
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    // 添加到容器
    container.appendChild(toast);
    
    // 设置动画持续时间
    toast.style.animationDuration = `${duration / 1000}s`;
    
    // 动画结束后移除元素
    setTimeout(() => {
        if (toast && toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
        
        // 如果没有更多的toast，移除容器
        if (container && container.children.length === 0) {
            container.parentNode.removeChild(container);
        }
    }, duration);
}

// 便捷方法
const toast = {
    show: (message, duration) => showToast(message, 'default', duration),
    success: (message, duration) => showToast(message, 'success', duration),
    error: (message, duration) => showToast(message, 'error', duration),
    warning: (message, duration) => showToast(message, 'warning', duration),
    info: (message, duration) => showToast(message, 'info', duration)
}; 