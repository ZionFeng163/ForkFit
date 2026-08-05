from __future__ import annotations

import re

from .models import (
    AgentFinding,
    AgentReview,
    ClarificationRequest,
    ConstraintEvidence,
    ConstraintSet,
    ConstraintSpec,
    Meal,
    MealPack,
    UserProfile,
)


EQUIPMENT_ALIASES: dict[str, set[str]] = {
    "灶台": {"stove", "stovetop", "炒锅", "平底锅", "锅", "炉灶"},
    "炉灶": {"stove", "stovetop", "炒锅", "平底锅", "锅", "灶台"},
    "炒锅": {"wok", "stove", "stovetop", "锅", "炉灶", "灶台"},
    "平底锅": {"pan", "frying pan", "skillet", "stove", "stovetop", "锅", "炉灶"},
    "汤锅": {"pot", "stove", "stovetop", "锅", "炉灶"},
    "蒸锅": {"steamer", "pot", "stove", "stovetop", "锅", "炉灶"},
    "烤箱": {"oven"},
    "空气炸锅": {"air fryer"},
    "电饭煲": {"rice cooker"},
    "oven": {"烤箱"},
    "air fryer": {"空气炸锅"},
    "rice cooker": {"电饭煲"},
    "stove": {"灶台", "炉灶", "炒锅", "平底锅", "汤锅"},
    "stovetop": {"灶台", "炉灶", "炒锅", "平底锅", "汤锅"},
}

DIET_RULE_BLOCKED_TERMS: dict[str, set[str]] = {
    "素食": {"猪肉", "牛肉", "羊肉", "鸡肉", "鸡胸肉", "鸡腿", "鱼", "虾", "虾仁", "三文鱼", "肥牛", "肉末", "排骨", "火腿"},
    "vegetarian": {"pork", "beef", "lamb", "chicken", "fish", "shrimp", "salmon", "tuna", "bacon", "ham", "sausage"},
    "vegan": {"pork", "beef", "lamb", "chicken", "fish", "shrimp", "salmon", "tuna", "egg", "milk", "cheese", "yogurt", "honey"},
    "无猪肉": {"猪肉", "肉末", "排骨", "火腿"},
    "不吃猪肉": {"猪肉", "肉末", "排骨", "火腿"},
    "no pork": {"pork", "bacon", "ham", "sausage"},
    "无牛肉": {"牛肉", "肥牛"},
    "不吃牛肉": {"牛肉", "肥牛"},
    "no beef": {"beef", "steak"},
    "低盐": {"咸菜", "腊肉", "火腿", "培根"},
    "少盐": {"咸菜", "腊肉", "火腿", "培根"},
}

ALLERGEN_ALIASES: dict[str, set[str]] = {
    "花生": {"peanut", "peanuts", "花生酱", "花生碎"},
    "peanut": {"花生", "花生酱", "花生碎", "peanuts"},
    "牛奶": {"milk", "dairy", "乳制品", "奶油", "黄油", "芝士", "奶酪"},
    "milk": {"牛奶", "乳制品", "奶油", "黄油", "芝士", "奶酪", "dairy"},
    "鸡蛋": {"egg", "eggs", "蛋液"},
    "egg": {"鸡蛋", "蛋液", "eggs"},
    "大豆": {"soy", "soybean", "黄豆", "豆腐", "酱油"},
    "soy": {"大豆", "黄豆", "豆腐", "酱油", "soybean"},
    "芝麻": {"sesame", "tahini", "芝麻酱", "香油"},
    "sesame": {"芝麻", "芝麻酱", "香油", "tahini"},
    "虾": {"shrimp", "prawn", "虾仁"},
    "shrimp": {"虾", "虾仁", "prawn"},
}

KNOWN_EQUIPMENT = "烤箱|空气炸锅|电饭煲|微波炉|炒锅|平底锅|汤锅|蒸锅|炉灶|灶台|oven|air fryer|rice cooker|stove"


def _norm(value: str) -> str:
    return " ".join(value.lower().replace("-", " ").split())


def _contains_term(text: str, term: str) -> bool:
    normalized_text = _norm(text)
    candidates = {_norm(term), *(_norm(item) for item in ALLERGEN_ALIASES.get(_norm(term), set()))}
    return any(candidate and candidate in normalized_text for candidate in candidates)


def contains_constraint_term(text: str, term: str) -> bool:
    return _contains_term(text, term)


def _composition_text(meal: Meal) -> str:
    # Hard ingredient constraints follow the recipe's declared composition.
    # Notes such as "不放香菜" must not be mistaken for an included ingredient.
    return " ".join([meal.name, *meal.ingredients]).lower()


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        cleaned = value.strip(" ，,。、.!！?？")
        key = _norm(cleaned)
        if cleaned and key not in seen:
            seen.add(key)
            result.append(cleaned)
    return result


