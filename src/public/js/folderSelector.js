class FolderSelector {
    constructor(options = {}) {
        this.onSelect = options.onSelect || (() => {});
        this.accountId = options.accountId || '';
        this.selectedNode = null;
        this.modalId = 'folderModal_' + Math.random().toString(36).substr(2, 9);
        this.treeId = 'folderTree_' + Math.random().toString(36).substr(2, 9);
        
        // API配置
        this.apiConfig = {
            url: options.apiUrl || '/api/folders', // 默认API地址
            buildParams: options.buildParams || ((accountId, folderId) => `${accountId}?folderId=${folderId}`), // 构建请求参数
            parseResponse: options.parseResponse || ((data) => data.data), // 解析响应数据
            validateResponse: options.validateResponse || ((data) => data.success) // 验证响应数据
        };

        this.initModal();
    }

    initModal() {
        // 创建模态框HTML
        const modalHtml = `
            <div id="${this.modalId}" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">选择目录</h3>
                        <a href="javascript:;" class="refresh-link" data-action="refresh">
                            <span class="refresh-icon">🔄</span> 刷新
                        </a>
                    </div>
                    <div class="modal-body">
                        <div id="${this.treeId}" class="folder-tree"></div>
                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn modal-btn-default" data-action="cancel">取消</button>
                        <button class="modal-btn modal-btn-primary" data-action="confirm">确定</button>
                    </div>
                </div>
            </div>
        `;

        // 添加到文档中
        if (!document.getElementById(this.modalId)) {
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        this.modal = document.getElementById(this.modalId);
        this.folderTree = document.getElementById(this.treeId);

        // 绑定事件
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });
        // 添加刷新事件监听
        this.modal.querySelector('[data-action="refresh"]').addEventListener('click', () => this.refreshTree());
        this.modal.querySelector('[data-action="cancel"]').addEventListener('click', () => this.close());
        this.modal.querySelector('[data-action="confirm"]').addEventListener('click', () => this.confirm());
    }

    // 添加刷新方法
    async refreshTree() {
        const refreshLink = this.modal.querySelector('.refresh-link');
        refreshLink.classList.add('loading');
        
        try {
            await this.loadFolderNodes('-11', this.folderTree, true);
        } finally {
            refreshLink.classList.remove('loading');
        }
    }

    async show(accountId = '') {
        if (accountId) {
            this.accountId = accountId;
        }

        if (!this.accountId) {
            toast.error('请先选择账号');
            return;
        }

        this.modal.style.display = 'block';
        // 设置z-index
        this.modal.style.zIndex = 1001;
        this.selectedNode = null;
        await this.loadFolderNodes('-11');
    }

    close() {
        this.modal.style.display = 'none';
        // 移除DOM节点
        this.modal.remove();
        this.initModal();
    }

    confirm() {
        if (this.selectedNode) {
            this.onSelect({
                id: this.selectedNode.id,
                name: this.selectedNode.name
            });
            this.close();
        } else {
            toast.error('请选择一个目录');
        }
    }

    async loadFolderNodes(folderId, parentElement = this.folderTree, refresh = false) {
        try {
            const params = this.apiConfig.buildParams(this.accountId, folderId);
            const response = await fetch(`${this.apiConfig.url}/${params}${refresh ? '&refresh=true' : ''}`);
            const data = await response.json();
            if (this.apiConfig.validateResponse(data)) {
                const nodes = this.apiConfig.parseResponse(data);
                this.renderFolderNodes(nodes, parentElement);
            } else {
                toast.error('获取目录失败: ' + (data.error || '未知错误'));
            }
        } catch (error) {
            console.error('加载目录失败:', error);
            toast.error('加载目录失败');
        }
    }

    renderFolderNodes(nodes, parentElement = this.folderTree) {
        parentElement.innerHTML = '';
        nodes.forEach(node => {
            const item = document.createElement('div');
            item.className = 'folder-tree-item';
            item.innerHTML = `
                <span class="folder-icon">📁</span>
                <span class="folder-name">${node.name}</span>
                <span class="expand-icon">▶</span>
            `;

            const children = document.createElement('div');
            children.className = 'folder-children';
            item.appendChild(children);

            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!item.classList.contains('expanded')) {
                    await this.loadFolderNodes(node.id, children);
                }
                item.classList.toggle('expanded');
                this.selectFolder(node, item);
            });

            parentElement.appendChild(item);
        });
    }

    selectFolder(node, element) {
        if (this.selectedNode) {
            const prevSelected = this.modal.querySelector('.folder-tree-item.selected');
            if (prevSelected) {
                prevSelected.classList.remove('selected');
            }
        }
        this.selectedNode = node;
        element.classList.add('selected');
    }
}

// 导出FolderSelector类
window.FolderSelector = FolderSelector;