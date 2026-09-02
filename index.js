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

        // 重点 1：characterId 到底是 ID 还是数组下标
        context: {
            characterId: idx,
            characterId_type: typeof idx,
            REMINDER: '官方定义：characterId = characters 数组下标，不是稳定 ID',
            groupId: ctx.groupId ?? null,
            chatId: ctx.chatId ?? null,
            getCurrentChatId: safe(() => ctx.getCurrentChatId()),
            name1: ctx.name1,
            name2: ctx.name2,
        },

        // 重点 2：角色对象顶层字段全集
        character_topLevel: ch == null ? null : {
            avatar: ch.avatar,
            name: ch.name,
            chat: ch.chat,
            fav: ch.fav,
            talkativeness: ch.talkativeness,
            tags: ch.tags,
            spec: ch.spec,
            spec_version: ch.spec_version,
            create_date: ch.create_date,
            date_added: ch.date_added,
            date_last_chat: ch.date_last_chat,
            chat_size: ch.chat_size,
            data_size: ch.data_size,
            shallow: ch.shallow,
            has_json_data: typeof ch.json_data === 'string' && ch.json_data.length > 0,
            json_data_length: ch.json_data?.length ?? 0,
            ALL_TOP_LEVEL_KEYS: Object.keys(ch),
        },

        // 重点 3：卡数据本体
        character_data: ch == null ? null : {
            name: d.name,
            description_len: d.description?.length ?? 0,
            description_preview: cut(d.description, 80),
            personality_len: d.personality?.length ?? 0,
            personality_preview: cut(d.personality, 80),
            scenario_len: d.scenario?.length ?? 0,
            first_mes_len: d.first_mes?.length ?? 0,
            mes_example_len: d.mes_example?.length ?? 0,
            creator: d.creator,
            character_version: d.character_version,
            creator_notes: cut(d.creator_notes, 60),
            system_prompt_len: d.system_prompt?.length ?? 0,
            post_history_instructions_len: d.post_history_instructions?.length ?? 0,
            tags: d.tags,
            alternate_greetings_count: Array.isArray(d.alternate_greetings) ? d.alternate_greetings.length : 0,
            group_only_greetings_count: Array.isArray(d.group_only_greetings) ? d.group_only_greetings.length : 0,
            nickname: d.nickname ?? null,
            source: d.source ?? null,
            creation_date: d.creation_date ?? null,
            modification_date: d.modification_date ?? null,
            assets_count: Array.isArray(d.assets) ? d.assets.length : 0,
            character_book_entries: d.character_book?.entries?.length ?? 0,
            // 重点 4：extensions 里现在有什么
            extensions: d.extensions ?? null,
            extensions_KEYS: Object.keys(d.extensions ?? {}),
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

    const tl = data.character_topLevel ?? {};
    const idn = data.identity ?? {};
    const cd = data.character_data ?? {};

    const row = (k, v, warn) =>
        `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f1f1f1;">
           <span style="flex:0 0 110px;color:#888;font-size:12px;line-height:1.4;">${k}</span>
           <span style="flex:1;word-break:break-all;font-size:13px;line-height:1.45;${warn ? 'color:#c5221f;font-weight:700;' : 'color:#222;'}">${v}</span>
         </div>`;

    box.innerHTML = `
        <div style="padding:16px 18px;border-bottom:1px solid #ececec;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
                <span style="font-size:17px;font-weight:700;">${idn.name ?? '(无角色)'}</span>
                <span style="font-size:11px;color:#fff;background:#7c5cff;padding:2px 9px;border-radius:11px;">${data.meta.mode}</span>
            </div>
            <div style="font-size:11px;color:#999;">SillyTavern 当前角色探针 · 只读</div>
        </div>

        <div style="padding:10px 18px;background:#fafafa;overflow:auto;flex:1;">
            ${row('characterId', `${data.context.characterId} <span style="color:#999">(${data.context.characterId_type})</span>`, true)}
            ${row('⚠ 这是数组下标', '不是稳定 ID，不能用作角色唯一标识', true)}
            ${row('name', idn.name ?? '-')}
            ${row('avatar 文件名', idn.avatar_file ?? '-')}
            ${row('spec / version', `${tl.spec ?? '-'} / ${tl.spec_version ?? '-'}`)}
            ${row('shallow 惰性', String(tl.shallow ?? false), !!tl.shallow)}
            ${row('chat 会话名', data.context.chatId ?? '-')}
            ${row('extensions keys', (cd.extensions_KEYS ?? []).join(', ') || '（空）')}
            ${row('内容指纹', String(idn.content_fingerprint_sha256 ?? '').slice(0, 42) + '…')}
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
