import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { DEFAULT_AI_MODELS, type AIModelOption } from "@/lib/types";

function inferTier(modelId: string): AIModelOption["tier"] {
  const id = modelId.toLowerCase();
  if (id.includes("8b") || id.includes("20b") || id.includes("instant") || id.includes("mini"))
    return "fast";
  if (id.includes("70b") || id.includes("k2") || id.includes("qwen") || id.includes("large"))
    return "pro";
  return "balanced";
}

function prettyName(id: string): string {
  const base = id.includes("/") ? id.split("/").pop()! : id;
  return base
    .split(/[-_]/)
    .map((p) => (p.length <= 3 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)))
    .join(" ");
}

/** Keep only chat/completion text models — drop audio, guard and vision-only models. */
function shouldIncludeModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  if (
    id.includes("whisper") ||
    id.includes("tts") ||
    id.includes("guard") ||
    id.includes("prompt-guard") ||
    id.includes("distil-whisper") ||
    id.includes("embed")
  ) {
    return false;
  }
  return true;
}

const MAX_API_KEY_LENGTH = 256;

export async function GET(req: NextRequest) {
  // Each call can spend the server key (or a user key) on an upstream Groq
  // request, so it shares the same per-IP limiter as /api/generate-shader.
  const { ok, retryAfter } = checkRateLimit(getClientIp(req));
  if (!ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Please wait ${retryAfter}s before retrying.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const userKey = req.headers.get("x-api-key")?.trim() ?? "";
  if (userKey.length > MAX_API_KEY_LENGTH) {
    return NextResponse.json({ error: "Invalid API key." }, { status: 400 });
  }
  const apiKey = userKey || process.env.GROQ_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      models: DEFAULT_AI_MODELS,
      source: "fallback",
      warning: "Groq API key is missing. Showing fallback models.",
    });
  }

  try {
    const groq = new Groq({ apiKey });
    const list = await groq.models.list();
    const models: AIModelOption[] = [];
    for (const m of list.data ?? []) {
      const id = m.id;
      if (!id || !shouldIncludeModel(id)) continue;
      models.push({
        id,
        name: prettyName(id),
        provider: "Groq",
        tier: inferTier(id),
      });
    }

    const uniqueById = new Map<string, AIModelOption>();
    for (const m of models) uniqueById.set(m.id, m);
    const finalModels = [...uniqueById.values()];

    return NextResponse.json({
      models: finalModels.length > 0 ? finalModels : DEFAULT_AI_MODELS,
      source: finalModels.length > 0 ? "groq" : "fallback",
    });
  } catch (error) {
    console.error("[models]", error);
    return NextResponse.json(
      {
        models: DEFAULT_AI_MODELS,
        source: "fallback",
        warning: "Failed to load model list from Groq. Showing fallback models.",
      },
      { status: 200 },
    );
  }
}
