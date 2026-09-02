// st-context-probe —— 只读探针
// ---------------------------------------------------------------------------
// 用途：验证 SillyTavern Extension 到底能拿到「当前正在聊天的 Character」的哪些数据。
//
// 严格约束：
//   - 不写角色卡（绝不调用 writeExtensionField）
//   - 不保存任何东西（不碰 localStorage / IndexedDB / 服务端）
//   - 不联网、不连接任何外部程序
//   - 唯一副作用：往页面插入一个临时浮层，关闭即移除
//
// 使用：扩展面板 -> 「测试当前角色」；或在聊天框输入 /probe
// ---------------------------------------------------------------------------

// 扩展可能被安装到三个不同位置，import 相对路径不同。
// 依次尝试，最后回退到全局 SillyTavern，保证三种安装方式都能跑。
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

const LOG = '[ST-Probe]';

// ---------- 小工具 ----------
const safe = (fn, fb = null) => {
    try {
        const v = fn();
        return v === undefined ? fb : v;
    } catch {
        return fb;
    }
};
const norm = (s) => String(s ?? '').replace(/\s+/g, '').toLowerCase();
const cut = (s, n = 60) => {
    const t = String(s ?? '');
    return t.length > n ? t.slice(0, n) + '…' : t;
};

async function sha256(text) {
    try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
        return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
        return 'n/a';
    }
}

// ---------- 采集 ----------
async function collect() {
    const ctx = _getContext();
    const idx = ctx.characterId;
    const isGroup = ctx.groupId !== undefined && ctx.groupId !== null && ctx.groupId !== '';
    const ch = idx !== undefined && idx !== null ? ctx.characters?.[idx] : null;
    const d = ch?.data ?? {};

    const fingerprint = await sha256(norm(d.name) + '|' + norm(d.description) + '|' + norm(d.personality));

    return {
        meta: {
            probeTime: new Date().toISOString(),
            mode: isGroup ? 'GROUP_CHAT' : ch ? 'SINGLE_CHARACTER' : 'NO_CHARACTER',
            stVersion: safe(() => document.querySelector('#version_display')?.textContent?.trim(), 'n/a'),
        },

        // 重点 1：characterId 到底是什么值与类型，以及数据来源路径
        dataSource: {
            sourceExpression: "ctx.characters[ctx.characterId]",
            characterId_rawValue: idx,
            characterId_type: typeof idx,
            isIndexConfirmed: typeof idx === 'number',
            description: "当前角色对象来自 ctx.characters[ctx.characterId]，characterId 实测为 characters 数组的当前索引位置",
            groupId: ctx.groupId ?? null,
            chatId: ctx.chatId ?? null,
            getCurrentChatId: safe(() => ctx.getCurrentChatId()),
            name1: ctx.name1 ?? null,
            name2: ctx.name2 ?? null,
        },

        // 重点 2：角色对象顶层字段全集（包含 raw 原样对象）
        character_raw_topLevel: ch ?? null,

        // 重点 3：卡数据本体（包含 raw 原样 data 属性与结构化字段）
        character_data_raw: d ?? null,
        
        // 重点 3.1：卡数据核心字段明确展示（不存在则显示 null / undefined）
        character_data_fields: ch == null ? null : {
            name: d.name ?? null,
            description: d.description ?? null,
            personality: d.personality ?? null,
            scenario: d.scenario ?? null,
            first_mes: d.first_mes ?? null,
            mes_example: d.mes_example ?? null,
            alternate_greetings: d.alternate_greetings ?? null,
            character_book: d.character_book ?? null,
            tags: d.tags ?? null,
            creator: d.creator ?? null,
            character_version: d.character_version ?? null,
            source: d.source ?? null,
            creation_date: d.creation_date ?? null,
            modification_date: d.modification_date ?? null,
            extensions: d.extensions ?? null,
            system_prompt: d.system_prompt ?? null,
            post_history_instructions: d.post_history_instructions ?? null,
            creator_notes: d.creator_notes ?? null,
            nickname: d.nickname ?? null,
            ALL_DATA_KEYS: Object.keys(d),
        },

        // 重点 5：自造 ID 的能力检测（只检测，绝不写入）
        probe_capability: {
            note: '本探针不写入任何数据，仅确认 API 是否可用',
            writeExtensionField_available: typeof ctx.writeExtensionField === 'function',
            uuidv4_available: typeof ctx.uuidv4 === 'function',
            existing_probe_key: d.extensions?.st_context_probe ?? null,
        },

        // 身份依据候选
        identity: {
            name: d.name ?? ch?.name ?? null,
            avatar_file: ch?.avatar ?? null,
            content_fingerprint_sha256: fingerprint,
            fingerprint_source: 'norm(name) + norm(description) + norm(personality)',
        },

        // 重点 6：全部角色列表（仅取数量与前5个角色简要，避免全量遍历上百张卡导致手机卡顿）
        characters_overview: {
            total: ctx.characters?.length ?? 0,
            sample_count: Math.min(ctx.characters?.length ?? 0, 5),
            sample_list: (ctx.characters ?? []).slice(0, 5).map((c, i) => ({
                i,
                name: c?.name,
                avatar: c?.avatar,
                shallow: !!c?.shallow,
            })),
        },

        // 重点 7：当前会话
        chat: {
            messageCount: ctx.chat?.length ?? 0,
            current_chatId: ctx.chatId ?? null,
            firstMessage: safe(() => ({
                name: ctx.chat[0]?.name,
                is_user: !!ctx.chat[0]?.is_user,
                text: cut(ctx.chat[0]?.mes, 60),
            })),
            lastMessage: safe(() => {
                const len = ctx.chat?.length ?? 0;
                if (!len) return null;
                const m = ctx.chat[len - 1];
                return { name: m?.name, is_user: !!m?.is_user, text: cut(m?.mes, 60) };
            }),
            chatMetadata_KEYS: Object.keys(ctx.chatMetadata ?? {}),
        },
    };
}

