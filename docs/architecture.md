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

单菜定制默认只调用一次 Adaptation Agent，并在前后使用确定性约束解析和校验。只有复杂替换才启用 Culinary Critic 和最多一次修复。

多日菜单规划使用一个父图和两个 LangGraph 子图，共六个 Agent 角色：

```text
父图
  -> 单菜调整子图
       -> 菜谱调整 Agent
       -> 单菜审核 Agent
       -> block 时由调整 Agent 修正一次
  -> 多日规划子图
       -> 家常均衡、采购复用、时间节奏三个 Agent 并行生成组合
       -> 综合评审 Agent 选择候选
       -> block 时由原规划 Agent 重新排列一次
  -> 装配菜谱正文和采购清单
  -> 输出结果
```

单菜子图批量处理用户从社区选入的已有菜谱，负责局部修改食材、厨具、耗时和步骤，并保留原 `post_id`。如果仍有未解决的硬约束，父图直接返回 `needs_input`。

三个规划 Agent 只能返回候选池中的 `post_id` 和日期组合，不能生成新菜或改写菜谱。每天安排 1 至 3 道，同一道菜最多出现一次；综合评审 Agent 负责比较候选，代码负责来源白名单、日期和重复校验。

创建菜单、查询任务和连续修改 API 路径保持不变。任务仍由 PostgreSQL 租约执行器领取和续租，过期任务的恢复方式不变。当前工作流版本为 `meal-plan-v3`，历史单菜日期会在读取时转换成单元素 `dishes`。

## 数据库

`Base.metadata.create_all()` 负责创建新表，`src/forkfit/db/migrations.py` 负责升级已有表。每个迁移只执行一次，版本记录保存在 `schema_migrations`。

## 上线检查

- `/healthz` 返回 `ok`
- `/readyz` 至少 database、redis、executor 为 `ok`
- 生产环境缺少强 `JWT_SECRET`、强 `ADMIN_PASSWORD` 或 `COOKIE_SECURE=true` 时后端拒绝启动
- PostgreSQL 每日备份，本地保留 7 天，异地保留 30 天
- Inline executor 公测建议 `MAX_GLOBAL_CONCURRENT_RUNS=1-2`
