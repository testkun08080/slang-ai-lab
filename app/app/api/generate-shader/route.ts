import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { normalizeSlangSource } from "@/lib/slang-normalize";
import { DEFAULT_AI_MODEL_ID } from "@/lib/types";

// Groq model ids can contain letters, digits, dots, dashes and slashes
// (e.g. "llama-3.3-70b-versatile", "moonshotai/kimi-k2-instruct").
const VALID_MODEL_PATTERN = /^[\w./-]+$/;
const MAX_MESSAGE_LENGTH = 8_000;
const MAX_TEXTURE_COUNT = 4;
const MAX_HISTORY_MESSAGES = 24;
// Texture slots are fixed to iChannel0..iChannel3; anything else is rejected
// because the id is interpolated into the system prompt and generated code.
const VALID_TEXTURE_ID_PATTERN = /^iChannel[0-3]$/;
const MAX_TEXTURE_NAME_LENGTH = 80;

const PROMPT_CORE = `You are Slang AI Lab, a professional Slang shader generation assistant.
Slang (https://shader-slang.org) is a modern shading language whose syntax is HLSL-like.
Its source is compiled in-browser by the real Slang compiler to WGSL and rendered with WebGPU.

Generate a single canonical Slang shader that matches the user's intent as closely as possible.

## MULTI-TURN BEHAVIOR
You may receive prior user and assistant messages. Assistant messages can include a
previous Slang shader in a marked section. When the latest user message requests edits
(tweak, refine, fix, faster, smoother, brighter, etc.):
1) Keep existing behavior that is not explicitly requested to change.
2) Apply only the requested deltas.
3) Preserve the uniform contract.

## REQUIREMENT EXTRACTION (INTERNAL REASONING)
From the latest user intent infer: primary visual effect, color direction, motion profile,
spatial style, and performance sensitivity. If underspecified, use pleasing animated motion
with moderate speed, balanced contrast, and smooth transitions.

## SLANG RULES
- CRITICAL: Declare EVERY uniform you reference at global scope BEFORE the entry points.
  Referencing an undeclared identifier (e.g. using u_time or u_resolution without a
  matching "uniform ..." line) makes the Slang compiler abort with
  "error[E30015]: undefined identifier". This is the #1 failure — never do it.
- Required uniforms (declare exactly these at global scope, in this order first):
  uniform float  u_time;      // seconds since start
  uniform float2 u_resolution; // canvas size in pixels
  uniform float2 u_mouse;      // NORMALIZED 0..1, top-left origin (same space as uv below)
- Any extra scalar/vector you use (u_speed, u_scale, ...) MUST also have its own
  "uniform ..." declaration, ideally with a @param annotation (see below).
- Fragment entry point:
  [shader("fragment")]
  float4 fragmentMain(float4 fragCoord : SV_Position) : SV_Target { ... }
- Screen UV: float2 uv = fragCoord.xy / u_resolution;  // top-left origin (y down)
- MOUSE CONTRACT: u_mouse lives in the SAME space as uv (0..1, top-left origin, y down).
  The pixel under the cursor satisfies uv == u_mouse, so distance(uv, u_mouse) is the
  distance to the cursor. NEVER flip u_mouse.y and never treat u_mouse as pixels.
- ASPECT RATIO: for any radial/geometric pattern use aspect-corrected coordinates so
  circles stay round:
    float2 p = (fragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
  Apply the same correction to the mouse when comparing against p:
    float2 m = (u_mouse * u_resolution * 2.0 - u_resolution) / u_resolution.y;
- Types: float, float2, float3, float4, float3x3, float4x4
- Functions: frac(), lerp(), saturate(), abs(), sin(), cos(), pow(), sqrt(), dot(), cross(), normalize(), length(), clamp(), smoothstep(), step()
- NEVER use GLSL syntax — this is Slang (HLSL-like), not GLSL. Common mistakes and their fixes:
    vec2/vec3/vec4  -> float2/float3/float4
    mix(a, b, t)    -> lerp(a, b, t)
    fract(x)        -> frac(x)
    mod(a, b)       -> fmod(a, b)   (or a - b * floor(a / b))
    texture2D(s, uv)-> s.Sample(sSampler, uv)
    gl_FragCoord    -> the fragCoord parameter of fragmentMain
    mat3/mat4       -> float3x3/float4x4
  Using any GLSL name above makes the Slang compiler abort with
  "error[E30015]: undefined identifier". Before finishing, re-check every
  function call and type name in your output against this list.
- All for-loops must use a constant integer upper bound.
- Return the final color as float4(rgb, 1.0).
- Max 300 lines.

## ARTISTIC QUALITY (this is what separates a great shader from a boring one)
Match the requested style with real rendering techniques — never fake an organic or
painterly style with plain sin/cos stripes. For any organic, natural or hand-made look,
build this helper stack and use it:
  1. hash: float hash(float2 p) { return frac(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
  2. valueNoise(float2 p): bilinear-smoothstep interpolation of hash at integer corners
  3. fbm(float2 p): 4-6 octaves of valueNoise, amplitude *= 0.5, frequency *= 2.0 per octave
  4. domain warp: fbm(p + k * fbm(p + t)) for flowing / bleeding / turbulent shapes
Style recipes (compose, adapt, and layer these):
- Ink wash / sumi-e (水墨画): monochrome palette on warm paper white (~float3(0.96,0.94,0.90));
  brush strokes = fbm ridges shaped with double smoothstep for a dark crisp edge that
  bleeds into a soft gray halo (ink diffusion); mountains = layered silhouettes with
  fbm-perturbed height, farther layers lighter (atmospheric perspective); add subtle
  paper grain (high-frequency hash) and leave generous empty space (余白).
- Watercolor: soft-edged fbm blobs, colors multiplied where layers overlap, edge darkening
  (higher pigment at shape borders), paper grain.
- Fire / smoke: domain-warped fbm scrolling upward (p.y - u_time), sharp orange→yellow
  ramp for fire, soft gray alpha falloff for smoke.
- Water / caustics: sum of layered voronoi-ish or interfering sine-warped noise, animated
  phase offsets, bright thin ridges.
- Clouds / aurora: multi-octave fbm with slow domain warp, lerped against sky gradient.
- Neon / glow: accumulate k / abs(sdf) style falloffs, additive blending of layers.
Composition rules: pick a deliberate limited palette; use aspect-corrected coords;
animate at moderate speed (u_time * 0.2..0.5 for calm styles); layer at least 2-3 depth
levels for richness. Reproduce the *feel* of the reference style, not a rough symbol of it.
Do not reproduce named copyrighted Shadertoy / published shaders verbatim — invent original variations.

## RENDERING MODEL — choose the right stage(s) for the request
Decide from the user's intent:
- Pure image / 2D / painterly / post-process effects: a single fragmentMain (the norm).
  The shader is rendered as a full-screen fragment effect (a fullscreen triangle drives
  fragmentMain).
- Geometry requests — a deforming mesh, waving grid/flag/ocean surface, particles,
  point fields, or ANY mention of vertex shaders / 頂点シェーダー: ALSO emit a custom
  vertex stage (see below) and put the geometry motion there. Honor explicit requests
  to write or modify the vertex stage even when a fragment-only approach could fake it.
- When the user asks to change only one stage of an existing shader, keep the other
  stage's behavior intact.

Custom vertex stage: emit a [shader("vertex")] entry point named exactly "vertexMain"
in the SAME Slang source. Rules when you do:
- The mesh has NO vertex buffer. Build geometry procedurally from the vertex id:
    [shader("vertex")] VOut vertexMain(uint vid : SV_VertexID) { ... }
- Output a struct whose SV_Position field is in clip space (x,y in -1..1), plus any
  varyings (e.g. float3 color : COLOR0) that fragmentMain reads back as its input.
- fragmentMain must take that SAME struct as its input (not float4 : SV_Position).
- Declare how many vertices to draw with a comment: "// @vertexCount N"
  (e.g. a 40x40 grid of quads = 40*40*6 = 9600). Keep N <= 200000.
- Animate vertices using u_time so the geometry visibly moves.

## PARAMETER ANNOTATIONS (user-adjustable uniforms)
Add a comment above the uniform to expose it in the UI:
  // @param u_speed {type: "float", min: 0, max: 5, step: 0.1, label: "Speed"}
  uniform float u_speed;
Supported types: "float", "vec2", "vec3", "vec4", "color", "int".
NEVER annotate u_time, u_resolution, u_mouse (auto-provided).

## AVAILABLE TEXTURES
[Injected dynamically when textures are uploaded]
Declare in Slang as:
  uniform Texture2D iChannelN; uniform SamplerState iChannelNSampler;
Sample with: iChannelN.Sample(iChannelNSampler, uv)

## OUTPUT FORMAT
Respond with a JSON object only. No markdown, no prose outside the JSON.
Emit the keys in EXACTLY this order — put the long "slang" source LAST so it
streams to the editor as one contiguous block after the short metadata:
{
  "title": "Short descriptive name",
  "description": "One sentence about the visual outcome",
  "warnings": ["compromises or unmet constraints, [] when none"],
  "slang": "/* full canonical Slang source */"
}

## LANGUAGE
Detect the language of the user's latest message and write title, description, warnings and
shader inline comments in that language.`;

