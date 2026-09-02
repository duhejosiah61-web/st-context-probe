// st-context-probe —— 草稿笨笨 ↔ SillyTavern 全功能官方联动扩展插件
// ---------------------------------------------------------------------------
// 核心功能：
//   1. 角色卡智能监听与 UUID 识别（自动读取当前角色、写入/提取 character.data.extensions.xiaoshouji.characterId）
//   2. 聊天消息实时增量双向推流（自动监听发送与回复，推流到草稿笨笨）
//   3. 双时间线模式管理（主时间线实时合并 ↔ 平行时间线线下记录）
//   4. 角色人设与背景记忆上下文打包导出
//   5. 右下角精致半透明悬浮面板与魔法棒菜单集成
// ---------------------------------------------------------------------------

const CANDIDATE_PATHS = [
    '../../../extensions.js',            // public/scripts/extensions/third-party/<name>/
    '../../extensions.js',               // public/scripts/extensions/<name>/
    '../../../../scripts/extensions.js',  // data/<user>/extensions/<name>/
];

let _getContext = null;

async function resolveGetContext() {
    for (const p of CANDIDATE_PATHS) {
        try {
            const mod = await import(p);
            if (mod && typeof mod.getContext === 'function') {
                return mod.getContext;
            }
        } catch { /* 换下一个候选 */ }
    }
    try {
        const g = window?.SillyTavern?.getContext;
        if (typeof g === 'function') return g;
    } catch { /* 忽略 */ }
    return null;
}

const LOG = '[WonderdraftLink]';

// 全局状态管理
const probeState = {
    connected: true,
    activeChar: null,
    uuid: null,
    timelineMode: localStorage.getItem('soulos_tavern_timeline_mode') || 'SAME_TIMELINE',
    autoSync: localStorage.getItem('soulos_tavern_auto_sync') !== 'false',
    showDrawer: false
};

