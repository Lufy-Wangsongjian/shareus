export interface ChatAiTurn {
  nickname: string;
  message: string;
  type?: "text" | "image" | "ai";
}

export interface ChatAiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const SYSTEM_PROMPT = "你是 Shareus 私人观影房间里的 AI 助手。用简洁、友好的中文回答用户问题。可以聊电影、剧情、观影感受或日常话题。回答尽量简短，除非用户要求详细说明。";

export const DEFAULT_CHAT_AI_BASE_URL = "https://api.deepseek.com/v1";
export const DEFAULT_CHAT_AI_MODEL = "deepseek-chat";

export function buildChatAiHistory(messages: ChatAiTurn[]): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((entry) => entry.message.trim() && entry.type !== "image")
    .slice(-12)
    .map((entry) => ({
      role: entry.type === "ai" || entry.nickname === "AI助手" ? "assistant" as const : "user" as const,
      content: entry.type === "ai" ? entry.message : `${entry.nickname}: ${entry.message}`
    }));
}

export async function askChatAi(
  config: ChatAiConfig,
  question: string,
  history: ChatAiTurn[]
): Promise<string> {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...buildChatAiHistory(history),
        { role: "user", content: question }
      ],
      max_tokens: 800,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail ? `AI 请求失败 (${response.status})` : `AI 请求失败 (${response.status})`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("AI 未返回内容");
  }
  return content.slice(0, 2000);
}

export function createChatAiClient(config: ChatAiConfig | null) {
  if (!config) {
    return null;
  }

  return {
    ask(question: string, history: ChatAiTurn[]) {
      return askChatAi(config, question, history);
    }
  };
}
