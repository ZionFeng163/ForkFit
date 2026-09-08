"""Scoped, committed requirements for menu conversations."""

import json
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class RequirementUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(max_length=2400)
    clarification: str = Field(default="", max_length=300)
    mode: Literal["modify", "relax_only"] = "modify"


def update_requirements(llm, payload: dict, text: str, day: int | None) -> dict:
    return prepare_requirement_update(llm, payload, text, day)[0]


def prepare_requirement_update(llm, payload: dict, text: str, day: int | None) -> tuple[dict, bool]:
    state = payload.get("effective_requirements") or {
        "global": str(payload.get("request_text", "")), "days": {},
    }
    scope = str(day) if day is not None else "global"
    current = state["global"] if day is None else state["days"].get(scope, "")
    data = llm.complete_json(
        agent="plan_requirement_update",
        system=(
            "你维护菜单某个范围内当前有效的用户要求，不生成菜谱。"
            "保留该范围内未被本轮明确更改的要求；明确取消的要求应移除，替换的要求只保留新值。"
            "只更新指定scope，不能把单日要求扩大到全局。text是更新后的完整有效要求，不是对话记录。"
            "global_context仍然有效，单日要求不能默默取消全局禁忌；冲突或含糊时填写clarification。"
            "换菜的具体动作只保留用户明确表达的食材和口味偏好，不保存撤销、锁定等操作命令。"
            "不推断过敏，不改用户资料。mode默认modify；仅当本轮只是取消或放宽已有要求且未要求改菜时为relax_only。"
            "少放盐、减糖等要求实际调整菜谱的表达必须为modify。"
            "只返回JSON：{text:string,clarification:string,mode:modify|relax_only}。"
        ),
        user=json.dumps({"scope": scope, "current": current, "request": text,
                         "global_context": state["global"] if day is not None else ""}, ensure_ascii=False),
        max_tokens=1200,
    )
    update = RequirementUpdate.model_validate(data)
    if update.clarification:
        raise ValueError(update.clarification)
    days = dict(state["days"])
    relax_only = bool(current.strip()) and update.mode == "relax_only" and update.text != current
    if day is None:
        return {"global": update.text, "days": days}, relax_only
    days[scope] = update.text
    return {"global": state["global"], "days": days}, relax_only


def scoped_request(payload: dict, day: int | None = None) -> str:
    state = payload.get("effective_requirements")
    if not state:
        return str(payload.get("request_text", ""))
    return "\n".join(filter(None, [state["global"], state["days"].get(str(day), "") if day is not None else ""]))
