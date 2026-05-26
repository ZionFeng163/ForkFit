# ForkFit 后端 MVP 实现计划

## 1. 实现目标

把当前脚本级 ForkFit Agent Core 做成一个可上线雏形的后端服务。

第一版重点：

- FastAPI 后端。
- 伪登录用户。
- Postgres 持久化 run。
- Redis 队列执行长耗时 LangGraph 任务。
- 支持并发提交和后台执行。
- 支持查询 run 状态、结果和 trace。
- Guard 拦截内容不直接展示给普通用户。

第一版不做：

- 前端。
- 真实注册登录。
- 分享功能。
- 付费、额度、订阅。
- Kafka。
- 社区 Feed。

## 2. 总体架构

```text
Client
  |
FastAPI App
  |
  |-- auth: 伪登录用户 demo_user
  |-- api: /runs
  |-- schemas: 请求/响应模型
  |
RunService
  |
  |-- RunStore 接口
  |-- JobExecutor 接口
  |
PostgresRunStore
  |
RedisJobExecutor
  |
Worker Process
  |
ForkFitLangGraphWorkflow
  |
Bailian qwen3.6-flash
```

关键原则：

- API 路由不能直接调用 `ForkFitLangGraphWorkflow().run(...)`。
- 路由只创建 run、入队、返回 `run_id`。
- Worker 负责执行 LangGraph。
- Store 负责持久化状态、结果、trace 和事件。
- Queue/Executor 可替换，避免未来从 Redis 迁移时重写 API。

## 3. 目标目录结构

建议目录：

```text
src/forkfit/
  agents.py
  fixtures.py
  langgraph_workflow.py
  llm.py
  models.py
  serialization.py

  api/
    __init__.py
    app.py
    deps.py
    routes_runs.py
    schemas.py
    errors.py

  auth/
    __init__.py
    demo_auth.py
    models.py

  services/
    __init__.py
    run_service.py

  stores/
    __init__.py
    base.py
    postgres.py

  executors/
    __init__.py
    base.py
    redis.py

  workers/
    __init__.py
    runner.py

  db/
    __init__.py
    models.py
    session.py
    migrations/

  config.py
```

脚本目录：

```text
scripts/
  run_api.py
  run_worker.py
  run_real_langgraph.py
  smoke_bailian.py
```

测试目录：

```text
tests/
  test_forkfit_agents.py
  test_api_runs_integration.py
  test_api_schemas.py
  test_demo_auth.py
  test_postgres_run_store.py
  test_redis_executor.py
```

## 4. 分阶段实现

### 阶段 1：配置与 API Schema

依赖：无。

实现内容：

- 新增 `config.py`。
- 新增 FastAPI 依赖项：`fastapi`、`uvicorn`、`pydantic`。
- 定义环境变量：
  - `APP_ENV`
  - `DEMO_USER_ID`
  - `MAX_GLOBAL_CONCURRENT_RUNS`
  - `MAX_USER_CONCURRENT_RUNS`
  - `LLM_TIMEOUT_SECONDS`
  - `DATABASE_URL`
  - `REDIS_URL`
- 新增 API schema：
  - `CreateRunRequest`
  - `CreateRunResponse`
  - `RunStatusResponse`
  - `RunResultResponse`
  - `RunTraceResponse`

验收：

- schema 能表达当前 `UserProfile` 和 `MealPack`。
- 不调用真实 LLM。
- 单元测试校验请求体合法/非法情况。

### 阶段 2：伪登录用户

依赖：阶段 1。

实现内容：

- 新增 `auth/demo_auth.py`。
- 实现 `get_current_user()`。
- 第一版始终返回：

```json
{
  "id": "demo_user",
  "display_name": "Demo User"
}
```

要求：

- API 层必须通过依赖获取 user。
- 不允许在 run service 里硬编码 `demo_user`。
- 所有 run 必须写入 `user_id`。

验收：

- `POST /runs` 创建的 run 带有 `user_id=demo_user`。
- 后续替换真实登录时不需要改 run service。

### 阶段 3：RunStore 抽象与 Postgres 实现

依赖：阶段 1、2。

实现内容：

- 定义 `RunStore` 接口。
- 实现 `PostgresRunStore`。
- 定义 run 状态：
  - `queued`
  - `running`
  - `succeeded`
  - `failed`
  - `cancelled`
- 支持：
  - 创建 run。
  - 查询 run。
  - 标记 running。
  - 标记 succeeded。
  - 标记 failed。
  - 追加 event。

验收：

- 必须连接真实 Postgres。
- `DATABASE_URL` 缺失或指向 SQLite 时直接失败。
- 测试覆盖状态更新、失败记录、结果和 trace 读取。

### 阶段 4：JobExecutor 抽象与 Redis 执行器

依赖：阶段 3。

实现内容：

- 定义 `JobExecutor` 接口。
- 实现 `RedisJobExecutor`。
- 使用 Redis/RQ 提交后台任务。
- worker 调用当前同步 LangGraph workflow。
- worker 更新 Postgres run 状态。

验收：

- `POST /runs` 立即返回。
- 任务必须进入真实 Redis 队列。
- worker 可完成任务并写入结果。
- 失败能写入安全 error。

### 阶段 5：FastAPI Run API

依赖：阶段 3、4。

实现接口：

```text
POST /runs
GET /runs/{run_id}
GET /runs/{run_id}/events
```

行为：

- `POST /runs` 创建 run 并提交后台任务。
- `GET /runs/{run_id}` 返回当前状态、结果、trace 或错误。
- `GET /runs/{run_id}/events` 使用 SSE 返回事件。

