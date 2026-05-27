# 外链观影房间方案（B 站 / 优酷 / 腾讯视频）

> 状态：方案讨论稿，**暂不实现**  
> 日期：2026-05-27  
> 关联：`2026-05-24-private-watch-party-design.md`（自托管 HLS 同步观影）

## 1. 背景与目标

Shareus 当前能力：管理员上传片源 → 转码 HLS → 私密房间 → **强同步**播放 + 聊天。

本产品为**私人用途**（与远方朋友偶尔一起看电影），不面向商业化。用户希望在不放弃「Shareus 房间体验」（密码房间、聊天、浮窗提醒等）的前提下，也能在房间内观看 **B 站、优酷、腾讯视频** 等外链内容。

### 1.1 本方案明确的前提

| 前提 | 说明 |
|------|------|
| 不需要同步 / 自由模式 | 不要求 play/pause/seek 强同步；各看各的进度可接受 |
| 成本不是问题 | 可接受额外开发、运维、浏览器扩展等 |
| 版权不面向商业化 | 仅限私人两人使用，不公开传播 |
| 双方均有 VIP | 希望尽量以 VIP 清晰度观看，需单独设计登录态方案 |

### 1.2 目标（按优先级）

1. **P0**：在 Shareus 房间页内嵌第三方播放器（iframe），保留聊天与房间壳
2. **P1**：进房流程中对 VIP 登录给出清晰指引，尽量提高 embed 内 VIP 成功率
3. **P2**：可选地展示双方「当前进度」（只读、弱同步），不控制对方播放器
4. **非目标（本方案 Phase 1）**：解析盗链、服务端代理 m3u8、DRM 破解、精确控播同步

---

## 2. 方案总览

采用 **分阶段** 策略，避免一次性投入在不稳定能力上。

```
Phase 1（推荐先做）
  外链房间 + iframe embed + 聊天
  └── 无自动进度同步；VIP 靠「主站先登录」指引

Phase 2（若 Phase 1 VIP / 进度不满足）
  Chrome 扩展 + Shareus Socket
  └── 在平台原页读取 video.currentTime，上报房间
  └── VIP 100% 走平台原页登录态

Phase 3（可选，维护成本高）
  服务端解析 + 自托管播放
  └── 仅作 fallback，不作为主路径
```

**推荐主路径**：Phase 1 → 实测 VIP 与 embed 覆盖率 → 再决定是否做 Phase 2。

---

## 3. 与现有架构的关系

### 3.1 房间类型（双轨制）

现有房间绑定 `videoId`（GCS HLS），走 `SyncedHlsPlayer` + Socket 播放同步。

新增 **`sourceType`**，两种房间并存、互不影响：

| sourceType | 播放 | 同步 | 转码 |
|------------|------|------|------|
| `hosted` | 自托管 HLS（现状） | ✅ 强同步 + 自由模式 | 需要 |
| `external` | 第三方 iframe embed | ❌ 无播放同步 | 不需要 |

### 3.2 数据模型扩展（Firestore `rooms`）

在现有 `RoomRecord` 上扩展，**向后兼容**（旧房间默认为 `hosted`）：

```ts
interface RoomRecord {
  id: string;
  sourceType: "hosted" | "external";   // 新增，默认 hosted
  videoId: string | null;              // hosted 必填；external 为 null
  externalSource: ExternalSource | null; // external 必填
  passwordHash: string;
  status: "open" | "closed";
  playbackState: PlaybackState | null; // external 房间恒为 null，不写
  createdAt: string;
  updatedAt: string;
}

interface ExternalSource {
  platform: "bilibili" | "youku" | "tencent";
  originalUrl: string;       // 用户粘贴的原始链接
  canonicalId: string;       // 如 BV 号、优酷 vid、腾讯 vid
  embedUrl: string;          // 规范化后的 iframe src
  title?: string;            // 可选，解析或手动填写
  page?: number;             // B 站分 P，默认 1
}
```

### 3.3 Socket 行为

| 事件 / 能力 | hosted 房间 | external 房间 |
|-------------|-------------|---------------|
| `playback:*` 同步 | ✅ | ❌ 不注册 / 忽略 |
| `chat:message` | ✅ | ✅ |
| `watch:log` | ✅ | ✅（可选，仅聊天相关） |
| `external:progress`（Phase 2） | — | ✅ 只读进度上报 |

