const INTERNAL_RECIPE_ERRORS = [
  "The generated recipe patch was invalid",
  "Ingredient already exists",
  "PatchValidationError",
];

export function isInternalRecipeError(message: string | null | undefined) {
  return Boolean(message && INTERNAL_RECIPE_ERRORS.some((marker) => message.includes(marker)));
}

export function recipeRunMessage(message: string | null | undefined, fallback: string) {
  if (!message) return fallback;
  if (isInternalRecipeError(message)) {
    return "这次没有生成可用的调整结果，请把要求写得更具体一点，或稍后重试。";
  }
  return message;
}