验收：

- API 测试覆盖 queued、running、succeeded、failed。
- API 不直接调用 workflow。
- 用户只能查询自己的 run。

### 阶段 6：PostgresRunStore

依赖：阶段 3、5。

实现内容：

- 新增数据库模型。
- 新增迁移。
- 实现 `PostgresRunStore`。
- 持久化：
  - run input。
  - run result。
  - run error。
  - trace。
  - run events。

建议技术：

- SQLAlchemy。
- Alembic。
- Postgres JSONB 字段存 input/result/trace。

验收：

- 服务重启后 run 记录仍可查询。
- run events 可用于 SSE replay 或轮询。

### 阶段 7：RedisJobExecutor 与 Worker

依赖：阶段 6。

实现内容：

- 新增 Redis 依赖。
- 实现 `RedisJobExecutor`。
- 新增 worker runner。
- worker 从 Redis 队列消费 run job。
- worker 调用 `ForkFitLangGraphWorkflow`。
- worker 将状态、结果、trace 写回 Postgres。

建议实现：

- MVP 可用 Redis list 或 RQ/Dramatiq。
- 若想减少自研队列细节，优先 Dramatiq 或 RQ。

验收：

- API 进程和 worker 进程可分开启动。
- 多个 worker 可同时消费任务。
- 全局并发限制生效。
- worker 崩溃时 queued job 不丢。

### 阶段 8：Guard 拦截策略

依赖：阶段 5 或 6。

实现内容：

- 如果 `ConstraintGuard` block：
  - run 标记为 `failed`。
  - 内部保存 guard findings。
  - 用户响应只返回安全摘要。
- 不向普通用户返回完整 adapter output。
- 内部 trace 仍保留调试信息。

用户可见错误示例：

```json
{
  "message": "该饭包无法安全适配，请调整过敏源、厨具或食材后重试。"
}
```

验收：

- Guard findings 不出现在普通用户响应中。
- 内部 run 记录保留完整原因。

### 阶段 9：并发与背压

依赖：阶段 7。

实现内容：

- 全局最大并发。
- 单用户最大并发。
- 队列长度上限。
- 超限返回 429 或 503。
- 环境变量可配置。

验收：

- 单用户同时提交超过限制时被拒绝。
- 全局队列过长时返回明确错误。
- 不会无限堆积 LLM 任务。

### 阶段 10：真实集成测试

依赖：阶段 7、8、9。

实现内容：

- 允许纯单元测试使用 stub LLM 只验证结构化解析和边界。
- 新增真实集成测试脚本。
- 测试完整链路：
  - API 创建 run。
  - Worker 执行。
  - 查询 run 成功。
  - trace 中出现三个 LLM Agent。

验收：

- 本地可通过 docker-compose 启动 Postgres、Redis、API、worker。
- 一条真实 qwen run 能完成。
- trace 能看到：
  - `user`
  - `constraint`
  - `adapter`

## 5. 依赖关系总览

```text
阶段 1 配置/Schema
  -> 阶段 2 伪登录用户
  -> 阶段 3 PostgresRunStore
  -> 阶段 4 RedisJobExecutor + Worker
  -> 阶段 5 FastAPI Run API
  -> 阶段 6 结果/trace 持久化
  -> 阶段 7 真实 API + Worker 集成验证
  -> 阶段 8 Guard 拦截策略
  -> 阶段 9 并发与背压
  -> 阶段 10 真实集成测试
```

其中阶段 8 可在阶段 5 后先做内存版本，但最终必须在 Postgres/Redis 版本中再次验证。

## 6. 第一版推荐交付切片

为了避免一次性做太大，按真实上线依赖拆小步实现：

### 切片 A：真实持久化 API 骨架

- FastAPI。
- 伪登录用户。
- `PostgresRunStore`。
- `POST /runs`。
- `GET /runs/{run_id}`。
- 真实 Postgres 集成测试。

价值：

- API 形状和用户边界先固定。
- 不引入内存或 SQLite 平替，避免后续迁移误差。

### 切片 B：真实后台执行

- `RedisJobExecutor`。
- Worker。
- 真实 Bailian LangGraph flow。
- result/trace 持久化。
- LangSmith 摘要指标上报。
- Guard 安全响应。

价值：

- 接近真实上线架构。
- 后续可横向扩 worker。

## 7. 暂不实现但需保留扩展点

- 真实登录系统。
- API key 认证。
- 用户额度。
- 付费。
- 分享链接。
- 社区饭包发布。
- Kafka/Redpanda 事件流。
- LangSmith 或 OpenTelemetry 集成。

## 8. 设计风险

### 8.1 LLM 调用耗时长

一次 run 至少三次 LLM 调用，必须后台执行。

### 8.2 LLM 成本不可控

虽然第一版不做付费额度，但必须保留并发限制，避免无意中造成大量调用。

### 8.3 Guard 信息泄露

Guard findings 可能包含用户过敏源、饮食规则等敏感信息。普通用户响应应给摘要，不直接暴露完整内部细节。

### 8.4 过早引入 Kafka

Kafka 会增加部署和开发复杂度。MVP 阶段 Redis 队列足够。

### 8.5 伪登录写死

伪登录只能存在于 auth 层，不能散落在业务逻辑中。

## 9. 当前结论

第一版后端直接采用真实上线依赖：

```text
FastAPI + 伪登录用户 + Postgres + Redis Queue + Worker
```

如果 Postgres 或 Redis 未安装/未启动，测试和服务应直接失败并提示安装或启动。

暂时不需要 Kafka。
