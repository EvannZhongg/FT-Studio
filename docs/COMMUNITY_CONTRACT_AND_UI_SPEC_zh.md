# FT Engine 用户与社区产品边界

> 本文只定义用户/社区产品边界。桌面布局和比赛交互见 [UI 交互规范](./UI_INTERACTION_SPEC_zh.md)，服务实现见 [Django 用户服务](./BACKEND_DJANGO_zh.md)，工程进度见 [路线 B](./REFACTOR_PLAN_ROUTE_B_zh.md)。

## 1. 基本原则

- 本地赛事、计分、复盘和导出不要求登录。
- 登录只用于账号资料、跨设备会话和未来社区能力。
- 用户服务或网络不可用时，本地功能不能降级或被登录墙阻断。
- 社区未实现时通过功能开关隐藏导航和发布入口，不展示空 Feed 或“敬请期待”页。
- 本地赛事 SQLite 与服务端用户 PostgreSQL 是两个独立数据域，不做隐式同步。自由模式和赛事模式的本地流程不因账号服务变化；本地存储与 UI 模式分流见 [当前架构](./ARCHITECTURE_CURRENT_zh.md) 和 [UI 交互规范](./UI_INTERACTION_SPEC_zh.md)。

## 2. 桌面账号边界

~~~text
Renderer
  -> typed account IPC
Electron Main AuthService
  ├─ DevMockCommunityGateway
  ├─ HttpCommunityGateway
  └─ SecureTokenStore
~~~

Renderer 可获得：登录状态、用户 ID、邮箱、显示名、头像 URL、简介、语言和会话摘要。Renderer 不得获得 Access Token、Refresh Token、密码哈希或服务端内部错误。

账号 IPC 至少包含：

| 能力 | 说明 |
| --- | --- |
| 获取会话 | 返回未登录、Mock 登录、真实登录或离线缓存状态 |
| 登录/退出 | 由 Main 调用 Gateway 并维护安全存储 |
| 获取/更新资料 | 第一阶段支持显示名、简介和语言 |
| 管理会话 | 查看并撤销登录设备 |
| 会话变化事件 | 登录、退出、刷新失败或撤销时通知 Renderer |

## 3. 开发 Mock

开发环境可以显式启用 Mock Gateway，用于在 Django 尚未启动时验证桌面账号 UI。Mock 不能成为正式构建的隐式回退。

- 只有 `development` 构建和显式配置同时满足时启用。
- 测试用户可以登录、退出和编辑本地 Mock 资料。
- Mock 用户不能真实发布，相关调用返回稳定的 `COMMUNITY_NOT_AVAILABLE`。
- 正式包必须拒绝 Mock 配置；Mock 密码和 Token 不写日志。

## 4. 用户资料体验

未登录时显示紧凑登录页，并明确“本地赛事无需登录”。已登录后允许编辑显示名、简介和语言，查看登录设备和本地赛事统计。邮箱是身份字段，第一期不在普通资料表单中修改。

离线时显示最后缓存的非敏感资料和离线标记；允许查看本地统计，不静默排队资料修改。Token 刷新失败不能把用户从计分页或复盘页重定向到登录。

侧栏底部始终保留用户摘要入口：未登录显示本地用户，已登录显示头像和昵称。详细布局见 [UI 交互规范](./UI_INTERACTION_SPEC_zh.md)。

## 5. 社区预留

第一阶段不实现帖子，只保留：

- `/community` 路由能力和远端功能开关，但关闭时不注册可见导航。
- 帖子摘要、详情、创建输入的版本化共享契约目录。
- 本地分享草稿与上传任务的 SQLite 表和 application service 接口。
- 从复盘创建分享草稿的入口，不自动上传原始赛事数据。

未来帖子只允许受限 Markdown、规范化媒体链接、图片和明确选择的计分快照，不接受任意 HTML。上传失败只改变上传任务，不改变本地 Competition 或 MatchSession 状态。

## 6. 权限矩阵

| 功能 | 未登录 | Mock 用户 | 真实用户 |
| --- | --- | --- | --- |
| 工作台、赛事、计分 | 允许 | 允许 | 允许 |
| 复盘和导出 | 允许 | 允许 | 允许 |
| 查看本地统计 | 允许 | 允许 | 允许 |
| 修改账号资料 | 需登录 | 本地 Mock | 允许 |
| 管理服务端会话 | 需登录 | Mock 数据 | 允许 |
| 发布分享 | 需登录 | 不可发布 | 功能上线后允许 |

登录守卫只应用于云端操作，不应用于整个桌面应用。

## 7. 上线门槛

- Renderer 不持有 Token，也不直接调用 Django。
- 服务不可用、未登录和断网均不影响完整本地赛事流程。
- Mock 无法在正式包启用。
- 社区关闭时没有不可用入口，复盘仍保留本地导出。
- 真实 Gateway 替换 Mock 时不重写 Renderer 页面。
- 服务端 API、错误码和安全要求以 [Django 用户服务](./BACKEND_DJANGO_zh.md) 为准。
