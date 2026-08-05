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

多日计划使用自适应路由：

```text
normalize -> complexity router
  -> guided: one planner -> deterministic validation
  -> team: three strategy planners in parallel
       -> nutrition review + pantry review
       -> menu editor selects one candidate
       -> deterministic validation
       -> at most one repair
```

规划 Agent 负责生成差异化候选，审核 Agent 只评分和指出问题，总编辑只选择；它们不会重复改写同一份答案。价格不属于规划输入或评分目标。

## 数据库

`Base.metadata.create_all()` 负责创建新表，`src/forkfit/db/migrations.py` 负责升级已有表。每个迁移只执行一次，版本记录保存在 `schema_migrations`。

## 上线检查

- `/healthz` 返回 `ok`
- `/readyz` 至少 database、redis、executor 为 `ok`
- 生产环境缺少强 `JWT_SECRET`、强 `ADMIN_PASSWORD` 或 `COOKIE_SECURE=true` 时后端拒绝启动
- PostgreSQL 每日备份，本地保留 7 天，异地保留 30 天
- Inline executor 公测建议 `MAX_GLOBAL_CONCURRENT_RUNS=1-2`