class ConstraintNormalizer:
    """Convert explicit profile fields and common Chinese requests into typed constraints."""

    def normalize(self, profile: UserProfile, request_text: str = "") -> ConstraintSpec:
        items: list[ConstraintEvidence] = []
        for value in _dedupe(profile.allergies):
            items.append(ConstraintEvidence("allergy", value, True, "profile"))
        for value in _dedupe(profile.diet_rules):
            items.append(ConstraintEvidence("diet_rule", value, True, "profile"))
        for value in _dedupe(profile.equipment):
            items.append(ConstraintEvidence("equipment", value, True, "profile"))

        people_count = max(1, min(20, profile.people_count))
        max_minutes = max(5, min(360, profile.max_cook_time_minutes))
        clarification = self._parse_request(
            request_text, items, people_count=people_count, max_minutes=max_minutes
        )
        if clarification[1] is not None:
            people_count = clarification[1]
        if clarification[2] is not None:
            max_minutes = clarification[2]

        return ConstraintSpec(
            items=self._dedupe_items(items),
            people_count=people_count,
            max_cook_time_minutes=max_minutes,
            likes=_dedupe(profile.likes),
            dislikes=_dedupe(profile.dislikes),
            soft_preferences=_dedupe([*profile.soft_preferences, *([request_text] if request_text.strip() else [])]),
            clarification=clarification[0],
        )

    def _parse_request(
        self,
        text: str,
        items: list[ConstraintEvidence],
        *,
        people_count: int,
        max_minutes: int,
    ) -> tuple[ClarificationRequest | None, int | None, int | None]:
        raw = text.strip()
        if not raw:
            return None, None, None

        if re.search(r"(?:可能|好像|不确定).{0,6}过敏", raw):
            return (
                ClarificationRequest(
                    code="ambiguous_allergy",
                    question="你提到了可能过敏。请确认需要完全避开的食材后再继续。",
                ),
                None,
                None,
            )

        for match in re.finditer(r"(?:我对|对)?([A-Za-z\u4e00-\u9fff]{1,10})过敏", raw):
            value = re.sub(r"^(?:我|有点|严重)", "", match.group(1)).strip()
            if value:
                items.append(ConstraintEvidence("allergy", value, True, "request_text", 1.0, raw))

        for match in re.finditer(r"(?:不要|去掉|不吃)([A-Za-z\u4e00-\u9fff]{1,12})", raw):
            value = match.group(1).strip()
            if value and not re.fullmatch(KNOWN_EQUIPMENT, value, re.IGNORECASE):
                items.append(ConstraintEvidence("diet_rule", f"不吃{value}", True, "request_text", 0.98, raw))

        for match in re.finditer(rf"(?:没有|不用|无)({KNOWN_EQUIPMENT})", raw, re.IGNORECASE):
            items.append(ConstraintEvidence("excluded_equipment", match.group(1), True, "request_text", 1.0, raw))

        only_match = re.search(rf"只有({KNOWN_EQUIPMENT})(?:可用|能用)?", raw, re.IGNORECASE)
        if only_match:
            items[:] = [item for item in items if item.kind != "equipment"]
            items.append(ConstraintEvidence("equipment", only_match.group(1), True, "request_text", 1.0, raw))

        time_match = re.search(
            r"(?:只有|最多|不超过|控制在|限制在|想在|希望在)?\s*"
            r"(\d{1,3})\s*分钟(?:内|以内|左右|完成|做好|搞定)?",
            raw,
        )
        parsed_minutes = max(5, min(360, int(time_match.group(1)))) if time_match else None
        people_match = re.search(r"(\d{1,2})\s*(?:人|人份)", raw)
        parsed_people = max(1, min(20, int(people_match.group(1)))) if people_match else None
        return None, parsed_people, parsed_minutes

    @staticmethod
    def _dedupe_items(items: list[ConstraintEvidence]) -> list[ConstraintEvidence]:
        unique: dict[tuple[str, str], ConstraintEvidence] = {}
        for item in items:
            unique[(item.kind, _norm(item.value))] = item
        return list(unique.values())