---

## 4. 平台支持与 embed 规范

### 4.1 URL 识别与 embed 模板

| 平台 | 识别示例 | embed URL 模板（示意） |
|------|----------|------------------------|
| B 站 | `bilibili.com/video/BV…` | `https://player.bilibili.com/player.html?bvid={bvid}&page={p}&high_quality=1&danmaku=0` |
| 优酷 | `v.youku.com/v_show/id_….html` | `https://player.youku.com/embed/{vid}` |
| 腾讯 | `v.qq.com/x/cover/…/….html` | `https://v.qq.com/txp/iframe/player.html?vid={vid}` |

实现时在 `packages/shared` 增加 `parseExternalVideoUrl(url): ExternalSource | null`，单元测试覆盖常见 URL 形态。

### 4.2 平台能力矩阵（预期，需实测校准）

| 能力 | B 站 | 优酷 | 腾讯视频 |
|------|------|------|----------|
| 公开免费片 embed | ✅ 较好 | ⚠️ 部分禁止外链 | ⚠️ 限制较多 |
| VIP 清晰度（embed） | ⚠️ 依赖 Cookie | ⚠️ 更不稳定 | ❌ 经常失败 |
| iframe 内登录 | ⚠️ 体验差 | ⚠️ | ❌ 常见 |
| 移动端 iframe | ⚠️ 可用但弱于桌面 | ⚠️ | ⚠️ |
| 官方第三方进度 API | ❌ | ❌ | ❌ |

### 4.3 embed 失败时的降级 UX

当 iframe 加载失败、空白、或显示「禁止嵌入」时，房间页展示：

1. 错误说明（非 Shareus 故障，是平台策略）
2. **「在 B 站 / 优酷 / 腾讯打开原页」** 按钮（`target="_blank"`）
3. 聊天继续使用，形成「Link Party + 房间聊天」降级

---

## 5. VIP 登录策略

### 5.1 问题本质

embed 播放器运行在 `player.bilibili.com` 等域名，但嵌套在 Shareus 域名下。浏览器将 iframe 内登录态视为 **第三方 Cookie / 跨站上下文**，Chrome 逐步禁用第三方 Cookie，Safari ITP 更严格，导致：

- 用户在主站已登录 VIP，embed 内仍可能显示非 VIP 清晰度或要求重新登录
- 腾讯视频 VIP 在 embed 中成功率 **最低**

### 5.2 Phase 1：尽力而为（零额外开发）

**进房引导（房间页顶部 Banner，可关闭）**：

```
观看 VIP 内容建议：
1. 先在 [平台名] 官网登录你的 VIP 账号（勿用无痕模式）
2. 使用 Chrome 桌面浏览器打开本房间
3. 若仍非 VIP 清晰度，请点「在原站打开」
```

**管理端创建外链房间时**同步展示相同说明。

不做 Cookie 注入、不做服务端代登录。

### 5.3 Phase 2：可靠 VIP（推荐若 Phase 1 不满意）

**Chrome 扩展（仅你们两人安装）**：

- Content script 注入 `bilibili.com` / `youku.com` / `v.qq.com`
- 用户在 **平台原页** 观看（VIP 登录态 100% 由平台负责）
- 扩展读取 `video.currentTime`、`paused`，经 Socket 上报 Shareus 房间
- Shareus 房间 UI：左侧/顶部保留聊天；主区域可显示「已在原站播放」+ 双方进度条

Shareus 网页可提供「复制 BV 号 / 一键打开原页」Deep link，扩展检测到同房间 ID 后自动关联。

### 5.4 明确不做

- 用户在 Shareus 输入平台账号密码（安全风险极高）
- 服务端存储 / 注入平台 Cookie 批量拉流（易过期、违反平台 ToS、维护地狱）
- 破解 DRM 播腾讯 VIP 正片

---

## 6. 进度同步策略

### 6.1 Phase 1：纯 embed —— 无法自动读进度

跨域 iframe 内 `<video>` 的 `currentTime` **无法被 Shareus 读取**。B 站 / 优酷 / 腾讯 **未提供** 类似 YouTube IFrame Player API 的公开 `postMessage` 接口。

Phase 1 不提供自动进度，可选 **纯手动**：

- 聊天里口头对齐
- 或简单按钮「报进度」：用户手动输入 `23:15` 发送到房间（无播放器联动）

