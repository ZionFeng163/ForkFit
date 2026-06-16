# ForkFit — AI 个性化菜谱定制平台

ForkFit 是一个 AI 驱动的菜谱定制平台。用户可以从社区菜谱中选择一道菜，AI 会根据个人口味偏好、过敏源、厨具和时间限制，自动生成个性化的版本。

## 功能概览

### 前端页面
- **落地页** (`/`) — 产品介绍、功能展示、CTA
- **发现页** (`/discover`) — 社区菜谱浏览、搜索、分类筛选、今日推荐
- **菜谱详情** (`/packs/{id}`) — 菜谱信息、食材清单、烹饪步骤、评论、相关推荐
- **复刻定制** (`/packs/{id}/fork`) — AI 对话式定制、实时结果预览
- **发布菜谱** (`/posts/new`) — 表单发布、图片上传、草稿保存
- **编辑菜谱** (`/packs/{id}/edit`) — 编辑已有菜谱
- **个人主页** (`/profile`) — 菜谱/收藏/关注/粉丝 tabs
- **用户主页** (`/users/{id}`) — 他人主页、关注/取关
- **我的帖子** (`/my-posts`) — 帖子管理、编辑、删除
- **我的定制** (`/my-forks`) — 定制记录管理
- **登录/注册** (`/login`, `/register`) — 分屏布局、Tab 切换
- **管理后台** (`/admin`) — 用户/帖子管理

### 后端 API
- **认证** — JWT 登录/注册/登出
- **菜谱 CRUD** — 创建、读取、更新、删除、提取
- **互动** — 点赞、收藏、评论
- **定制** — 创建 Run、轮询状态、发布结果
- **用户** — 关注/取关、个人资料、偏好提取
- **管理** — 用户/帖子批量管理

## 启动

当前生产部署以 VPS 实际运行方式为准：

- Nginx 对外提供 `forkfit.shop` / `www.forkfit.shop`
- 前端 Next.js 运行在 `127.0.0.1:3001`
- 后端 FastAPI 运行在 `127.0.0.1:8000`
- PostgreSQL + Redis 在单机内网运行
- AI 任务使用 `JOB_EXECUTOR=inline`，小规模公测建议 `MAX_GLOBAL_CONCURRENT_RUNS=1-2`

Docker Compose 只作为本地开发方案，不再表示生产直接使用它。

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
docker compose logs -f backend frontend
```

服务地址：
- 前端: http://localhost:3001
- 后端 API: http://localhost:8000/docs
- PostgreSQL: localhost:5432
- Redis: localhost:6379

常用命令：

```bash
docker compose restart backend frontend
docker compose logs -f frontend
docker compose down
docker compose down -v  # 同时清空 PostgreSQL 数据
```

## 项目结构

```
ForkFit/
├── apps/web/              # Next.js 前端
│   ├── src/app/           # 页面路由
│   ├── src/components/    # 组件
│   ├── src/lib/           # API、工具函数
│   └── messages/          # i18n 翻译
├── src/forkfit/           # Python 后端
│   ├── api/               # FastAPI 路由
│   ├── stores/            # 数据库操作
│   ├── agents/            # LangGraph AI 代理
│   └── db/                # SQLAlchemy 模型
├── scripts/               # 容器入口脚本
├── docker-compose.yml     # Docker 编排
└── .env.example           # 环境变量模板
```

## 技术栈

**前端:** Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui + next-intl (i18n)

**后端:** FastAPI + SQLAlchemy + PostgreSQL + Redis + LangGraph + Bailian (Qwen LLM)

**基础设施:** VPS + Nginx + systemd + PostgreSQL 16 + Redis 7。Kafka 只保留为未来扩容选项，不是默认依赖；需要时再安装 `confluent-kafka` 并设置 `JOB_EXECUTOR=kafka`。

## 测试

```bash
# Python 后端测试
PYTHONPATH=src python3 -m unittest discover -s tests

# 前端类型检查
cd apps/web && npx tsc --noEmit
```

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

- `BAILIAN_API_KEY` — 百炼 API Key
- `BAILIAN_MODEL` — 模型名称
- `BAILIAN_BASE_URL` — API 地址
- `LANGSMITH_TRACING` — LangSmith 追踪（可选）

## 健康检查与运维

- `GET /healthz`：公开存活检查，只返回 `ok`
- `GET /readyz`：内部就绪检查，返回 database、redis、executor、llm 状态
- 生产必须设置强 `JWT_SECRET`、强 `ADMIN_PASSWORD`、`COOKIE_SECURE=true`
- PostgreSQL 建议每日备份，本机保留 7 天，异地保留 30 天
- 日志先使用 systemd journal；上线后可加每日错误摘要脚本

脚本：

```bash
DATABASE_URL='postgresql+psycopg://...' scripts/backup_postgres.sh
SERVICES='forkfit-backend forkfit-frontend nginx' scripts/journal_error_summary.sh
```

## 数据库

后端启动时会自动创建新表，并执行 `src/forkfit/db/migrations.py` 中尚未应用的版本化迁移。不要再手工执行 `ALTER TABLE`；迁移记录保存在 `schema_migrations` 表中。
