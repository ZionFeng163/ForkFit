# ForkFit 产品需求文档

## 1. 产品概述

ForkFit 是一个面向多用户的 AI 饭包个性化服务。

用户提交一个社区饭包和自己的饮食画像后，系统运行一个三 Agent 的
LangGraph 工作流，将原始饭包改造成适合该用户的个性化 Fork。

当前核心工作流：

1. `UserAgent`：理解用户显式画像和口味偏好。
2. `ConstraintAgent`：审计饭包是否违反用户硬约束。
3. `AdapterAgent`：在最小修改原则下生成个性化饭包。

`ConstraintGuard` 负责确定性最终校验。它不是 Agent，不调用 LLM，也不修改饭包。

第一阶段上线目标是：把当前脚本级 MVP 做成可多用户访问的后端服务，支持并发提交、任务排队、状态查询、过程追踪和结果持久化。

## 2. 项目目标

- 提供一个可上线的后端 API，用于运行 ForkFit 饭包个性化流程。
- 支持多个用户同时提交长耗时 Agent 任务。
- API 请求不能阻塞等待完整 LLM 工作流结束。
- 持久化用户提交、运行状态、运行结果、trace 和错误信息。
- 每次运行都必须可观测：状态、每个节点耗时、LLM 调用次数、token 用量、模型错误、Guard 拦截原因。
- 队列层和执行层必须可替换，方便从 MVP 平滑扩展到更高并发架构。

## 3. 非目标

- 本文档不设计前端。
- 暂不设计支付、订阅、额度购买或商业化。
- 暂不设计社区 Feed、推荐算法、排行榜。
- 第一版不设计分享链接、公开结果页或社区传播能力。
- 第一版不引入 Kafka，除非后续事件流规模证明有必要。
- 不提供医疗、治疗、疾病管理类营养建议。
- 暂不设计公开社区内容审核系统。

## 4. 用户与核心场景

### 4.1 MVP 伪登录用户

第一版使用伪登录用户，目的是保留未来真实用户系统的形状，但不引入完整登录注册。

要求：

- 服务启动时内置一个默认用户，例如 `demo_user`。
- 所有请求都归属到该用户。
- API、数据库和 run 记录必须保留 `user_id` 字段。
- 业务代码不能假设系统永远只有一个用户。
- 后续接入真实登录时，应该只替换认证层和用户解析逻辑，不重写 run、store、queue、worker。

### 4.2 匿名体验用户

- 可以提交示例饭包和饮食画像。
- 可以获得一次运行结果。
- 运行历史可以短期保存，到期清理。

匿名体验不是第一版必须实现。第一版可以只使用伪登录用户。

### 4.3 注册用户

- 可以保存自己的饮食画像。
- 可以提交饭包进行个性化 Fork。
- 可以查看历史运行记录。
- 可以查看 trace、change log 和失败原因。

注册用户不是第一版必须实现，但数据模型和 API 不能阻碍后续接入。

### 4.4 未来社区用户

- 可以发布饭包。
- 可以 Fork 社区饭包。
- 可以对比原始饭包和个性化饭包。

社区发布与推荐不是第一版目标，但后端数据模型不能阻碍后续扩展。

## 5. MVP 功能需求

### 5.1 用户画像输入

API 必须接受显式用户画像字段：

- `people_count`：用餐人数。
- `budget`：预算。
- `likes`：喜欢的口味、形式或食材。
- `dislikes`：不喜欢的口味、形式或食材。
- `allergies`：过敏源。
- `diet_rules`：饮食规则，例如 no pork。
- `equipment`：可用厨具。
- `max_cook_time_minutes`：可接受最长烹饪时间。
- `soft_preferences`：软偏好，例如少洗碗、高蛋白。

MVP 只使用用户显式输入，不从行为数据推断隐藏偏好。

### 5.2 饭包输入

API 必须接受结构化饭包：

- `id`
- `title`
- `theme`
- `meals`

每个 meal 必须包含：

- `id`
- `day`
- `name`
- `ingredients`
- `equipment`
- `cook_time_minutes`
- `estimated_cost`
- `tags`
- `notes`

### 5.3 创建运行任务

API 必须提供：

```text
POST /runs
```

行为：

- 校验请求结构。
- 创建 `run_id`。
- 持久化输入和初始状态。
- 提交后台任务。
- 立即返回 `run_id` 和当前状态。

该接口不能等待完整 LangGraph 工作流执行完成后才返回。

### 5.4 查询运行状态

API 必须提供：

```text
GET /runs/{run_id}
```

响应必须包含：

- `run_id`
- `user_id`
- `status`
- `created_at`
- `started_at`
- `finished_at`
- `input_summary`
- `result`
- `error`
- `trace`

运行状态：

- `queued`：已入队。
- `running`：正在执行。
- `succeeded`：成功完成。
- `failed`：执行失败。
- `cancelled`：已取消。

### 5.5 运行过程事件

API 应提供：

```text
GET /runs/{run_id}/events
```

MVP 推荐使用 Server-Sent Events，也就是 SSE。

事件类型：

