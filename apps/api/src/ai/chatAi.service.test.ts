import { describe, expect, it, vi } from "vitest";
import { askChatAi, buildChatAiHistory } from "./chatAi.service.js";

describe("buildChatAiHistory", () => {
  it("maps ai messages to assistant role", () => {
    expect(buildChatAiHistory([
      { nickname: "Alice", message: "你好", type: "text" },
      { nickname: "AI助手", message: "你好呀", type: "ai" }
    ])).toEqual([
      { role: "user", content: "Alice: 你好" },
      { role: "assistant", content: "你好呀" }
    ]);
  });

  it("skips image messages", () => {
    expect(buildChatAiHistory([
      { nickname: "Alice", message: "", type: "image" },
      { nickname: "Alice", message: "这张图怎么样", type: "text" }
    ])).toEqual([
      { role: "user", content: "Alice: 这张图怎么样" }
    ]);
  });
});

describe("askChatAi", () => {
  it("returns assistant content from OpenAI-compatible API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "  你好，我是 AI  " } }]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const answer = await askChatAi(
      { apiKey: "test-key", baseUrl: "https://example.com/v1", model: "test-model" },
      "你好",
      []
    );

    expect(answer).toBe("你好，我是 AI");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer test-key"
        })
      })
    );

    vi.unstubAllGlobals();
  });
});
