const normaliseEchoText = (value: string | null | undefined): string => {
  return String(value || "")
    .trim()
    .toLowerCase();
};

export const isWhyLineEcho = (
  why: string | null | undefined,
  title: string | null | undefined,
): boolean => {
  if (!why || !title) return false;
  try {
    return normaliseEchoText(why) === normaliseEchoText(title);
  } catch {
    return false;
  }
};