- `run_queued`
- `run_started`
- `node_started`
- `node_finished`
- `llm_call_started`
- `llm_call_finished`
- `guard_finished`
- `run_succeeded`
- `run_failed`

如果 SSE 暂时不可用，客户端必须仍然可以通过轮询 `GET /runs/{run_id}` 获取状态。

### 5.6 运行结果

成功结果必须包含：

- 原始饭包。
- 个性化 Fork 后的饭包。
- change log。
- unresolved items。
- final guard review。
- summary。
- trace。

如果 `ConstraintGuard` 拦截结果，MVP 默认将该 run 标记为 `failed`。

除非后续明确引入 `succeeded_with_guard_block` 状态，否则不要把 Guard 拦截的结果当成成功发布。

Guard 拦截的内部细节默认不展示给普通用户。用户只能看到安全摘要，例如“该饭包无法安全适配，请调整过敏源、厨具或食材后重试”。完整 adapter 输出和 Guard findings 仅用于内部日志、调试或管理员视图。

## 6. Agent 设计约束

### 6.1 Agent 命名规则

任何命名为 `*Agent` 的组件都必须调用 LLM。

不调用 LLM 的确定性组件不能叫 Agent，只能叫：

- `Guard`
- `Validator`
- `Normalizer`
- `Serializer`
- `Store`
- `Executor`

### 6.2 UserAgent

职责：

- 理解用户显式画像。
- 生成结构化 preference profile。
- 判断饭包是否符合用户口味。
- 不修改饭包。
- 不判断硬约束是否可行。

### 6.3 ConstraintAgent

职责：

- 基于用户约束审计饭包。
- 返回 `pass`、`warn` 或 `block`。
- 输出 findings，并指明受影响 meal id。
- 不修改饭包。

### 6.4 AdapterAgent

职责：

- 生成个性化饭包 Fork。
- 保留原始 meal id。
- 遵守最小修改原则。
- 每个修改都必须解释原因。
- 如果无法修复 hard block，必须返回 unresolved item。

### 6.5 ConstraintGuard

职责：

- 确定性复查硬安全约束。
- 拦截不安全结果。
- 不调用 LLM。
- 不修改输出。
- 不参与 Agent 协商。

## 7. 后端架构

### 7.1 推荐 MVP 架构

```text
FastAPI
  |
  |-- Run API
  |-- Run Event API
  |
PostgresRunStore
  |
RedisJobQueue
  |
ForkFitWorker
  |
LangGraph Workflow
  |
Bailian qwen3.6-flash
```

### 7.2 为什么 MVP 用 Redis，而不是 Kafka

ForkFit 第一版需要的是：

- 任务排队。
- 并发限制。
- 短期运行事件。
- worker 协调。
- 简单失败重试。

这些需求 Redis Queue 足够解决。

Kafka 更适合：

- 高吞吐事件流。
- 多个独立消费者组。
- 长期 append-only 事件日志。
- 跨服务事件回放。
- 分析、计费、通知、训练数据等多个下游系统同时消费事件。

ForkFit MVP 暂时没有这些复杂事件流需求，所以不建议第一版引入 Kafka。

后续如果出现多个下游消费者，再考虑 Kafka 或 Redpanda。

### 7.3 队列与执行器抽象

API 层不能直接依赖具体队列实现。

需要抽象两个接口：

```python
class RunStore:
    create_run(...)
    get_run(...)
    mark_running(...)
    mark_succeeded(...)
    mark_failed(...)
    append_event(...)

class JobExecutor:
    submit(run_id, payload)
```

MVP 直接实现：

- `PostgresRunStore`
- `RedisJobExecutor`

不提供 SQLite 或内存平替作为 API 运行路径。Postgres 或 Redis 不可用时，服务和集成测试必须明确失败，提示安装或启动真实依赖。

这样以后从 Redis 迁移到 Celery、Dramatiq、Kafka 或其他执行系统时，不需要重写 API 路由。

## 8. 并发需求

### 8.1 HTTP 请求并发

API 服务必须能同时处理多个 HTTP 请求。

`POST /runs` 只负责校验、创建 run、入队，不能在请求线程里执行完整 LangGraph workflow。

### 8.2 工作流并发

一次完整工作流包含至少三次 LLM 调用，耗时可能达到几十秒。

系统必须支持：

- 全局最大并发运行数。
- 单用户最大并发运行数。
- LLM 请求超时。
- 瞬时模型错误重试。

建议 MVP 默认值：

- `MAX_GLOBAL_CONCURRENT_RUNS=3`
- `MAX_USER_CONCURRENT_RUNS=1`
- `LLM_TIMEOUT_SECONDS=60`
- `LLM_MAX_RETRIES=1`

这些值必须通过环境变量配置。

第一版不做额度、付费、每日次数限制，但仍必须做基础并发保护，避免单个用户或脚本同时触发过多 LLM 任务。

### 8.3 背压机制

当队列过载时，`POST /runs` 必须拒绝新任务。

可返回：

```text
HTTP 429 Too Many Requests
```

或：

```text
HTTP 503 Service Unavailable
```

响应中应包含重试建议。

## 9. 数据持久化

### 9.1 数据库选择

线上 MVP 使用 Postgres。

