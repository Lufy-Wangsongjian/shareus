export const AI_MENTION = "@AI";

export function containsAiMention(message: string): boolean {
  return /@AI\b/i.test(message);
}

/** 从消息中提取 @AI 后的提问内容；无有效问题时返回 null */
export function extractAiQuestion(message: string): string | null {
  if (!containsAiMention(message)) {
    return null;
  }
  const question = message.replace(/@AI\s*/gi, " ").replace(/\s+/g, " ").trim();
  return question || null;
}
