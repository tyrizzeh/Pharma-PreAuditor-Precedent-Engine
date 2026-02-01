/**
 * LLM wrapper: Gemini (free) or OpenAI
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 2048
): Promise<string> {
  const provider = GEMINI_API_KEY ? "gemini" : OPENAI_API_KEY ? "openai" : null;
  if (!provider) {
    throw new Error(
      "Add GEMINI_API_KEY or OPENAI_API_KEY to .env.local"
    );
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
    return result.response.text()?.trim() ?? "No response generated.";
  }

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: maxTokens,
  });
  return res.choices[0]?.message?.content?.trim() ?? "No response generated.";
}
