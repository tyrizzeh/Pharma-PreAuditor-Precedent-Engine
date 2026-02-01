import { NextRequest } from "next/server";
import { streamChatCompletion } from "@/lib/llm-stream";

const ASSISTANT_SYSTEM_PROMPT = `You are the FDA Whisperer—an AI assistant and Lead Regulatory Intelligence partner for Bio-Pharma. You think critically, analyze deeply, and engage in real-time conversation.

Your role:
- Think step-by-step and reason out loud when analyzing documents or answering regulatory questions
- Consider multiple angles: FDA precedent, therapeutic area trends, CMC/clinical risk, international alignment (EMA, etc.)
- Challenge assumptions when appropriate—don't just affirm; offer constructive pushback
- Be conversational and collaborative—like a senior colleague you can brainstorm with
- Cite FDA guidance, approval trends, CRL/RTF triggers, and precedents when relevant
- When given a document, analyze it critically: likelihood of success, stage-specific questions, approval factors, and risks
- Answer follow-up questions using the full conversation and document context

Tone: Professional but warm. Analytical but accessible. You're an expert partner, not a search engine.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body.messages ?? [];
    const documentContext = body.documentContent
      ? {
          content: body.documentContent as string,
          name: (body.documentName as string) || "Document",
        }
      : undefined;

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array required and must not be empty" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role !== "user") {
      return new Response(
        JSON.stringify({ error: "Last message must be from user" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamChatCompletion(
            ASSISTANT_SYSTEM_PROMPT,
            messages,
            documentContext
          )) {
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `[Error: ${err instanceof Error ? err.message : "Unknown error"}]`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Request failed",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
