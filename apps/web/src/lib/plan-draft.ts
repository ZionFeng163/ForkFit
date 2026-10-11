export type PlanFormDraft = { days: number; peopleCount: number; requestText: string; entryText: string };

export function planDimensions(text: string): { days?: number; peopleCount?: number } {
  const numbers: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const number = (value: string) => numbers[value] ?? Number(value);
  const days = text.match(/(?<![\d一二两三四五六七八九十])([2-7二两三四五六七])\s*天|\b([2-7])\s*days?\b/i);
  const people = text.match(/(?<![\d一二两三四五六七八九十])(1[0-2]|[1-9一二两三四五六七八九十])\s*(?:个)?人|\b(1[0-2]|[1-9])\s*(?:people|persons?)\b/i);
  return { ...(days ? { days: number(days[1] || days[2]) } : {}), ...(people ? { peopleCount: number(people[1] || people[2]) } : {}) };
}

export function restorePlanDraft(value: unknown, initial: PlanFormDraft): PlanFormDraft {
  if (!value || typeof value !== "object") return initial;
  const draft = value as Partial<PlanFormDraft>;
  if (initial.entryText && draft.entryText !== initial.entryText) return initial;
  return {
    days: Number.isInteger(draft.days) && draft.days! >= 2 && draft.days! <= 7 ? draft.days! : initial.days,
    peopleCount: Number.isInteger(draft.peopleCount) && draft.peopleCount! >= 1 && draft.peopleCount! <= 12 ? draft.peopleCount! : initial.peopleCount,
    requestText: typeof draft.requestText === "string" ? draft.requestText.slice(0, 1500) : initial.requestText,
    entryText: typeof draft.entryText === "string" ? draft.entryText : initial.entryText,
  };
}
