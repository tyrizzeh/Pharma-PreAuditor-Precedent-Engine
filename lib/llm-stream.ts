/**
 * Streaming LLM wrapper for real-time chat
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function* streamChatCompletion(
  systemPrompt: string,
  messages: ChatMessage[],
  documentContext?: { content: string; name: string }
): AsyncGenerator<string, void, unknown> {
  const provider = GEMINI_API_KEY ? "gemini" : OPENAI_API_KEY ? "openai" : null;
  if (!provider) {
    throw new Error("Add GEMINI_API_KEY or OPENAI_API_KEY to .env.local");
  }

  const docBlock =
    documentContext ?
      `\n\n[Attached document: ${documentContext.name}]\n${documentContext.content.slice(0, 14000)}\n[/Attached document]\n\n`
    : "";

  const fullSystemPrompt = systemPrompt + docBlock;

  if (provider === "gemini") {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: fullSystemPrompt,
      generationConfig: { maxOutputTokens: 8192 },
    });

    if (messages.length === 0) return;

    if (messages.length === 1 && messages[0].role === "user") {
      const result = await model.generateContentStream(messages[0].content);
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) yield text;
      }
      return;
    }

    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "user") return;

    const result = await chat.sendMessageStream(lastMessage.content);
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
    return;
  }

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const openaiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: fullSystemPrompt },
  ];

  for (const m of messages) {
    openaiMessages.push({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    });
  }

  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: openaiMessages,
    max_tokens: 8192,
    stream: true,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? "";
    if (text) yield text;
  }
}
