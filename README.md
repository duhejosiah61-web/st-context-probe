# st-context-probe · 当前角色探针

一个 **只读** 的 SillyTavern 扩展，用来回答一个问题：

> 酒馆 Extension 到底能拿到「当前正在聊天的 Character」的哪些数据？

不写角色卡、不保存任何东西、不联网。唯一副作用是往页面插一个临时浮层，关掉就没了。

---

## 安装

### 方式一：URL 安装（推荐）

1. 把这个仓库 push 到 GitHub / Gitee
2. SillyTavern → 扩展面板（顶部拼图图标）→ **安装扩展**
3. 填入仓库地址，例如 `https://github.com/你的用户名/st-context-probe`
4. 点安装 → **重启 SillyTavern**

> ⚠️ `manifest.json` 必须在**仓库根目录**。SillyTavern 是 `git clone` 整个仓库后直接在根目录找 `manifest.json`，**不支持子目录**。
> ⚠️ URL 安装需要本机装有 **Git**（`git-scm.com`），否则会失败。

### 方式二：手动安装

把整个文件夹复制到下面任一位置，然后重启 SillyTavern：

- 全局（所有用户）：`SillyTavern/public/scripts/extensions/third-party/st-context-probe/`
- 单用户：`SillyTavern/data/<用户名>/extensions/st-context-probe/`

扩展会自动适配这三种安装位置，不需要改代码。

---

## 使用

- **扩展面板 → 「测试当前角色」**
- 或在聊天框输入 **`/probe`**

按 **F12** 打开 Console 可以看到完整对象，页面上也会弹出浮层（可一键复制 JSON）。

---

## 重点看这 7 组字段

| 字段 | 看什么 | 为什么重要 |
|---|---|---|
| `context.characterId` | 是不是**数字** | 数字 = 数组下标，不是稳定 ID，不能用作身份标识 |
| `character_topLevel.avatar` | 是不是 `"XXX.png"` | 这是 SillyTavern 事实上的主键 |
| `character_topLevel.shallow` | 是否 `true` | true = 开了惰性加载，`data` 是**残缺子集** |
| `character_topLevel.spec` | `chara_card_v2` / `chara_card_v3` | 决定能拿到哪些字段 |
| `character_data.extensions_KEYS` | 有哪些 key | 看酒馆往 extensions 里塞了什么 |
| `ALL_TOP_LEVEL_KEYS` / `ALL_DATA_KEYS` | 完整 key 列表 | 文档没写的隐藏字段都在这 |
| `identity.content_fingerprint_sha256` | 指纹值 | 跨重导入仍稳定的身份依据 |

---

## 建议做的两个验证

**① 下标漂移验证**

1. 点探针，记下 `characterId`
2. 导入一张**新的角色卡**
3. 回到原角色，再点探针
4. `characterId` 变了 → 证实它是数组下标，不可用

**② 会话字段验证**

同一个角色切换聊天记录，`chatId` / `chat` 会跟着变 —— 说明它标识的是**对话**，不是角色。

---

## 安全声明

- ❌ 不调用 `writeExtensionField`，角色卡一个字节都不会改
- ❌ 不写 localStorage / IndexedDB / 服务端
- ❌ 不联网、不连接任何外部程序
- ✅ 只在页面插临时浮层，关闭或按 ESC 即完全移除

`probe_capability` 那一段只是**检测** API 在不在，不会执行写入。
