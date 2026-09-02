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
        'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.62);display:flex;' +
        'align-items:center;justify-content:center;padding:24px;';

    const box = document.createElement('div');
    box.style.cssText =
        'background:#fff;color:#1c1c1c;border-radius:12px;max-width:920px;width:100%;' +
        'max-height:86vh;display:flex;flex-direction:column;overflow:hidden;' +
        'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;' +
        'box-shadow:0 12px 40px rgba(0,0,0,.35);';

    const tl = data.character_topLevel ?? {};
    const idn = data.identity ?? {};
    const row = (k, v, warn) =>
        `<div style="display:flex;gap:8px;padding:2px 0;">
           <span style="flex:0 0 150px;color:#6b6b6b;">${k}</span>
           <span style="flex:1;word-break:break-all;${warn ? 'color:#b3261e;font-weight:600;' : ''}">${v}</span>
         </div>`;

    box.innerHTML = `
        <div style="padding:14px 18px;border-bottom:1px solid #e5e5e5;display:flex;align-items:center;gap:10px;">
            <strong style="font-size:15px;flex:1;">当前角色探针 · ${data.meta.mode}</strong>
            <button id="st-probe-copy" style="padding:6px 12px;border:1px solid #ccc;background:#fafafa;border-radius:6px;cursor:pointer;font-family:inherit;">复制 JSON</button>
            <button id="st-probe-close" style="padding:6px 12px;border:1px solid #ccc;background:#fafafa;border-radius:6px;cursor:pointer;font-family:inherit;">关闭</button>
        </div>
        <div style="padding:12px 18px;background:#fafafa;border-bottom:1px solid #e5e5e5;font-size:12px;">
            ${row('characterId', `${data.context.characterId} （${data.context.characterId_type}）`, true)}
            ${row('REMINDER', '这是 characters 数组下标，不是稳定 ID', true)}
            ${row('name', idn.name ?? '-')}
            ${row('avatar（文件名）', idn.avatar_file ?? '-')}
            ${row('spec / version', `${tl.spec ?? '-'} / ${tl.spec_version ?? '-'}`)}
            ${row('shallow（惰性加载）', String(tl.shallow ?? false), !!tl.shallow)}
            ${row('chat（会话名）', data.context.chatId ?? '-')}
            ${row('extensions keys', (data.character_data?.extensions_KEYS ?? []).join(', ') || '（空）')}
            ${row('内容指纹', String(idn.content_fingerprint_sha256 ?? '').slice(0, 32) + '…')}
        </div>
    `;

    const pre = document.createElement('pre');
    pre.style.cssText =
        'margin:0;padding:14px 18px;overflow:auto;flex:1;font-size:12px;line-height:1.55;' +
        'white-space:pre-wrap;word-break:break-word;';
    pre.textContent = json;
    box.appendChild(pre);

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
        e.target.textContent = ok ? '已复制 ✓' : '复制失败';
        setTimeout(() => (e.target.textContent = '复制 JSON'), 1500);
    });
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
}

// ---------- 主流程 ----------
async function run() {
    const data = await collect();
    const json = JSON.stringify(data, null, 2);

    console.log(LOG, '=== 当前 Character 完整快照 ===');
    console.log(LOG, data);
    console.log(LOG, '=== 完整 JSON（可右键 → Copy object）===');
    console.log(json);

    showOverlay(json, data);
    try { toastr?.success?.('已输出到 Console 与浮层'); } catch { /* toastr 不可用时静默 */ }
}

// ---------- 挂载 ----------
function mountButton() {
    const host = document.getElementById('extensionsMenu');
    if (!host) return false;
    if (document.getElementById('st-probe-btn')) return true;

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

async function boot() {
    _getContext = await resolveGetContext();
    if (!_getContext) {
        console.error(LOG, '无法解析 getContext()，探针未启动。请确认本扩展安装在 SillyTavern 的 extensions 目录下。');
        return;
    }

    let tries = 0;
    const timer = setInterval(() => {
        if (mountButton() || ++tries > 20) clearInterval(timer);
    }, 500);

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

    console.log(LOG, '探针已加载。设置 → 扩展 → 测试当前角色，或输入 /probe');
}

boot();