// ---------- 输出：直接触发文件下载 (手机端 100% 成功，无需剪贴板权限) ----------
function downloadJsonFile(filename, text) {
    try {
        const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        return true;
    } catch (e) {
        console.error(LOG, '下载失败:', e);
        return false;
    }
}

function showOverlay(json, data) {
    document.getElementById('st-probe-overlay')?.remove();

    const wrap = document.createElement('div');
    wrap.id = 'st-probe-overlay';
    wrap.style.cssText =
        'position:fixed;top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;z-index:2147483647;' +
        'background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;' +
        'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",Roboto,sans-serif;';

    const box = document.createElement('div');
    box.style.cssText =
        'background:#ffffff;color:#111827;border-radius:14px;width:100%;max-width:440px;' +
        'height:76vh;max-height:76vh;display:flex;flex-direction:column;overflow:hidden;' +
        'box-shadow:0 12px 36px rgba(0,0,0,0.4);box-sizing:border-box;border:1px solid rgba(0,0,0,0.1);';

    const ds = data.dataSource ?? {};
    const cdf = data.character_data_fields ?? {};
    const idn = data.identity ?? {};

    const row = (k, v, warn) =>
        `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #f3f4f6;">
           <span style="flex:0 0 100px;color:#6b7280;font-size:11px;line-height:1.4;">${k}</span>
           <span style="flex:1;word-break:break-all;font-size:11px;line-height:1.45;${warn ? 'color:#dc2626;font-weight:600;' : 'color:#1f2937;'}">${v}</span>
         </div>`;

    box.innerHTML = `
        <div style="padding:12px 14px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between;background:#fafafa;flex-shrink:0;">
            <div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-size:15px;font-weight:700;color:#111827;">${cdf.name ?? '(未检测到角色)'}</span>
                    <span style="font-size:10px;color:#2563eb;background:#eff6ff;padding:1px 5px;border-radius:4px;font-weight:500;">${data.meta.mode}</span>
                </div>
                <div style="font-size:10px;color:#9ca3af;margin-top:2px;">SillyTavern 角色数据探针 · 只读</div>
            </div>
            <button id="st-probe-top-close" style="background:none;border:none;font-size:18px;color:#9ca3af;cursor:pointer;padding:4px;line-height:1;">✕</button>
        </div>

        <div style="padding:10px 14px;background:#ffffff;overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1;">
            ${row('数据来源', ds.sourceExpression ?? 'ctx.characters[ctx.characterId]', true)}
            ${row('characterId', `${ds.characterId_rawValue} <span style="color:#9ca3af">(${ds.characterId_type})</span>`, true)}
            ${row('类型判断', ds.isIndexConfirmed ? '数组索引 (数字)' : '非纯数字', true)}
            ${row('角色姓名', cdf.name ?? 'null')}
            ${row('头像文件名', idn.avatar_file ?? 'null')}
            ${row('设定 description', cdf.description ? `${cdf.description.length} 字` : 'null')}
            ${row('性格 personality', cdf.personality ? `${cdf.personality.length} 字` : 'null')}
            ${row('情景 scenario', cdf.scenario ? `${cdf.scenario.length} 字` : 'null')}
            ${row('开场 first_mes', cdf.first_mes ? `${cdf.first_mes.length} 字` : 'null')}
            ${row('对话示例 mes_example', cdf.mes_example ? `${cdf.mes_example.length} 字` : 'null')}
            ${row('当前会话 chatId', ds.chatId ?? 'null')}
            ${row('扩展键 extensions', Object.keys(cdf.extensions ?? {}).join(', ') || 'null / 空')}
            ${row('data 顶层 Keys', (cdf.ALL_DATA_KEYS ?? []).join(', '))}
            
            <div style="margin-top:10px;">
                <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:4px;">JSON 原始文本：</div>
                <textarea id="st-probe-raw-json" readonly style="width:100%;height:90px;font-size:10px;font-family:ui-monospace,monospace;border:1px solid #e5e7eb;border-radius:8px;padding:6px;box-sizing:border-box;background:#f9fafb;color:#111827;resize:none;">${json}</textarea>
            </div>
        </div>

        <div style="padding:10px 12px;display:flex;gap:8px;border-top:1px solid #f3f4f6;background:#fafafa;flex-shrink:0;">
            <button id="st-probe-download" style="flex:1;padding:10px 0;border:none;border-radius:8px;background:#111827;color:#ffffff;font-size:13px;font-weight:600;cursor:pointer;">下载 JSON 文件</button>
            <button id="st-probe-close" style="flex:1;padding:10px 0;border:1px solid #e5e7eb;background:#ffffff;color:#374151;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;">关闭</button>
        </div>
    `;

    wrap.appendChild(box);
    document.body.appendChild(wrap);

    const close = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        wrap.remove();
        document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    const bindCloseBtn = (el) => {
        if (!el) return;
        el.addEventListener('click', close);
        el.addEventListener('touchend', close);
    };

    bindCloseBtn(box.querySelector('#st-probe-top-close'));
    bindCloseBtn(box.querySelector('#st-probe-close'));

    wrap.addEventListener('click', (e) => {
        if (e.target === wrap) close(e);
    });

    const downloadBtn = box.querySelector('#st-probe-download');
    const handleDownload = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const charName = cdf.name || 'character';
        const ok = downloadJsonFile(`probe_${charName}_${Date.now()}.json`, json);
        if (ok) {
            downloadBtn.textContent = '下载已触发 ✓';
            setTimeout(close, 1000);
        } else {
            downloadBtn.textContent = '下载失败';
        }
    };

    downloadBtn.addEventListener('click', handleDownload);
    downloadBtn.addEventListener('touchend', handleDownload);
}