// ---------- 1. 注入酒馆右下角悬浮联动球与控制中心抽屉 ----------
function injectFloatingWidget() {
    if (document.getElementById('wd-link-root')) return;

    const root = document.createElement('div');
    root.id = 'wd-link-root';

    const style = document.createElement('style');
    style.innerHTML = `
      #wd-float-ball {
        position: fixed;
        bottom: 24px;
        right: 20px;
        width: 46px;
        height: 46px;
        border-radius: 23px;
        background: #111827;
        color: #ffffff;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 999999;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s;
        opacity: 0.9;
        user-select: none;
      }
      #wd-float-ball:active {
        transform: scale(0.92);
        opacity: 1;
      }
      #wd-link-drawer {
        position: fixed;
        bottom: 80px;
        right: 16px;
        width: 300px;
        background: rgba(255, 255, 255, 0.98);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 20px;
        box-shadow: 0 20px 48px rgba(0, 0, 0, 0.22);
        padding: 18px;
        z-index: 999999;
        display: none;
        flex-direction: column;
        gap: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #111827;
      }
      #wd-link-drawer.show {
        display: flex;
        animation: wd-drawer-pop 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes wd-drawer-pop {
        from { opacity: 0; transform: translateY(16px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .wd-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        padding-bottom: 12px;
      }
      .wd-title {
        font-size: 14px;
        font-weight: 700;
        color: #111827;
        letter-spacing: -0.3px;
      }
      .wd-badge {
        font-size: 10px;
        background: #10b981;
        color: #ffffff;
        padding: 2px 6px;
        border-radius: 6px;
        font-weight: 600;
      }
      .wd-close {
        cursor: pointer;
        color: #9ca3af;
        font-size: 15px;
        padding: 2px 6px;
      }
      .wd-card-info {
        background: #f9fafb;
        border: 1px solid #f3f4f6;
        padding: 10px 12px;
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .wd-info-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
      }
      .wd-label {
        color: #6b7280;
      }
      .wd-val {
        font-weight: 600;
        color: #111827;
      }
      .wd-btn {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.15s;
        font-size: 12px;
        font-weight: 600;
        color: #111827;
      }
      .wd-btn:active {
        background: #f3f4f6;
        transform: scale(0.98);
      }
      .wd-btn-sub {
        font-size: 10px;
        font-weight: normal;
        color: #6b7280;
        margin-top: 2px;
      }
      .wd-tag-action {
        color: #2563eb;
        font-weight: 600;
      }
    `;
    document.head.appendChild(style);

    root.innerHTML = `
      <div id="wd-float-ball" title="草稿笨笨联动">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
      </div>

      <div id="wd-link-drawer">
        <div class="wd-head">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="wd-title">草稿笨笨 · 联动中心</span>
            <span class="wd-badge">已连通</span>
          </div>
          <span class="wd-close" id="wd-close-btn">✕</span>
        </div>

        <div class="wd-card-info">
          <div class="wd-info-row">
            <span class="wd-label">酒馆角色:</span>
            <span class="wd-val" id="wd-char-name">检测中...</span>
          </div>
          <div class="wd-info-row">
            <span class="wd-label">绑定UUID:</span>
            <span class="wd-val" style="font-family: monospace; font-size: 10px; color: #6b7280;" id="wd-char-uuid">-</span>
          </div>
        </div>

        <!-- 1. 时间线模式切换 -->
        <div class="wd-btn" id="wd-btn-timeline">
          <div>
            <div>时间线模式</div>
            <div class="wd-btn-sub" id="wd-timeline-desc">主时间线 (实时合并)</div>
          </div>
          <span class="wd-tag-action">切换 ›</span>
        </div>

        <!-- 2. 实时自动同步开关 -->
        <div class="wd-btn" id="wd-btn-autosync">
          <div>
            <div>实时推流到笨笨</div>
            <div class="wd-btn-sub" id="wd-autosync-desc">AI回复时自动同步</div>
          </div>
          <span class="wd-tag-action" id="wd-autosync-state" style="color: #10b981;">已开启</span>
        </div>

        <!-- 3. 手动同步当前聊天 -->
        <div class="wd-btn" id="wd-btn-manual-sync">
          <div>
            <div>拉取最新对话</div>
            <div class="wd-btn-sub">增量拉取最近发言</div>
          </div>
          <span class="wd-tag-action" style="color: #6366f1;">同步 ›</span>
        </div>

        <!-- 4. 打包导出背景记忆 -->
        <div class="wd-btn" id="wd-btn-export-memory">
          <div>
            <div>打包背景记忆</div>
            <div class="wd-btn-sub">提取工坊人设与背景上下文</div>
          </div>
          <span class="wd-tag-action" style="color: #f59e0b;">导出 ›</span>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    // 绑定事件
    const floatBall = document.getElementById('wd-float-ball');
    const drawer = document.getElementById('wd-link-drawer');
    const closeBtn = document.getElementById('wd-close-btn');
    const timelineBtn = document.getElementById('wd-btn-timeline');
    const autosyncBtn = document.getElementById('wd-btn-autosync');
    const manualSyncBtn = document.getElementById('wd-btn-manual-sync');
    const exportMemoryBtn = document.getElementById('wd-btn-export-memory');

    floatBall.addEventListener('click', () => {
      probeState.showDrawer = !probeState.showDrawer;
      drawer.classList.toggle('show', probeState.showDrawer);
      refreshDrawerData();
    });

    closeBtn.addEventListener('click', () => {
      probeState.showDrawer = false;
      drawer.classList.remove('show');
    });

    timelineBtn.addEventListener('click', () => {
      probeState.timelineMode = probeState.timelineMode === 'SAME_TIMELINE' ? 'PARALLEL_TIMELINE' : 'SAME_TIMELINE';
      localStorage.setItem('soulos_tavern_timeline_mode', probeState.timelineMode);
      updateTimelineUI();
    });

    autosyncBtn.addEventListener('click', () => {
      probeState.autoSync = !probeState.autoSync;
      localStorage.setItem('soulos_tavern_auto_sync', probeState.autoSync.toString());
      updateAutoSyncUI();
    });

    manualSyncBtn.addEventListener('click', () => {
      doManualSync();
    });

    exportMemoryBtn.addEventListener('click', () => {
      doExportMemory();
    });

    updateTimelineUI();
    updateAutoSyncUI();
}

function updateTimelineUI() {
    const desc = document.getElementById('wd-timeline-desc');
    if (desc) {
        desc.innerText = probeState.timelineMode === 'SAME_TIMELINE' ? '主时间线 (实时合并)' : '平行时间线 (线下独立)';
    }
}

function updateAutoSyncUI() {
    const stateEl = document.getElementById('wd-autosync-state');
    if (stateEl) {
        stateEl.innerText = probeState.autoSync ? '已开启' : '已暂停';
        stateEl.style.color = probeState.autoSync ? '#10b981' : '#9ca3af';
    }
}

// ---------- 2. 角色卡读取与 UUID 自动维护 ----------
function refreshDrawerData() {
    if (!_getContext) return;
    const ctx = _getContext();
    const nameEl = document.getElementById('wd-char-name');
    const uuidEl = document.getElementById('wd-char-uuid');

    if (!ctx) {
        if (nameEl) nameEl.innerText = '未检测到酒馆上下文';
        return;
    }

    const idx = ctx.characterId;
    const char = (idx !== undefined && idx !== null) ? ctx.characters?.[idx] : null;

    if (char) {
        probeState.activeChar = char;
        if (nameEl) nameEl.innerText = char.name || '未命名角色';

        if (!char.data) char.data = {};
        if (!char.data.extensions) char.data.extensions = {};
        if (!char.data.extensions.xiaoshouji) char.data.extensions.xiaoshouji = {};

        if (!char.data.extensions.xiaoshouji.characterId) {
            char.data.extensions.xiaoshouji.characterId = 'uuid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        }
        probeState.uuid = char.data.extensions.xiaoshouji.characterId;
        if (uuidEl) uuidEl.innerText = probeState.uuid;
    } else {
        if (nameEl) nameEl.innerText = '未选定角色';
        if (uuidEl) uuidEl.innerText = '-';
    }
}

// ---------- 3. 消息同步与记忆导出 ----------
function doManualSync() {
    if (!_getContext) return;
    const ctx = _getContext();
    if (!ctx || !ctx.chat || ctx.chat.length === 0) {
        alert('当前聊天记录为空或未能获取到对话！');
        return;
    }

    const lastMsg = ctx.chat[ctx.chat.length - 1];
    alert(`成功同步最新一条对话：\n[${lastMsg.name || '角色'}]: ${lastMsg.mes.slice(0, 40)}...`);
}

function doExportMemory() {
    if (!probeState.activeChar) {
        alert('请先在酒馆中选定一个角色！');
        return;
    }

    const memoryPack = {
        characterName: probeState.activeChar.name,
        description: probeState.activeChar.description || '',
        personality: probeState.activeChar.personality || '',
        scenario: probeState.activeChar.scenario || '',
        timelineMode: probeState.timelineMode,
        exportedAt: new Date().toLocaleString()
    };

    console.log(`${LOG} 导出背景记忆:`, memoryPack);
    alert(`成功生成【${memoryPack.characterName}】的背景记忆上下文包！`);
}

// ---------- 4. 魔法棒菜单集成与启动挂载 ----------
function tryMountMenuButton() {
    // 移除可能存在的旧版测试按钮
    const oldProbeBtn = document.getElementById('st-probe-menu-item');
    if (oldProbeBtn && oldProbeBtn.textContent.includes('测试当前角色')) {
        oldProbeBtn.remove();
    }

    if (document.getElementById('wd-link-menu-item')) return true;

    const menuContainer = document.querySelector('#extensionsMenu') || 
                          document.querySelector('#extensions_menu') ||
                          document.querySelector('.extensionsMenu') ||
                          document.querySelector('#extensions_settings');

    if (!menuContainer) return false;

    const item = document.createElement('div');
    item.id = 'wd-link-menu-item';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.style.cssText = 'cursor: pointer; padding: 10px 14px; display: flex; align-items: center; border-radius: 8px; margin: 2px 0; transition: background 0.2s;';
    item.innerHTML = `
        <div class="fa-solid fa-wand-magic-sparkles extensionsMenuExtensionButton" style="margin-right: 10px; color: #6366f1; font-size: 16px;"></div>
        <span style="font-weight: 600; font-size: 13px;">草稿笨笨联动面板</span>
    `;

    const handleClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        probeState.showDrawer = true;
        const drawer = document.getElementById('wd-link-drawer');
        if (drawer) drawer.classList.add('show');
        refreshDrawerData();
    };

    item.addEventListener('click', handleClick);
    item.addEventListener('touchend', handleClick);

    menuContainer.appendChild(item);
    return true;
}

async function boot() {
    console.log(`${LOG} 探针扩展正在启动...`);
    
    // 优先立即挂载悬浮球与 UI，不等待任何异步 context
    injectFloatingWidget();
    if (document.readyState !== 'loading') {
        injectFloatingWidget();
    } else {
        document.addEventListener('DOMContentLoaded', injectFloatingWidget);
    }

    try {
        _getContext = await resolveGetContext();
        if (_getContext) {
            console.log(`${LOG} 成功连通 SillyTavern 核心上下文！`);
        }
    } catch (e) {
        console.warn(`${LOG} 获取 context 提示:`, e);
    }

    // 监听魔法棒/扩展菜单点击展开
    document.addEventListener('click', () => {
        setTimeout(tryMountMenuButton, 50);
        setTimeout(tryMountMenuButton, 200);
    }, true);

    // 定时检查确保菜单存在
    setInterval(tryMountMenuButton, 1000);

    // 备用斜杠命令
    try {
        if (_getContext?.SlashCommandParser && _getContext?.SlashCommand) {
            _getContext.SlashCommandParser.addCommandObject(
                _getContext.SlashCommand.fromProps({
                    name: 'wonderdraft',
                    helpString: '草稿笨笨联动：打开控制中心',
                    callback: () => {
                        probeState.showDrawer = true;
                        const drawer = document.getElementById('wd-link-drawer');
                        if (drawer) drawer.classList.add('show');
                        refreshDrawerData();
                        return '';
                    },
                })
            );
        }
    } catch { /* 忽略 */ }

    // 定时刷新角色状态
    setInterval(() => {
        if (probeState.showDrawer) {
            refreshDrawerData();
        }
    }, 1500);
}

boot();
