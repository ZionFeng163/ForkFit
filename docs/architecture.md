# ForkFit 当前架构

## 运行拓扑

当前线上以 VPS 实际部署为准：

- `nginx`: 对外 HTTPS，反代到前端和 `/api/backend`
- `frontend`: Next.js 服务，监听 `127.0.0.1:3001`
- `backend`: FastAPI 服务，监听 `127.0.0.1:8000`
- `postgres`: PostgreSQL 16，本机内网
- `redis`: 缓存和限流，本机内网
- `inline executor`: 单菜定制任务执行器
- `meal plan executor`: 多日计划的 PostgreSQL 租约任务执行器

根目录 `docker-compose.yml` 仅用于本地开发，保持同样的 frontend/backend/postgres/redis 结构。Kafka executor、consumer 和相关配置已经删除；未来需要扩容时再基于实际指标重新选型。

## 数据流

1. 单菜定制写入 `runs`，多日计划写入 `meal_plans`，API 都立即返回 id。
2. 执行器通过 PostgreSQL `FOR UPDATE SKIP LOCKED` 领取任务并续租。
3. 每个阶段更新数据库中的 stage、progress 或 trace。
4. 前端轮询状态；进程重启后，过期 lease 会重新排队。
5. 硬约束无法安全满足时进入 `needs_input`，不会让 LLM 自行保证安全。

## Agent 流程

单菜调整不再由正则表达式理解用户要求，也不再由程序预先决定要检索什么。审核 Agent 先理解自然语言限制并检查原菜谱；需要修改的菜谱最多四路并行进入调整 Agent。调整 Agent 在需要替换食材时自主调用专用检索工具，程序应用结构化补丁后，所有发生修改的菜谱都由同一个审核 Agent 复核。复核失败只允许原调整 Agent 修复一次，过敏原和饮食禁忌最后再由代码做安全兜底。

多日菜单规划使用一个父图和两个 LangGraph 子图，共六个 Agent 角色：

```text
父图
  -> 单菜调整子图
       -> 单菜审核 Agent：理解用户限制并检查原菜谱
       -> 菜谱调整 Agent：并行调整，按需调用替代食材检索
       -> 单菜审核 Agent：复核全部修改结果
       -> block 时由调整 Agent 修正一次
  -> 多日规划子图
       -> 家常均衡、采购复用、时间节奏三个 Agent 并行生成组合
       -> 综合评审 Agent 选择候选
       -> block 时由原规划 Agent 重新排列一次
  -> 装配菜谱正文和采购清单
  -> 输出结果
```

单菜子图批量处理用户从社区选入的已有菜谱，负责局部修改食材、厨具、耗时和步骤，并保留原 `post_id`。替代食材工具只向调整 Agent 开放，参数使用受限 Schema；关键词召回与候选级向量召回通过 RRF 融合，再按过敏原过滤。程序记录本轮工具返回值，涉及过敏或饮食禁忌的替换只能使用这些候选。工具审计只记录 Agent、工具名、耗时、状态、结果数量和脱敏参数，不保存完整业务数据。如果仍有未解决的硬约束，父图直接返回 `needs_input`。

三个规划 Agent 只能返回候选池中的 `post_id` 和日期组合，不能生成新菜或改写菜谱。每天安排 1 至 3 道，同一道菜最多出现一次；综合评审 Agent 负责比较候选，代码负责来源白名单、日期和重复校验。

创建菜单、查询任务和连续修改 API 路径保持不变。任务仍由 PostgreSQL 租约执行器领取和续租，过期任务的恢复方式不变。当前单菜工作流版本为 `recipe-adaptation-v3`，菜单工作流版本为 `meal-plan-v4`；`meal-plan-v3` 仍允许连续修改，历史单菜日期会在读取时转换成单元素 `dishes`。

## 职责边界

- 审核 Agent：自然语言约束理解、修改前问题识别、修改后菜谱语义复核。
- 调整 Agent：最小补丁生成和替代食材工具调用；最多三轮模型交互、八次工具调用。
- 规划 Agent：只组合候选池中的菜谱编号，不改菜谱正文。
- 程序：Schema、补丁目标、工具候选来源、天数、数量、来源、重复、租约、状态和安全兜底。
- 历史 `evidence` 字段只为旧任务读取保留，新流程不再生成证据编号或维护人工条目白名单。

## 数据库

`Base.metadata.create_all()` 负责创建新表，`src/forkfit/db/migrations.py` 负责升级已有表。每个迁移只执行一次，版本记录保存在 `schema_migrations`。

## 上线检查

- `/healthz` 返回 `ok`
- `/readyz` 至少 database、redis、executor 为 `ok`
- 生产环境缺少强 `JWT_SECRET`、强 `ADMIN_PASSWORD` 或 `COOKIE_SECURE=true` 时后端拒绝启动
- PostgreSQL 每日备份，本地保留 7 天，异地保留 30 天
- Inline executor 公测建议 `MAX_GLOBAL_CONCURRENT_RUNS=1-2`