// ---------- 主流程 ----------
async function run() {
    try {
        if (!_getContext) _getContext = await resolveGetContext();
        if (!_getContext) {
            alert('探针未能获取 SillyTavern 上下文');
            return;
        }
        const data = await collect();
        const json = JSON.stringify(data, null, 2);
        showOverlay(json, data);
    } catch (err) {
        console.error(LOG, '探针执行报错:', err);
        alert('探针出错: ' + (err.message || err));
    }
}

// ---------- 魔法棒 (Extensions Menu / Quick Menu) 极简挂载 ----------
function tryMountMenuButton() {
    if (document.getElementById('st-probe-menu-item')) return true;

    const menuContainer = document.querySelector('#extensionsMenu') || 
                          document.querySelector('#extensions_menu') ||
                          document.querySelector('#extensions_settings');

    if (!menuContainer) return false;

    const item = document.createElement('div');
    item.id = 'st-probe-menu-item';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.style.cssText = 'cursor: pointer; padding: 8px 12px; display: flex; align-items: center;';
    item.innerHTML = `
        <div class="fa-solid fa-magnifying-glass extensionsMenuExtensionButton" style="margin-right: 8px;"></div>
        <span style="font-weight: 600;">测试当前角色 (Probe)</span>
    `;

    const handleClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        run();
    };

    item.addEventListener('click', handleClick);
    item.addEventListener('touchend', handleClick);

    menuContainer.appendChild(item);
    return true;
}

async function boot() {
    _getContext = await resolveGetContext();
    
    // 监听魔法棒点击，点击瞬间执行挂载（零背景轮询，零性能消耗）
    document.addEventListener('click', (e) => {
        if (e.target && (e.target.closest('#extensions_button') || e.target.closest('#extensionsMenuButton') || e.target.closest('.fa-wand-magic-sparkles'))) {
            setTimeout(tryMountMenuButton, 60);
        }
    }, true);

    // 备用斜杠命令
    try {
        if (_getContext?.SlashCommandParser && _getContext?.SlashCommand) {
            _getContext.SlashCommandParser.addCommandObject(
                _getContext.SlashCommand.fromProps({
                    name: 'probe',
                    helpString: '只读探针：获取当前角色全部真实数据',
                    callback: () => { run(); return ''; },
                })
            );
        }
    } catch { /* 忽略 */ }
}

boot();
