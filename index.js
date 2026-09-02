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

        // 重点 6：全部角色列表（用于验证下标漂移）
        characters_overview: {
            total: ctx.characters?.length ?? 0,
            list: (ctx.characters ?? []).map((c, i) => ({
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
                name: ctx.chat[0].name,
                is_user: !!ctx.chat[0].is_user,
                text: cut(ctx.chat[0].mes, 60),
            })),
            lastMessage: safe(() => {
                const m = ctx.chat[ctx.chat.length - 1];
                return { name: m.name, is_user: !!m.is_user, text: cut(m.mes, 60) };
            }),
            chatMetadata_KEYS: Object.keys(ctx.chatMetadata ?? {}),
        },
    };
}

// ---------- 输出：浮层 ----------
async function copyText(text) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch { /* 落到兜底 */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px;';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch {
        return false;
    }
}

function showOverlay(json, data) {
    document.getElementById('st-probe-overlay')?.remove();

    const wrap = document.createElement('div');
    wrap.id = 'st-probe-overlay';
    wrap.style.cssText =
        'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;' +
        'align-items:center;justify-content:center;padding:14px;box-sizing:border-box;' +
        'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

    const box = document.createElement('div');
    box.style.cssText =
        'background:#fff;color:#1c1c1c;border-radius:14px;width:100%;max-width:560px;' +
        'max-height:92vh;display:flex;flex-direction:column;overflow:hidden;' +
        'box-shadow:0 14px 44px rgba(0,0,0,.4);box-sizing:border-box;';

    const ds = data.dataSource ?? {};
    const cdf = data.character_data_fields ?? {};

    const row = (k, v, warn) =>
        `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f1f1f1;">
           <span style="flex:0 0 130px;color:#888;font-size:12px;line-height:1.4;">${k}</span>
           <span style="flex:1;word-break:break-all;font-size:13px;line-height:1.45;${warn ? 'color:#c5221f;font-weight:700;' : 'color:#222;'}">${v}</span>
         </div>`;

    box.innerHTML = `
        <div style="padding:16px 18px;border-bottom:1px solid #ececec;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
                <span style="font-size:17px;font-weight:700;">${cdf.name ?? '(无角色)'}</span>
                <span style="font-size:11px;color:#fff;background:#7c5cff;padding:2px 9px;border-radius:11px;">${data.meta.mode}</span>
            </div>
            <div style="font-size:11px;color:#999;">SillyTavern 当前角色探针 · 只读</div>
        </div>

        <div style="padding:10px 18px;background:#fafafa;overflow:auto;flex:1;">
            ${row('数据来源表达式', ds.sourceExpression ?? 'ctx.characters[ctx.characterId]', true)}
            ${row('characterId 实测值', `${ds.characterId_rawValue} <span style="color:#999">(类型: ${ds.characterId_type})</span>`, true)}
            ${row('是否为数组索引', ds.isIndexConfirmed ? '是（数字索引）' : '否', true)}
            ${row('name', cdf.name ?? '-')}
            ${row('avatar 文件名', idn.avatar_file ?? '-')}
            ${row('description 长度', cdf.description ? `${cdf.description.length} 字` : 'null')}
            ${row('personality 长度', cdf.personality ? `${cdf.personality.length} 字` : 'null')}
            ${row('scenario 长度', cdf.scenario ? `${cdf.scenario.length} 字` : 'null')}
            ${row('first_mes 长度', cdf.first_mes ? `${cdf.first_mes.length} 字` : 'null')}
            ${row('mes_example 长度', cdf.mes_example ? `${cdf.mes_example.length} 字` : 'null')}
            ${row('chat 会话名', ds.chatId ?? '-')}
            ${row('extensions 键列表', (Object.keys(cdf.extensions ?? {})).join(', ') || 'null / 空')}
            ${row('data 顶层 Keys', (cdf.ALL_DATA_KEYS ?? []).join(', '))}
            ${row('内容指纹 (SHA256)', String(idn.content_fingerprint_sha256 ?? '').slice(0, 32) + '…')}
        </div>

        <div style="padding:10px 14px;display:flex;gap:10px;border-top:1px solid #ececec;">
            <button id="st-probe-copy" style="flex:1;padding:12px 0;border:none;border-radius:10px;background:#7c5cff;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">复制完整 JSON</button>
            <button id="st-probe-close" style="flex:1;padding:12px 0;border:1px solid #ddd;background:#fff;color:#444;border-radius:10px;font-size:14px;cursor:pointer;">关闭</button>
        </div>
    `;

    wrap.appendChild(box);
    document.body.appendChild(wrap);

    const close = () => {
        wrap.remove();
        document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    box.querySelector('#st-probe-close').addEventListener('click', close);
    box.querySelector('#st-probe-copy').addEventListener('click', async (e) => {
        const ok = await copyText(json);
        e.target.textContent = ok ? '已复制 ✓' : '复制失败，看 Console';
        if (ok) setTimeout(close, 700);
        else setTimeout(() => (e.target.textContent = '复制完整 JSON'), 1800);
    });
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
}

// ---------- 主流程 ----------
async function run() {
    const data = await collect();
    const json = JSON.stringify(data, null, 2);

    console.log(LOG, '=== 当前 Character 完整快照 ===');
    console.log(LOG, data);
    console.log(LOG, '=== 完整 JSON ===');
    console.log(json);

    // 弹浮窗展示（手机友好），浮窗内提供「复制完整 JSON」按钮
    showOverlay(json, data);
    try { toastr?.info?.('当前角色探针已显示，点「复制完整 JSON」后粘贴发我', '', { timeOut: 6000 }); } catch { /* 静默 */ }
}

// ---------- 挂载 ----------
// 不同版本的 SillyTavern 容器 id 不一样，依次尝试
const HOST_SELECTORS = ['#extensions_settings', '#extensionsMenu'];

function mountButton() {
    if (document.getElementById('st-probe-btn')) return true;

    let host = null;
    for (const sel of HOST_SELECTORS) {
        host = document.querySelector(sel);
        if (host) break;
    }
    if (!host) return false;

    const item = document.createElement('div');
    item.id = 'st-probe-btn';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.innerHTML = `
        <div class="fa-solid fa-magnifying-glass extensionsMenuExtensionButton"></div>
        <span>测试当前角色</span>`;
    item.addEventListener('click', run);
    host.appendChild(item);
    return true;
}

// 浮动按钮：确保任何页面都可见可点（玩家一般不用斜杠命令，也不一定会去扩展面板找）
function mountFloatingButton() {
    if (document.getElementById('st-probe-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'st-probe-fab';
    fab.textContent = '🔍 测试当前角色';
    fab.style.cssText =
        'position:fixed;left:14px;bottom:64px;z-index:99998;border:none;' +
        'background:#7c5cff;color:#fff;padding:12px 16px;border-radius:24px;' +
        'font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.32);' +
        'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
    fab.addEventListener('click', run);
    document.body.appendChild(fab);
}

async function boot() {
    _getContext = await resolveGetContext();
    mountFloatingButton();
    if (!_getContext) {
        console.error(LOG, '无法解析 getContext()，探针未启动。请确认本扩展安装在 SillyTavern 的 extensions 目录下。');
        return;
    }

    // 扩展面板是懒渲染的（点开才生成 DOM），用 MutationObserver 等它出现
    if (!mountButton()) {
        const observer = new MutationObserver(() => {
            if (mountButton()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 60000);
    }

    // 备用入口：聊天框输入 /probe
    try {
        const ctx = _getContext();
        ctx.SlashCommandParser.addCommandObject(
            ctx.SlashCommand.fromProps({
                name: 'probe',
                helpString: '打印当前 Character 的全部字段到 console（只读，不写卡）',
                callback: () => { run(); return ''; },
            }),
        );
    } catch (e) {
        console.warn(LOG, 'slash 命令注册失败，可只用按钮：', e?.message || e);
    }

    console.log(LOG, '探针已加载。扩展面板 → 测试当前角色，或输入 /probe');
    try {
        toastr?.info?.('探针已就绪：扩展面板里点「测试当前角色」，或在聊天框输入 /probe', '', { timeOut: 8000 });
    } catch { /* toastr 不可用时静默 */ }
}

boot();