### 6.2 Phase 2：只读弱同步（推荐若需要「看见对方进度」）

```
Viewer A（B 站原页 + 扩展）──Socket──► Shareus Room ◄──Socket── Viewer B
                                      │
                              UI: Alice 23:10 · Bob 23:08
```

| 能力 | 支持 |
|------|------|
| 展示双方 currentTime | ✅ |
| 自动 seek 对齐 | ❌ |
| 播放/暂停同步 | ❌ |
| 自由模式式 drift 校正 | ❌ |

Socket 事件草案：

```ts
// Client → Server → Room
external:progress {
  roomId: string;
  nickname: string;
  platform: string;
  currentTimeSec: number;
  durationSec: number | null;
  isPlaying: boolean;
  reportedAt: string;
}
```

房间页在 `external` 类型下渲染 **PeerProgressChips**（复用现有 UI 思路，数据源改为扩展上报而非 `playback:peer-progress`）。

上报频率：每 3–5 秒 + `timeupdate` 节流，与现有 free 模式类似。

### 6.3 Phase 3：解析自播（不推荐优先）

后端 `yt-dlp` / 自研解析 + 用户 Cookie → 返回可播 URL → 前端 `<video>` 自播。

- **优点**：可读 `currentTime`，VIP Cookie 有效时清晰度可控
- **缺点**：接口频繁变更、Cookie 过期、腾讯 DRM 仍失败、运维负担重

仅当 Phase 1 + 2 均不可接受时评估。

---

## 7. 前端设计

### 7.1 新组件

| 组件 | 职责 |
|------|------|
| `ExternalEmbedPlayer` | 渲染 iframe + 加载态 + 失败降级 |
| `ExternalSourceBanner` | VIP 登录指引 + 原站打开链接 |
| `ExternalProgressBar` | Phase 2：展示双方只读进度 |

### 7.2 房间页分支（`app/room/[roomId]/page.tsx`）

```tsx
{room.sourceType === "hosted" ? (
  <>
    <SyncedHlsPlayer ... />
    <RoomControls ... />  // 同步 / 自由 / 日志
  </>
) : (
  <>
    <ExternalSourceBanner source={room.externalSource} />
    <ExternalEmbedPlayer embedUrl={room.externalSource.embedUrl} />
    {/* 不渲染 RoomControls 中的同步相关 UI */}
    <ExternalProgressBar ... />  // Phase 2
  </>
)}
<ChatPanel ... />  // 两种房间共用
```

### 7.3 布局

与现有一致：桌面播放器 + 侧栏聊天；移动端播放器上、聊天下。外链房间 **隐藏** 同步控制面板、host 切换、观看日志（或仅保留极简房间状态）。

### 7.4 管理端

「创建房间」增加 Tab 或选项：

- **自托管视频**（现状）：选择 `videoId`
- **外链视频**：粘贴 URL → 预览 embed → 确认创建

列表展示 `sourceType` 标签（自托管 / B 站 / …）。

---

## 8. API 设计

### 8.1 新增 / 变更端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/admin/rooms/external` | 创建外链房间（admin） |
| `POST` | `/api/admin/external/parse` | 解析 URL，返回 `ExternalSource` 预览（admin） |
| `GET` | `/api/rooms/:roomId` | join 响应增加 `sourceType`、`externalSource` |

hosted 房间创建逻辑不变。

### 8.2 Join 响应扩展

```json
{
  "roomId": "room_xxx",
  "sourceType": "external",
  "externalSource": {
    "platform": "bilibili",
    "originalUrl": "https://www.bilibili.com/video/BV1xx...",
    "canonicalId": "BV1xx",
    "embedUrl": "https://player.bilibili.com/player.html?...",
    "title": "可选标题"
  },
  "videoId": null,
  "playbackState": null
}
```

外链房间 **不** 提供 `/playlist.m3u8`。

---

## 9. 安全与隐私

- 外链房间 **不经过 Shareus 服务器转发视频流**，仅存储 URL 元数据
- 不收集、不存储平台账号或 Cookie
- 房间仍为密码保护，invite link + room password
- Phase 2 扩展仅向 **已加入房间的 Socket** 上报进度，不上传观看历史到第三方

---

## 10. 风险与限制（对用户透明）

需在 UI 或文档中说明：