class ConstraintGuard:
    """Deterministic safety and feasibility validation."""

    guard_name = "constraint_guard"

    def review(
        self,
        meal_pack: MealPack,
        constraints: ConstraintSet | ConstraintSpec,
        locale: str = "en",
    ) -> AgentReview:
        spec = constraints if isinstance(constraints, ConstraintSpec) else None
        values = constraints.to_constraint_set() if spec else constraints
        zh = locale.startswith("zh")
        findings: list[AgentFinding] = []
        findings.extend(self._allergy_findings(meal_pack, values, zh))
        findings.extend(self._diet_findings(meal_pack, values, zh))
        findings.extend(self._equipment_findings(meal_pack, values, spec, zh))
        findings.extend(self._time_findings(meal_pack, values, zh))
        status = "block" if any(item.severity == "high" for item in findings) else "warn" if findings else "pass"
        return AgentReview(agent=self.guard_name, status=status, findings=findings)

    def _allergy_findings(self, meal_pack: MealPack, constraints: ConstraintSet, zh: bool) -> list[AgentFinding]:
        findings: list[AgentFinding] = []
        for meal in meal_pack.meals:
            text = _composition_text(meal)
            for allergy in constraints.allergies:
                if _contains_term(text, allergy):
                    findings.append(AgentFinding(
                        type="allergy", severity="high", affected_items=[meal.id],
                        message=f"含有过敏源「{allergy}」" if zh else f"Contains allergen: {allergy}",
                        required_action="replace ingredient",
                    ))
        return findings

    def _diet_findings(self, meal_pack: MealPack, constraints: ConstraintSet, zh: bool) -> list[AgentFinding]:
        findings: list[AgentFinding] = []
        for meal in meal_pack.meals:
            text = _composition_text(meal)
            for rule in constraints.diet_rules:
                blocked = self.blocked_terms_for_rule(rule)
                if any(_contains_term(text, term) for term in blocked):
                    findings.append(AgentFinding(
                        type="diet_rule", severity="high", affected_items=[meal.id],
                        message=f"不符合饮食要求：{rule}" if zh else f"Conflicts with diet rule: {rule}",
                        required_action="replace ingredient",
                    ))
        return findings

    def _equipment_findings(
        self, meal_pack: MealPack, constraints: ConstraintSet, spec: ConstraintSpec | None, zh: bool
    ) -> list[AgentFinding]:
        available = {_norm(item) for item in constraints.equipment}
        excluded = {
            _norm(item.value) for item in (spec.items if spec else []) if item.kind == "excluded_equipment"
        }
        findings: list[AgentFinding] = []
        for meal in meal_pack.meals:
            missing = []
            for item in meal.equipment:
                normalized = _norm(item)
                explicitly_excluded = any(
                    normalized == value or value in EQUIPMENT_ALIASES.get(normalized, set())
                    for value in excluded
                )
                unavailable = bool(available) and not self._equipment_available(normalized, available)
                if explicitly_excluded or unavailable:
                    missing.append(item)
            if missing:
                joined = "、".join(missing) if zh else ", ".join(missing)
                findings.append(AgentFinding(
                    type="equipment", severity="high", affected_items=[meal.id],
                    message=f"当前条件不能使用厨具：{joined}" if zh else f"Unavailable equipment: {joined}",
                    required_action="replace cooking method",
                ))
        return findings

    @staticmethod
    def _time_findings(meal_pack: MealPack, constraints: ConstraintSet, zh: bool) -> list[AgentFinding]:
        findings: list[AgentFinding] = []
        for meal in meal_pack.meals:
            if meal.cook_time_minutes > constraints.max_cook_time_minutes:
                findings.append(AgentFinding(
                    type="time", severity="high", affected_items=[meal.id],
                    message=(f"烹饪时间 {meal.cook_time_minutes} 分钟，超出 {constraints.max_cook_time_minutes} 分钟限制" if zh else f"Cook time exceeds {constraints.max_cook_time_minutes} minutes"),
                    required_action="shorten recipe",
                ))
        return findings

    @staticmethod
    def blocked_terms_for_rule(rule: str) -> set[str]:
        normalized = _norm(rule)
        blocked: set[str] = set()
        for key, terms in DIET_RULE_BLOCKED_TERMS.items():
            if _norm(key) == normalized or _norm(key) in normalized:
                blocked.update(terms)
        if normalized.startswith("no "):
            blocked.add(normalized.removeprefix("no ").strip())
        for prefix in ("不要", "不吃", "去掉", "去", "无"):
            if rule.startswith(prefix) and len(rule) > len(prefix):
                blocked.add(rule[len(prefix):].strip())
        return {item for item in blocked if item}

    @staticmethod
    def _equipment_available(required: str, available: set[str]) -> bool:
        if required in available or EQUIPMENT_ALIASES.get(required, set()) & available:
            return True
        return any(
            required in item
            or item in required
            or required in EQUIPMENT_ALIASES.get(item, set())
            for item in available
        )
