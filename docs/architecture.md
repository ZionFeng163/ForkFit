# ForkFit 当前架构

## 运行拓扑

当前线上以 VPS 实际部署为准：

- `nginx`: 对外 HTTPS，反代到前端和 `/api/backend`
- `frontend`: Next.js 服务，监听 `127.0.0.1:3001`
- `backend`: FastAPI 服务，监听 `127.0.0.1:8000`
- `postgres`: PostgreSQL 16，本机内网
- `redis`: 缓存、限流、轻量队列状态，本机内网
- `inline executor`: 小规模公测默认任务执行器

根目录 `docker-compose.yml` 仅用于本地开发，保持同样的 frontend/backend/postgres/redis 结构。Kafka/worker 不再是默认部署服务，只作为未来扩容方向保留在代码能力里。

## 数据流

1. FastAPI 创建 `runs` 记录，立即返回 run id。
2. Inline executor 在后端进程内运行 `ForkFitLangGraphWorkflow`。
3. 每个 graph 节点完成后更新数据库 trace。
4. 前端轮询 run 状态，并显示排队位置、预计等待时间和用户可读阶段。
5. 任务需要人工替代时进入 `needs_input`，用户选择后更新原输入并重新入队。

## Agent 流程

```text
load_input
  -> user_agent
  -> reviewer_agents
  -> adapter_agent
  -> cooking_steps
  -> final_validation
```

- Reviewer 可以并行执行，但每个 reviewer 使用独立 trace，最后按声明顺序合并。
- Adapter 接收真实 `ConstraintSet`，不再使用硬编码时间上限。
- Cooking steps 完成后才执行 deterministic constraint guard，确保校验的是最终产物。
- Adapter 与 CookingStepsAgent 直接按目标 locale 输出，不再在校验后整体翻译。
- 用户偏好提取同样只调用一次 LLM，不做重复翻译。

## 数据库

`Base.metadata.create_all()` 负责创建新表，`src/forkfit/db/migrations.py` 负责升级已有表。每个迁移只执行一次，版本记录保存在 `schema_migrations`。

## 上线检查

- `/healthz` 返回 `ok`
- `/readyz` 至少 database、redis、executor 为 `ok`
- 生产环境缺少强 `JWT_SECRET`、强 `ADMIN_PASSWORD` 或 `COOKIE_SECURE=true` 时后端拒绝启动
- PostgreSQL 每日备份，本地保留 7 天，异地保留 30 天
- Inline executor 公测建议 `MAX_GLOBAL_CONCURRENT_RUNS=1-2`
