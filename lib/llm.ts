/**
 * LLM helper - uses Gemini (free) when available, else OpenAI
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export type LLMProvider = "gemini" | "openai";

function getProvider(): LLMProvider | null {
  if (GEMINI_API_KEY?.trim()) return "gemini";
  if (OPENAI_API_KEY?.trim()) return "openai";
  return null;
}

export async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 2500
): Promise<string> {
  const provider = getProvider();
  if (!provider) {
    return "No API key configured. Add GEMINI_API_KEY or OPENAI_API_KEY to .env.local";
  }

  if (provider === "gemini") {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: systemPrompt,
      generationConfig: { maxOutputTokens: maxTokens },
    });
    const result = await model.generateContent(userPrompt);
    const response = result.response;
    const text = response.text();
    return text?.trim() ?? "No response generated.";
  }

  // OpenAI
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: maxTokens,
  });
  return completion.choices[0]?.message?.content?.trim() ?? "No response generated.";
}

export function hasLLM(): boolean {
  return getProvider() !== null;
}