interface TextureInfo {
  id: string;
  name: string;
  width: number;
  height: number;
}

function buildTextureSection(textures: TextureInfo[]): string {
  if (textures.length === 0) return "";
  const lines = textures.map(
    (t) => `- ${t.id}: "${t.name}" (${t.width}x${t.height})`,
  );
  const declareLines = textures
    .map(
      (t) =>
        `uniform Texture2D ${t.id}; uniform SamplerState ${t.id}Sampler;`,
    )
    .join("\n");
  return `

## AVAILABLE TEXTURES (these slots have user images bound in the preview)
${lines.join("\n")}

For every iChannelN you sample, include this exact declaration in the Slang source:
${declareLines}

Sample with iChannelN.Sample(iChannelNSampler, uv) where uv is float2 in 0..1.`;
}

type ChatMessage = { role: "user" | "assistant"; content: string };

interface ShaderJson {
  title?: string;
  description?: string;
  slang?: string;
  warnings?: string[];
}

/**
 * Parse the model's JSON response, tolerating models that wrap the JSON in
 * markdown code fences or add stray prose (kimi/qwen may not honor json_object).
 */
function parseShaderJson(raw: string): ShaderJson | null {
  const attempts: string[] = [raw];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.push(fenced[1]);
  const braced = raw.match(/\{[\s\S]*\}/);
  if (braced) attempts.push(braced[0]);
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate.trim());
      if (parsed && typeof parsed === "object") return parsed as ShaderJson;
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { ok, retryAfter } = checkRateLimit(ip);
  if (!ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Please wait ${retryAfter}s before retrying.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  try {
    const {
      prompt,
      messages: rawMessages,
      renderMode,
      apiKey,
      model = DEFAULT_AI_MODEL_ID,
      textures = [],
    } = (await req.json()) as {
      prompt?: string;
      messages?: ChatMessage[];
      renderMode: "2d" | "3d";
      apiKey?: string;
      model?: string;
      textures?: TextureInfo[];
    };

    if (model && !VALID_MODEL_PATTERN.test(model)) {
      return NextResponse.json({ error: "Invalid model ID." }, { status: 400 });
    }

    if (!Array.isArray(textures) || textures.length > MAX_TEXTURE_COUNT) {
      return NextResponse.json({ error: "Too many textures." }, { status: 400 });
    }

    // Texture ids/names are interpolated into the system prompt, so only the
    // fixed iChannelN slots are accepted and names are sanitized/truncated.
    const safeTextures: TextureInfo[] = [];
    for (const t of textures) {
      if (
        !t ||
        typeof t.id !== "string" ||
        !VALID_TEXTURE_ID_PATTERN.test(t.id) ||
        typeof t.name !== "string" ||
        !Number.isFinite(t.width) ||
        !Number.isFinite(t.height)
      ) {
        return NextResponse.json({ error: "Invalid texture info." }, { status: 400 });
      }
      safeTextures.push({
        id: t.id,
        name: t.name.replace(/[\r\n"]/g, " ").slice(0, MAX_TEXTURE_NAME_LENGTH),
        width: Math.trunc(t.width),
        height: Math.trunc(t.height),
      });
    }

    const key = (typeof apiKey === "string" && apiKey.trim()) || process.env.GROQ_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: "Groq API key is required. Add it in Settings." },
        { status: 400 },
      );
    }

    let messages: ChatMessage[];
    if (Array.isArray(rawMessages) && rawMessages.length > 0) {
      // Only user/assistant roles are accepted — a client-supplied "system"
      // role would override the server prompt and turn the endpoint (and the
      // server's default API key) into a general-purpose LLM proxy.
      messages = rawMessages
        .filter(
          (m): m is ChatMessage =>
            !!m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim().length > 0,
        )
        .map((m) => ({
          role: m.role,
          content: m.content.trim().slice(0, MAX_MESSAGE_LENGTH),
        }));
      if (messages.length > MAX_HISTORY_MESSAGES) {
        messages = messages.slice(-MAX_HISTORY_MESSAGES);
      }
      if (messages.length === 0) {
        return NextResponse.json(
          { error: "Send a prompt or a non-empty messages array." },
          { status: 400 },
        );
      }
    } else if (typeof prompt === "string" && prompt.trim()) {
      messages = [{ role: "user", content: prompt.trim().slice(0, MAX_MESSAGE_LENGTH) }];
    } else {
      return NextResponse.json(
        { error: "Send a prompt or a non-empty messages array." },
        { status: 400 },
      );
    }

    // renderMode is accepted for forward-compat but the renderer is 2D fullscreen only.
    void renderMode;
    const systemPrompt = PROMPT_CORE + buildTextureSection(safeTextures);

    const groq = new Groq({ apiKey: key });

    // Stream the model's tokens to the client as Server-Sent Events so the
    // editor can render the Slang code being written live. We accumulate the
    // raw JSON server-side and, once the stream completes, run the same
    // parse + normalize logic as before and emit an authoritative `final`
    // event whose payload matches the previous non-streaming response shape.
    const encoder = new TextEncoder();
    const sse = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let accumulated = "";
        try {
          const completion = await groq.chat.completions.create({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              ...messages,
            ],
            // 0.6 biases toward syntactic correctness while keeping visual variety;
            // 8000 tokens leaves room for a ~300-line shader inside the JSON envelope
            // (4096 truncated complex shaders and broke JSON parsing).
            temperature: 0.6,
            max_tokens: 8000,
            response_format: { type: "json_object" },
            stream: true,
          });

          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (delta) {
              accumulated += delta;
              controller.enqueue(sse({ type: "delta", text: delta }));
            }
          }

          const parsed = parseShaderJson(accumulated);
          if (!parsed?.slang) {
            controller.enqueue(
              sse({ type: "error", error: "The model did not return Slang shader code." }),
            );
            controller.close();
            return;
          }

          // Repair referenced-but-undeclared u_* uniforms so the in-browser
          // Slang compiler never aborts with "undefined identifier" (the common
          // Groq failure mode). Idempotent for well-formed output.
          const slang = normalizeSlangSource(parsed.slang);

          controller.enqueue(
            sse({
              type: "final",
              payload: {
                title: parsed.title,
                description: parsed.description,
                slang,
                warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
              },
            }),
          );
          controller.close();
        } catch (e) {
          console.error("[generate-shader]", e);
          controller.enqueue(sse({ type: "error", error: "Internal server error." }));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    console.error("[generate-shader]", e);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
