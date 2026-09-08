# ForkFit Agent 评测

ForkFit 对单菜调整和多日规划两个 LangGraph 子图进行分层评测。评测不只检查最终文本，还检查限制理解、工具调用、执行过程和最终业务约束。

## 数据集

本地 `evals/datasets/*.jsonl` 是唯一数据源，共 120 条：

- 80 条单菜链路样例，覆盖限制理解、无需调整、含糊表达、知识库调用、结构化补丁、多菜并行和一次修复。
- 40 条多日规划样例，覆盖候选池、每天菜品数量、跨天重复、三个规划方向、综合评审和无法规划。
- 80 条属于 development，40 条属于 holdout；跨类别选取 12 条作为 smoke 集。

每条样例标注期望行为、结构化限制、受影响菜谱、工具调用要求和必须满足的业务约束。菜谱调整可能存在多个正确答案，因此数据集不强制唯一结果全文。

数据发生变更时运行：

```bash
python scripts/build_agent_eval_dataset.py
```

生成脚本只负责保持数据格式和数量稳定。过敏原、替代食材与期望结果仍需人工确认。

## 评分

代码评分负责：

- 限制解析 Precision、Recall、F1，以及硬限制召回率；
- 是否调用正确工具、参数条件、权限和次数上限；
- 安全替代食材是否来自本轮知识库结果；
- 菜谱身份、数量、候选池、跨天重复和每天菜品数量；
- 单菜修复和菜单重排是否都不超过一次。

模型裁判只评价菜品身份、可烹饪性、食材步骤一致性、偏好匹配和菜单质量，不负责判断过敏安全。默认裁判模型为 `qwen3.7-max-2026-06-08`，可通过 `EVAL_JUDGE_MODEL` 覆盖。

`evals/calibration/semantic_judge.jsonl` 另保存 20 条人工正反例。裁判与人工标签一致率达到 90% 后，语义指标才可作为发布门槛：

```bash
PYTHONPATH=src python -m forkfit.evals.runner --calibrate-judge
```

## 运行

Fake 模式使用参考响应和固定知识库结果，但执行真实 LangGraph、补丁应用和规则校验：

```bash
PYTHONPATH=src python -m forkfit.evals.runner --mode fake --smoke
PYTHONPATH=src python -m forkfit.evals.runner --mode fake --split all
```

真实模型冒烟与发布评测：

```bash
PYTHONPATH=src python -m forkfit.evals.runner --mode live --smoke --with-judge
PYTHONPATH=src python -m forkfit.evals.runner --mode live --split all --repetitions 3 --with-judge
```

增加 `--upload-langsmith` 后，运行器按数据摘要创建不可变 LangSmith 数据集并记录实验。未增加该参数时，输入、输出和评分均保留在本地。

## 发布门槛

- 过敏等硬限制召回率、来源限制和菜单候选池规则必须为 100%。
- 限制解析宏平均 F1、工具调用正确率和预期行为正确率不低于 90%。
- 语义质量通过率不低于 85%。
- 发布评测重复三次，每条样例至少两次通过。
- 新版本硬指标不得退化，软指标相对基线下降超过 2 个百分点时不得发布。

## 当前验证状态

- Fake LLM 全量回归：120/120 通过，用于验证双子图编排、工具权限、补丁应用和确定性约束。
- Qwen 裁判校准：20 条人工正反例、55 个标签中 53 个一致，一致率 96.36%。
- 真实模型 smoke 已成功暴露并推动修复审核漏检、工具无限续调、非法补丁、瞬时网络错误和步骤食材不一致等问题；当前仍存在复杂菜谱步骤生成不稳定，尚未达到完整发布门槛。

因此不能把 120/120 写成真实 Agent 效果，也暂不在简历中填写真实模型通过率。完整数据集连续三轮达到发布门槛后，再固化正式基线。
