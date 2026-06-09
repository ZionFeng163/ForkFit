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

## 快速启动

### Docker 一键启动（推荐）

```bash
# 构建并启动所有服务
docker compose up -d --build

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f backend
```

服务地址：
- 前端: http://localhost:3001
- 后端 API: http://localhost:8000/docs
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- Kafka: localhost:9092

### 本地开发

```bash
# 后端
cd src/forkfit
pip install -e .
DATABASE_URL=postgresql+psycopg://forkfit:forkfit@localhost:5432/forkfit \
REDIS_URL=redis://localhost:6379/0 \
KAFKA_BOOTSTRAP_SERVERS=localhost:9092 \
python scripts/run_api.py

# Worker（新终端）
python scripts/run_worker.py

# 前端
cd apps/web
npm install
npm run dev
# 打开 http://localhost:3000
```

### 一键本地启动

```bash
bash scripts/dev_start.sh
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
├── scripts/               # 启动脚本
├── docker-compose.yml     # Docker 编排
└── .env.example           # 环境变量模板
```

## 技术栈

**前端:** Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui + next-intl (i18n)

**后端:** FastAPI + SQLAlchemy + PostgreSQL + Redis + Kafka + LangGraph + Bailian (Qwen LLM)

**基础设施:** Docker Compose + PostgreSQL 16 + Redis 7 + Kafka (Confluent)

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

## 数据库

首次启动时 `Base.metadata.create_all()` 会自动创建所有表。如需手动迁移：

```bash
docker compose exec postgres psql -U forkfit -d forkfit -c "
  ALTER TABLE posts ADD COLUMN IF NOT EXISTS likes integer DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS bio varchar(500) DEFAULT '';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS location varchar(100) DEFAULT '';
"
```
