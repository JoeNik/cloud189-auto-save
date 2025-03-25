// 选项卡切换
function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 移除所有活动状态
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // 设置当前标签为活动状态
            tab.classList.add('active');
            const tabId = tab.getAttribute('data-tab');
            document.getElementById(`${tabId}Tab`).classList.add('active');

            // 如果是更新记录标签，加载最新数据
            if (tabId === 'logs') {
                loadUpdateLogs();
            }
            // 如果是通知配置标签，加载配置
            if (tabId === 'notification') {
                loadNotificationConfig();
            }
        });
    });
}