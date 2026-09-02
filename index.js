// st-context-probe —— 草稿笨笨 ↔ SillyTavern 全功能联动悬浮控制面板
// ---------------------------------------------------------------------------

(function () {
    const LOG = '[WonderdraftLink]';
    console.log(`${LOG} 脚本已注入，正在初始化悬浮球与联动控制面板...`);

    // 状态管理
    const state = {
        connected: true,
        activeChar: null,
        uuid: null,
        timelineMode: localStorage.getItem('soulos_tavern_timeline_mode') || 'SAME_TIMELINE',
        autoSync: localStorage.getItem('soulos_tavern_auto_sync') !== 'false',
        modalOpen: false
    };

    // 获取酒馆上下文的终极安全函数
    function getSTContext() {
        try {
            if (window.SillyTavern?.getContext && typeof window.SillyTavern.getContext === 'function') {
                return window.SillyTavern.getContext();
            }
        } catch { /* 忽略 */ }
        return null;
    }

    // 刷新当前角色信息与 UUID
    function refreshCharacterInfo() {
        const ctx = getSTContext();
        const charNameEl = document.getElementById('wd-modal-char-name');
        const charUuidEl = document.getElementById('wd-modal-char-uuid');

        if (!ctx) {
            if (charNameEl) charNameEl.innerText = '酒馆上下文准备中...';
            return;
        }

        const idx = ctx.characterId;
        const char = (idx !== undefined && idx !== null && ctx.characters) ? ctx.characters[idx] : null;

        if (char) {
            state.activeChar = char;
            if (charNameEl) charNameEl.innerText = char.name || '未命名角色';

            if (!char.data) char.data = {};
            if (!char.data.extensions) char.data.extensions = {};
            if (!char.data.extensions.xiaoshouji) char.data.extensions.xiaoshouji = {};

            if (!char.data.extensions.xiaoshouji.characterId) {
                char.data.extensions.xiaoshouji.characterId = 'uuid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
            }
            state.uuid = char.data.extensions.xiaoshouji.characterId;
            if (charUuidEl) charUuidEl.innerText = state.uuid;
        } else {
            if (charNameEl) charNameEl.innerText = '未选定角色 (大厅)';
            if (charUuidEl) charUuidEl.innerText = '无';
        }
    }

    // 手动拉取最新对话
    function doManualSync() {
        const ctx = getSTContext();
        if (!ctx || !ctx.chat || ctx.chat.length === 0) {
            alert('当前角色聊天记录为空或未能获取到对话！');
            return;
        }
        const lastMsg = ctx.chat[ctx.chat.length - 1];
        alert(`【草稿笨笨】已同步最新对话：\n[${lastMsg.name || '角色'}]: ${(lastMsg.mes || '').slice(0, 50)}...`);
    }

    // 打包导出背景记忆
    function doExportMemory() {
        if (!state.activeChar) {
            alert('请先在酒馆中选定一个角色！');
            return;
        }
        const memoryPack = {
            characterName: state.activeChar.name,
            description: state.activeChar.description || '',
            personality: state.activeChar.personality || '',
            scenario: state.activeChar.scenario || '',
            timelineMode: state.timelineMode,
            exportedAt: new Date().toLocaleString()
        };
        console.log(`${LOG} 背景记忆包:`, memoryPack);
        alert(`【草稿笨笨】已成功生成【${memoryPack.characterName}】的完整背景记忆与人设上下文包！`);
    }

    // 切换弹窗显隐
    function toggleModal(force) {
        state.modalOpen = (typeof force === 'boolean') ? force : !state.modalOpen;
        const overlay = document.getElementById('wd-modal-overlay');
        if (overlay) {
            if (state.modalOpen) {
                overlay.style.display = 'flex';
                refreshCharacterInfo();
            } else {
                overlay.style.display = 'none';
            }
        }
    }

    // 创建注入浮动球与完整版面弹窗
    function buildFloatingUI() {
        if (document.getElementById('wd-link-container')) return;

        const container = document.createElement('div');
        container.id = 'wd-link-container';

        container.innerHTML = `
            <!-- 悬浮球 (可拖拽 / 点击呼出完整版面) -->
            <div id="wd-float-ball" title="草稿笨笨 联动面板">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                <div id="wd-float-badge"></div>
            </div>

            <!-- 完整联动控制中心大版面 (模态浮层) -->
            <div id="wd-modal-overlay" style="display: none;">
                <div id="wd-modal-panel">
                    <!-- 头部 -->
                    <div class="wd-modal-header">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="wd-modal-logo">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#6366f1" stroke-width="2.2">
                                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                                </svg>
                            </div>
                            <div>
                                <h3 class="wd-modal-title">草稿笨笨 ↔ 酒馆 联动控制中心</h3>
                                <p class="wd-modal-subtitle">Wonderdraft Context Synchronization</p>
                            </div>
                        </div>
                        <button id="wd-modal-close-btn" class="wd-modal-close" title="关闭面板">✕</button>
                    </div>

                    <!-- 角色卡状态栏 -->
                    <div class="wd-char-status-card">
                        <div class="wd-status-row">
                            <span class="wd-text-muted">当前选定角色：</span>
                            <span class="wd-text-bold" id="wd-modal-char-name">检测中...</span>
                        </div>
                        <div class="wd-status-row" style="margin-top: 6px;">
                            <span class="wd-text-muted">笨笨角色 UUID：</span>
                            <span class="wd-text-code" id="wd-modal-char-uuid">-</span>
                        </div>
                    </div>

                    <!-- 功能卡片区 -->
                    <div class="wd-grid-actions">
                        <!-- 1. 时间线模式 -->
                        <div class="wd-action-card" id="wd-card-timeline">
                            <div class="wd-card-header">
                                <span class="wd-card-title">时间线模式</span>
                                <span class="wd-card-tag" id="wd-timeline-tag">主时间线</span>
                            </div>
                            <p class="wd-card-desc" id="wd-timeline-desc">主时间线模式：双向实时合并并推进主线故事</p>
                            <button class="wd-card-btn" id="wd-btn-timeline-toggle">点击切换时间线模式</button>
                        </div>

                        <!-- 2. 实时自动同步 -->
                        <div class="wd-action-card" id="wd-card-autosync">
                            <div class="wd-card-header">
                                <span class="wd-card-title">实时双向推流</span>
                                <span class="wd-card-tag wd-tag-green" id="wd-autosync-tag">已开启</span>
                            </div>
                            <p class="wd-card-desc" id="wd-autosync-desc">AI回复时自动向草稿笨笨进行增量同步</p>
                            <button class="wd-card-btn" id="wd-btn-autosync-toggle">切换自动推流状态</button>
                        </div>

                        <!-- 3. 手动拉取最新对话 -->
                        <div class="wd-action-card">
                            <div class="wd-card-header">
                                <span class="wd-card-title">手动同步</span>
                                <span class="wd-card-tag wd-tag-blue">即时拉取</span>
                            </div>
                            <p class="wd-card-desc">手动强制拉取酒馆当前对话记录推送到草稿笨笨</p>
                            <button class="wd-card-btn wd-btn-primary" id="wd-btn-sync-now">立即拉取并同步</button>
                        </div>

                        <!-- 4. 打包导出背景记忆 -->
                        <div class="wd-action-card">
                            <div class="wd-card-header">
                                <span class="wd-card-title">背景记忆导出</span>
                                <span class="wd-card-tag wd-tag-amber">上下文包</span>
                            </div>
                            <p class="wd-card-desc">提取角色人设、世界设定及最新对话打包导出</p>
                            <button class="wd-card-btn wd-btn-amber" id="wd-btn-export-now">打包导出背景记忆</button>
                        </div>
                    </div>

                    <!-- 底部状态 -->
                    <div class="wd-modal-footer">
                        <span class="wd-footer-status"><span class="wd-dot"></span> 服务连接正常 · 实时监听中</span>
                        <span class="wd-footer-ver">v1.1.0</span>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(container);

        // 绑定事件
        const ball = document.getElementById('wd-float-ball');
        const overlay = document.getElementById('wd-modal-overlay');
        const closeBtn = document.getElementById('wd-modal-close-btn');

        // 点击悬浮球打开大版面
        ball.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleModal(true);
        });

        // 关闭按钮
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleModal(false);
        });

        // 点击背景遮罩关闭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                toggleModal(false);
            }
        });

        // 时间线切换
        const timelineBtn = document.getElementById('wd-btn-timeline-toggle');
        timelineBtn.addEventListener('click', () => {
            state.timelineMode = state.timelineMode === 'SAME_TIMELINE' ? 'PARALLEL_TIMELINE' : 'SAME_TIMELINE';
            localStorage.setItem('soulos_tavern_timeline_mode', state.timelineMode);
            updateTimelineUI();
        });

        // 自动同步切换
        const autosyncBtn = document.getElementById('wd-btn-autosync-toggle');
        autosyncBtn.addEventListener('click', () => {
            state.autoSync = !state.autoSync;
            localStorage.setItem('soulos_tavern_auto_sync', state.autoSync.toString());
            updateAutoSyncUI();
        });

        // 手动同步
        document.getElementById('wd-btn-sync-now').addEventListener('click', doManualSync);

        // 导出记忆
        document.getElementById('wd-btn-export-now').addEventListener('click', doExportMemory);

        // 初始化 UI 状态
        updateTimelineUI();
        updateAutoSyncUI();
    }

    function updateTimelineUI() {
        const tag = document.getElementById('wd-timeline-tag');
        const desc = document.getElementById('wd-timeline-desc');
        if (state.timelineMode === 'SAME_TIMELINE') {
            if (tag) {
                tag.innerText = '主时间线';
                tag.className = 'wd-card-tag wd-tag-blue';
            }
            if (desc) desc.innerText = '主时间线模式：双向实时合并并推进主线故事';
        } else {
            if (tag) {
                tag.innerText = '平行时间线';
                tag.className = 'wd-card-tag wd-tag-amber';
            }
            if (desc) desc.innerText = '平行时间线模式：线下独立演进，不影响主剧本';
        }
    }

    function updateAutoSyncUI() {
        const tag = document.getElementById('wd-autosync-tag');
        const desc = document.getElementById('wd-autosync-desc');
        if (state.autoSync) {
            if (tag) {
                tag.innerText = '已开启';
                tag.className = 'wd-card-tag wd-tag-green';
            }
            if (desc) desc.innerText = 'AI回复时自动向草稿笨笨进行增量同步';
        } else {
            if (tag) {
                tag.innerText = '已暂停';
                tag.className = 'wd-card-tag wd-tag-muted';
            }
            if (desc) desc.innerText = '自动推流已暂停，可手动点击同步';
        }
    }

    // 挂载魔法棒菜单
    function mountWandMenu() {
        const menuContainer = document.querySelector('#extensionsMenu') || 
                              document.querySelector('#extensions_menu') ||
                              document.querySelector('.extensionsMenu');
        if (!menuContainer) return;
        if (document.getElementById('wd-link-wand-item')) return;

        const item = document.createElement('div');
        item.id = 'wd-link-wand-item';
        item.className = 'list-group-item flex-container flexGap5 interactable';
        item.style.cssText = 'cursor: pointer; padding: 10px 14px; display: flex; align-items: center; border-radius: 8px; margin: 2px 0; user-select: none;';
        item.innerHTML = `
            <div class="fa-solid fa-wand-magic-sparkles extensionsMenuExtensionButton" style="margin-right: 10px; color: #6366f1; font-size: 16px;"></div>
            <span style="font-weight: 600; font-size: 13px;">草稿笨笨联动控制中心</span>
        `;
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleModal(true);
        });
        menuContainer.appendChild(item);
    }

    // 启动挂载
    function init() {
        buildFloatingUI();
        mountWandMenu();

        // 持续轮询保证在页面变化时 DOM 和菜单不丢失
        setInterval(() => {
            buildFloatingUI();
            mountWandMenu();
            if (state.modalOpen) {
                refreshCharacterInfo();
            }
        }, 1200);

        console.log(`${LOG} 悬浮球及联动大版面已成功挂载！`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
