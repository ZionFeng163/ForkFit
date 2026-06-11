# ForkFit 当前架构

## 运行拓扑

项目只使用根目录 `docker-compose.yml`：

- `frontend`: Next.js 开发服务，对外端口 `3001`
- `backend`: FastAPI，对外端口 `8000`
- `worker`: Kafka 任务消费者
- `postgres`: PostgreSQL 16，对外端口 `5432`
- `redis`: 缓存与限流，对外端口 `6379`
- `kafka`: Kafka 3.9 KRaft 单节点，对外端口 `9092`

不再支持本机 Homebrew/Conda 启动、Redis Queue、ZooKeeper 或独立 production compose。

## 数据流

1. FastAPI 创建 `runs` 记录并向 `forkfit-jobs` 投递任务。
2. Worker 消费任务，复用进程内的 `ForkFitLangGraphWorkflow`。
3. 每个 graph 节点完成后更新数据库 trace。
4. 前端轮询 run 状态；不再为每个浏览器连接创建 Kafka consumer。
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
