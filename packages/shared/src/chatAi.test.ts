import { describe, expect, it } from "vitest";
import { containsAiMention, extractAiQuestion } from "./chatAi.js";

describe("chatAi mention helpers", () => {
  it("detects @AI mention", () => {
    expect(containsAiMention("@AI 你好")).toBe(true);
    expect(containsAiMention("大家 @AI 怎么看")).toBe(true);
    expect(containsAiMention("普通消息")).toBe(false);
  });

  it("extracts question after removing @AI", () => {
    expect(extractAiQuestion("@AI 这部电影讲什么")).toBe("这部电影讲什么");
    expect(extractAiQuestion("Alice @AI 你觉得呢")).toBe("Alice 你觉得呢");
    expect(extractAiQuestion("@AI")).toBeNull();
    expect(extractAiQuestion("没有提及")).toBeNull();
  });
});