核心表：

- `users`
- `meal_packs`
- `runs`
- `run_events`
- `run_traces`

### 9.2 runs 表

`runs` 至少存储：

- `id`
- `user_id`
- `status`
- `input_payload`
- `result_payload`
- `error_payload`
- `created_at`
- `started_at`
- `finished_at`

### 9.3 run_events 表

`run_events` 至少存储：

- `id`
- `run_id`
- `event_type`
- `payload`
- `created_at`

该表用于轮询、SSE replay 和调试。

### 9.4 trace 存储

trace 必须保存：

- LangGraph node 耗时。
- LLM call 耗时。
- 模型名。
- prompt token 数。
- completion token 数。
- 错误状态。
- Guard 结果。

生产环境默认不保存完整 prompt 内容，因为 prompt 可能包含用户饮食数据。

如需保存 prompt，必须增加显式开关和脱敏策略。

## 10. API 草案

### 10.1 创建 Run

```http
POST /runs
Content-Type: application/json
```

请求体：

```json
{
  "user_profile": {},
  "meal_pack": {}
}
```

响应：

```json
{
  "run_id": "run_123",
  "status": "queued"
}
```

### 10.2 查询 Run

```http
GET /runs/{run_id}
```

响应：

```json
{
  "run_id": "run_123",
  "status": "succeeded",
  "result": {},
  "trace": {}
}
```

### 10.3 订阅运行事件

```http
GET /runs/{run_id}/events
Accept: text/event-stream
```

事件示例：

```text
event: llm_call_finished
data: {"agent":"adapter","duration_ms":23175.8,"status":"success"}
```

## 11. 安全与滥用控制

- 不能向客户端暴露百炼 API key。
- 必须限制请求体大小。
- 必须限制饭包 meal 数量。
- 必须限制 ingredients、notes 等字段长度。
- 注册用户必须有并发限制。
- 默认不保存原始 prompt。
- 错误信息中不能泄露密钥。
- 对用户返回简化错误，对内部日志保存详细错误。
- 第一版不做额度计费，但保留并发限制和请求体限制。

建议 MVP 输入限制：

- 每个饭包最多 14 个 meals。
- 每个 meal 最多 40 个 ingredients。
- 单个字符串最长 1000 字符。
- 请求体最大 256 KB。

## 12. 可观测性

必须记录日志：

- run 生命周期。
- 队列等待时间。
- 工作流总耗时。
- 每个 Agent 的 LLM 耗时。
- token 用量。
- 模型错误。
- Guard 拦截。

必须采集指标：

- 创建 run 数。
- 成功 run 数。
- 失败 run 数。
- 队列长度。
- 平均队列等待时间。
- run duration p50 / p95。
- LLM call duration p50 / p95。
- LLM error rate。
- Guard block rate。
- 每次 run 平均 token 用量。

## 13. 失败处理

### 13.1 LLM 调用失败

如果 LLM 调用失败：

- trace 中记录失败的 LLM call。
- 对瞬时错误重试一次。
- 重试仍失败则标记 run failed。

### 13.2 JSON 输出非法

如果模型输出不是合法 JSON：

- 尝试一次 JSON repair。
- trace 中记录 repair 调用。
- repair 后仍失败则标记 run failed。

### 13.3 Guard 拦截

如果 `ConstraintGuard` 拦截：

- run 标记为 failed。
- 保留 adapter 输出用于内部调试。
- 对用户展示安全的 unresolved summary。

### 13.4 Worker 崩溃

如果 worker 崩溃：

- Redis 中未执行的任务不能丢。
- running 超时的 run 应标记为 stale。
- stale run 最多重试一次。

## 14. 部署形态

线上 MVP 部署：

```text
1 个 FastAPI Web 服务
1 个 Redis 实例
1 个 Postgres 实例
1-2 个 Worker 进程
```

扩展路径：

- 增加 worker 进程。
- 谨慎提高 Redis 队列并发。
- 将 API 和 worker 拆成不同容器。
- 当多个下游系统需要消费事件时，再引入 Kafka 或 Redpanda。

## 15. 验收标准

后端 MVP 达标条件：

- `POST /runs` 能立即返回 run ID。
- 多个用户能同时提交任务。
- 全局和单用户并发限制生效。
- LangGraph 长任务不在 HTTP 请求线程中执行。
- `GET /runs/{run_id}` 能返回状态、结果、错误和 trace。
- SSE 或轮询能观察运行过程。
- 正常 run 中三个 Agent 都调用 LLM。
- `ConstraintGuard` 能拦截不安全输出。
- run 数据持久化到 Postgres。
- job 通过 Redis 队列执行。
- 单元测试覆盖 run 状态流转和失败处理。
- 至少有一个真实集成测试能调用百炼跑完整流程。

## 16. 待确认问题

- 第一版是否允许匿名用户？
- run 结果是私有、公开，还是可分享链接？
- 是否保存 prompt 文本，还是只保存脱敏摘要？
- Guard 拦截后的 adapter 输出是否允许用户查看？
- 第一版每个用户每天允许多少次运行？
- 第一版使用登录系统，还是先用 API key？
