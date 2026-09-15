from .models import AgentFinding


def recipe_question(findings: list[AgentFinding], locale: str = "zh") -> str:
    """Ask one actionable question without treating safety constraints as optional."""
    finding = next((item for item in findings if item.severity == "high"), findings[0] if findings else None)
    if not locale.startswith("zh"):
        detail = finding.message if finding else "The adjustment could not be verified."
        return f"{detail} The original recipe is unchanged. What alternative ingredient or cooking method would you accept? Your dietary restrictions will still apply."
    if finding and ("clarification" in finding.type or "ambiguous" in finding.type):
        return f"原菜谱保持不变。{finding.message}"
    kind = finding.type if finding else ""
    detail = finding.message if finding and kind != "invalid_patch" else "这次没有得到可用的调整结果。"
    if "equipment" in kind:
        question = "你现在可以使用哪些厨具？"
    elif "time" in kind:
        question = "你最多能接受多少分钟的总用时？"
    elif "allergy" in kind or "diet_rule" in kind:
        question = "在保留忌口的前提下，你能接受哪种替代食材或做法？"
    else:
        question = "你能接受怎样的食材或做法调整？"
    return f"{detail}\n原菜谱保持不变。{question}"