1. **不是所有链接都能 embed**（UP 主关闭嵌入、平台版权策略）
2. **VIP 在 embed 内不保证生效**（浏览器与平台策略）
3. **iPhone 上 iframe 体验弱于桌面**（全屏、清晰度、登录）
4. **无自动进度同步**（Phase 1）；Phase 2 需安装扩展且主要为 Chrome 桌面
5. **广告、平台 UI** 无法去除
6. 平台改版可能导致 URL 解析或 embed 模板失效，需偶尔维护 `parseExternalVideoUrl`

---

## 11. 分阶段实施计划

### Phase 1：外链 embed 房间（预估 2–4 天）

- [ ] `ExternalSource` 类型与 URL 解析（shared + 单测）
- [ ] Firestore / API：创建外链房间、join 返回扩展字段
- [ ] 管理端：粘贴 URL 创建房间
- [ ] `ExternalEmbedPlayer` + 房间页分支
- [ ] VIP 指引 Banner + 原站打开降级
- [ ] 外链房间禁用 Socket 播放同步
- [ ] 文档更新

**验收**：两人进外链 B 站房间，能 embed 播放（公开片），聊天正常，无同步 UI。

### Phase 2：扩展 + 只读进度（预估 3–5 天）

- [ ] Socket `external:progress` 事件
- [ ] 房间页 `ExternalProgressBar`
- [ ] Chrome 扩展 MVP（B 站优先）
- [ ] Shareus 页「打开原页并关联房间」流程

**验收**：两人 Chrome + 扩展 + B 站原页 VIP 播放，房间可见双方进度，聊天正常。

### Phase 3：优酷 / 腾讯扩展适配（按需）

- [ ] 各站 DOM / 播放器差异适配
- [ ] embed 解析器补充 edge case

---

## 12. 测试策略

### 单元测试

- URL 解析：B 站 BV / av、优酷、腾讯常见链接、非法 URL
- 房间创建：`external` 字段校验、`hosted` 回归

### 手动验收（Phase 1）

| 场景 | 预期 |
|------|------|
| B 站公开番剧 embed | 可播放 |
| B 站禁止嵌入的视频 | 降级原站打开 + 聊天可用 |
| 主站先登录 B 站 VIP 再进房 | 记录是否 1080P（**记录实测结果，非 blocking**） |
| iPhone Safari embed | 记录可用性 |
| hosted 房间回归 | 同步 / 自由模式不受影响 |

### 手动验收（Phase 2）

| 场景 | 预期 |
|------|------|
| B 站原页 VIP + 扩展 | 双方进度在房间可见 |
| 仅一人装扩展 | 一人自动、一人手动或仅显示一方进度 |

---

## 13. 决策记录

| 决策 | 理由 |
|------|------|
| 默认 iframe，非解析流 | 不播流、维护低、符合「只要在房间里看」 |
| 不做 Phase 1 自动进度 | 跨域限制，无官方 API |
| VIP 不做服务端 Cookie | 安全与稳定性 |
| Phase 2 用扩展而非 Tampermonkey 脚本 | 可维护、可固定 room 关联逻辑 |
| 与 hosted 房间双轨并存 | 不破坏现有电影同步观影核心能力 |

---

## 14. 开放问题（实现前确认）

1. **Phase 1 是否只做 B 站**，优酷 / 腾讯后续再加？
2. **外链房间是否也需要「仅 lufy 可建」**，还是管理员均可？
3. **Phase 2 扩展**是否接受「仅 Chrome 桌面」约束？
4. 是否需要 **手动片名** 字段，便于房间列表识别「今晚看啥」？

---

## 15. 相关文件（实现时预计改动）

| 区域 | 文件 |
|------|------|
| 类型 / 解析 | `packages/shared/src/externalVideo.ts` |
| 房间模型 | `apps/api/src/rooms/room.model.ts` |
| 房间 API | `apps/api/src/rooms/room.routes.ts`、`room.service.ts` |
| Socket | `apps/api/src/rooms/room.socket.ts`（external 分支） |
| 管理端 | `apps/web/components/RoomManager.tsx` 或新建创建向导 |
| 房间页 | `apps/web/app/room/[roomId]/page.tsx` |
| 新组件 | `ExternalEmbedPlayer.tsx`、`ExternalSourceBanner.tsx` |
| Phase 2 | `extensions/shareus-bridge/`（新目录，待定） |
