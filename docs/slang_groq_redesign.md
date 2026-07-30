# Slang AI Lab — Slang × Groq リデザイン設計書

> **方針：**
> - AIは Slang コードの生成のみに専念する（GLSL変換はAIに任せない）
> - Slang → GLSL の変換は `slangc` CLI を `child_process` で呼び出して行う
> - 頂点シェーダーとフラグメントシェーダーは別ファイルとして管理する

---

## 1. Slangとは（前提知識）

[Slang](https://shader-slang.org) は NVIDIA 主導のオープンソース シェーダー言語。  
HLSL を上位互換に拡張し、**単一ソースから GLSL / HLSL / WGSL / Metal / SPIR-V へコンパイルできる**。

```slang
// 頂点シェーダー（vertex.slang）
struct VSInput  { float4 pos : POSITION; float2 uv : TEXCOORD0; };
struct PSInput  { float4 pos : SV_Position; float2 uv : TEXCOORD0; };

[shader("vertex")]
PSInput vertexMain(VSInput input)
{
    PSInput o;
    o.pos = input.pos;
    o.uv  = input.uv;
    return o;
}

// フラグメントシェーダー（fragment.slang）
uniform float  u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;

[shader("fragment")]
float4 fragmentMain(float4 pos : SV_Position) : SV_Target
{
    float2 uv = pos.xy / u_resolution;
    float3 col = float3(uv, sin(u_time) * 0.5 + 0.5);
    return float4(col, 1.0);
}
```

**GLSL との主な型名の違い：**

| GLSL | Slang |
|---|---|
| `vec2 / vec3 / vec4` | `float2 / float3 / float4` |
| `mat4 / mat3` | `float4x4 / float3x3` |
| `fract()` | `frac()` |
| `mix()` | `lerp()` |
| `clamp(x, 0, 1)` | `saturate(x)` |
| `sampler2D` | `Texture2D + SamplerState` |
| `texture2D(s, uv)` | `s.Sample(sampler, uv)` |

---

## 2. アーキテクチャ全体図

```
ユーザーのプロンプト
       │
       ▼
┌────────────────────────┐
│  AI (Groq)              │  POST /api/generate-shader
│  Slangコードを生成するのみ │  出力: { slangFragment, slangVertex, title, warnings }
└──────────┬─────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  shader-playground.tsx（状態管理）│
│  slangFragment: string           │  ← エディタ(fragment タブ)の内容
│  slangVertex:   string           │  ← エディタ(vertex タブ)の内容
│  fragmentShader: string          │  ← WebGL用にコンパイル済みGLSL（描画専用）
│  vertexShader:   string          │  ← 同上
└────────┬─────────────────────────┘
         │  slangFragment / slangVertex が変更されたとき
         ▼
POST /api/compile-slang
  slangc を child_process で実行
  fragment.slang → GLSL ES 1.00
  vertex.slang   → GLSL ES 1.00
         │
         ▼
┌──────────────────────┐
│  shader-canvas.tsx    │  GLSLを受け取りWebGLで描画（変更なし）
└──────────────────────┘

エクスポート時:
  slangc -target hlsl / wgsl / metal / spirv
  → ダウンロード
```

---

## 3. slangc のセットアップ（前提条件）

```bash
# GitHub Releases からバイナリを取得
# https://github.com/shader-slang/slang/releases
# macOS: slang-<version>-macos-aarch64.zip または x86_64.zip

# インストール
unzip slang-*.zip
sudo cp slangc /usr/local/bin/

# 確認
slangc --version
```

`slangc` が PATH に入っていることが本アプリの動作前提。  
開発者は各自でインストールする。

---

## 4. データモデル変更（`lib/types.ts`）

### 4-1. `ShaderProject`

```typescript
// 変更前
export interface ShaderProject {
  id: string;
  name: string;
  vertexShader: string;
  fragmentShader: string;
  language: "glsl" | "hlsl";
  ...
}

// 変更後
export interface ShaderProject {
  id: string;
  name: string;
  // WebGL描画用（コンパイル済みGLSL。slangcの出力を格納）
  vertexShader: string;
  fragmentShader: string;
  language: "glsl" | "hlsl" | "slang";   // "slang" を追加
  ...
  // Slangモード時の正規ソース（エディタで表示・編集する）
  slangVertex?: string;    // 頂点シェーダーの Slang ソース
  slangFragment?: string;  // フラグメントシェーダーの Slang ソース
  // エクスポートキャッシュ（/api/compile-slangの結果を保存）
  hlslSource?: string;
  wgslSource?: string;
}
```

### 4-2. `AIShaderHistoryEntry`

```typescript
// 変更後
export interface AIShaderHistoryEntry {
  id: string;
  createdAt: number;
  summary: string;
  fragmentShader: string;   // GLSL（既存）
  vertexShader: string;     // GLSL（既存）
  slangFragment?: string;   // 追加
  slangVertex?: string;     // 追加
}
```

### 4-3. `DEFAULT_AI_MODELS`

```typescript
// 変更後（Gemini → Groq）
export const DEFAULT_AI_MODELS: AIModelOption[] = [
  { id: "llama-3.1-8b-instant",        name: "Llama 3.1 8B Instant",    provider: "Groq", tier: "fast"     },
  { id: "llama-3.3-70b-versatile",     name: "Llama 3.3 70B Versatile", provider: "Groq", tier: "balanced" },
  { id: "moonshotai/kimi-k2-instruct", name: "Kimi K2 Instruct",        provider: "Groq", tier: "pro"      },
  { id: "qwen/qwen3-32b",              name: "Qwen3 32B",               provider: "Groq", tier: "pro"      },
];
```

---

## 5. Slangコンパイル戦略（ブラウザ優先）

### 5-0. 基本方針

```
【優先】slang-wasm（ブラウザ内実行）
  ↓ ロード失敗 or コンパイルエラー時のみ
【フォールバック】/api/compile-slang（サーバー側 slangc CLI）
```

AIはSlangコードを生成するだけ。変換はブラウザ内で完結させ、APIコールを不要にする。

---

### 5-0-1. slang-wasm のセットアップ

```bash
# GitHub Releases からバイナリを取得
# https://github.com/shader-slang/slang/releases
# ファイル: slang-wasm.js / slang-wasm.wasm

mkdir -p app/public/slang/
cp slang-wasm.js  app/public/slang/
cp slang-wasm.wasm app/public/slang/
```

`public/slang/` に配置することで Next.js が `/slang/slang-wasm.js` として静的配信する。  
CDN依存なし、オフライン動作可能。

---

### 5-0-2. slang-wasm の使い方

> ⚠️ **要確認：** 正確なAPIは Slang Playground のソースを参照して確認すること。  
> https://github.com/shader-slang/slang-playground/tree/main/src  
> 以下は公開情報から得た概要。実装前にPlaygroundのコードで確認・修正すること。

```typescript
// lib/slang-wasm-loader.ts

let slangModule: any = null;
let globalSession: any = null;

export async function initSlangWasm(): Promise<boolean> {
  try {
    // ブラウザのみで動作（SSRでは実行しない）
    if (typeof window === "undefined") return false;

    const mod = await import("/slang/slang-wasm.js");
    slangModule = await mod.default();         // ← API要確認
    globalSession = slangModule.createGlobalSession?.();  // ← API要確認
    return true;
  } catch (e) {
    console.warn("[slang-wasm] load failed, will use API fallback", e);
    return false;
  }
}

export function isSlangWasmReady(): boolean {
  return slangModule !== null;
}

// Slang → 指定ターゲットのコードを返す
// target: "glsl" | "hlsl" | "wgsl" | "metal" | "spirv"
export function compileWithWasm(
  slangSource: string,
  entryPoint: string,     // "fragmentMain" or "vertexMain"
  target: string,
): { code: string; error?: string } {
  if (!slangModule || !globalSession) {
    return { code: "", error: "slang-wasm not initialized" };
  }
  try {
    // ⚠️ 以下のAPI呼び出しはPlaygroundソースで確認・修正すること
    const session  = globalSession.createSession(target);            // 要確認
    const module   = session.loadModuleFromSource(slangSource, "shader", "/shader.slang"); // 要確認
    const ep       = module.findEntryPointByName(entryPoint);        // 要確認
    const linked   = session.createCompositeComponentType([module, ep]); // 要確認
    const program  = linked.link();                                  // 要確認
    const code     = program.getTargetCode(0);                      // 要確認
    return { code };
  } catch (e: any) {
    return { code: "", error: String(e) };
  }
}
```

---

### 5-0-3. lib/slang-compiler.ts（ブラウザ優先 + APIフォールバック）

```typescript
// lib/slang-compiler.ts
import { initSlangWasm, isSlangWasmReady, compileWithWasm } from "./slang-wasm-loader";

export type SlangCompileTarget = "glsl" | "hlsl" | "wgsl" | "metal" | "spirv";

export interface SlangCompileResult {
  fragmentCode: string;
  vertexCode?: string;
  method: "wasm" | "api";
  warnings: string[];
}

let wasmInitialized = false;
let wasmAvailable   = false;

// アプリ起動時に一度だけ呼ぶ（layout.tsx か shader-playground.tsx の useEffect）
export async function ensureSlangWasm(): Promise<boolean> {
  if (wasmInitialized) return wasmAvailable;
  wasmInitialized = true;
  wasmAvailable   = await initSlangWasm();
  return wasmAvailable;
}

export async function compileSlang(
  slangFragment: string,
  slangVertex: string | undefined,
  target: SlangCompileTarget = "glsl",
): Promise<SlangCompileResult> {

  // ① ブラウザ内 WASM（優先）
  if (isSlangWasmReady()) {
    const frag = compileWithWasm(slangFragment, "fragmentMain", target);
    const vert = slangVertex
      ? compileWithWasm(slangVertex, "vertexMain", target)
      : undefined;

    if (!frag.error) {
      return {
        fragmentCode: frag.code,
        vertexCode:   vert?.code,
        method:       "wasm",
        warnings:     [],
      };
    }
    console.warn("[slang-wasm] compile error, falling back to API:", frag.error);
  }

  // ② APIフォールバック（slangc CLI）
  const res = await fetch("/api/compile-slang", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slangFragment, slangVertex, target }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? err.error ?? "Slang compilation failed");
  }

  const data = await res.json();
  return {
    fragmentCode: data.code ?? "",
    vertexCode:   data.vertex,
    method:       "api",
    warnings:     data.warnings ?? [],
  };
}
```

---

### 5-0-4. WASM 初期化タイミング（shader-playground.tsx）

```typescript
// shader-playground.tsx の useEffect（マウント時に1回）
useEffect(() => {
  ensureSlangWasm().then(available => {
    if (available) console.info("[slang-wasm] ready");
    else           console.info("[slang-wasm] unavailable, using API fallback");
  });
}, []);
```

---

## 5. ファイル別変更詳細

### 5-1. `app/app/api/generate-shader/route.ts`（**完全書き換え**）

**役割：** AIにSlangコードを生成させる。GLSLは生成させない。

**依存パッケージ：**
```bash
npm install groq-sdk          # 1.3.0
npm remove @ai-sdk/google @google/genai ai   # 削除前に他ファイルで使用していないか確認
```

**Groq SDK 使用パターン：**
```typescript
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const completion = await groq.chat.completions.create({
  model,           // "llama-3.3-70b-versatile" 等
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    ...chatHistory,
  ],
  temperature: 0.7,
  max_tokens: 4096,
  response_format: { type: "json_object" },  // 構造化JSON出力
});

const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
```

> **注意：** `response_format: { type: "json_object" }` は llama-3.3-70b / llama-3.1-8b では動作確認済み。
> kimi-k2 / qwen3-32b では通常テキストとしてJSONを返す場合があるため、
> `JSON.parse` の失敗をキャッチしてエラーを返す処理を必ず実装すること。

**APIレスポンス型（新）：**
```typescript
// route.ts が返す JSON
{
  title: string;
  description: string;
  slangFragment: string;   // フラグメントシェーダーの Slang ソース
  slangVertex?: string;    // 頂点シェーダーの Slang ソース（3Dモード時）
  warnings: string[];
}
```

**システムプロンプト全文：**

```
You are Slang AI Lab, a shader generation assistant that writes Slang shader code.
Slang (https://shader-slang.org) is a modern shading language with HLSL-like syntax.
It compiles to GLSL, HLSL, WGSL, Metal, and SPIR-V.

Your job is ONLY to generate Slang shader source code.
Do NOT generate GLSL. Do NOT generate HLSL. Do NOT generate any other language.

## SLANG SYNTAX RULES

Fragment shader entry point (always required):
  [shader("fragment")]
  float4 fragmentMain(float4 pos : SV_Position) : SV_Target
  {
      // ...
      return float4(r, g, b, 1.0);
  }

Vertex shader entry point (required for 3D mode only):
  struct VSInput { float4 pos : POSITION; float3 normal : NORMAL; float2 uv : TEXCOORD0; };
  struct PSInput { float4 pos : SV_Position; float3 normal : TEXCOORD0; float2 uv : TEXCOORD1; };

  [shader("vertex")]
  PSInput vertexMain(VSInput input)
  {
      PSInput o;
      o.pos    = mul(u_projectionMatrix, mul(u_modelViewMatrix, input.pos));
      o.normal = mul((float3x3)u_normalMatrix, input.normal);
      o.uv     = input.uv;
      return o;
  }

Types:        float, float2, float3, float4, float4x4, float3x3, int, bool
Math:         frac(), lerp(), saturate(), abs(), sin(), cos(), pow(), sqrt()
              dot(), cross(), normalize(), length(), clamp(), step(), smoothstep()
              mul() for matrix multiplication
Constructors: float3(r, g, b) / float4(rgb, a) / float4x4(...)
Cast:         (float3x3)mat4  for matrix downsizing

## AUTO-PROVIDED UNIFORMS (do NOT declare these — they are injected automatically)
uniform float    u_time;           // animation time in seconds
uniform float2   u_resolution;     // canvas size in pixels
uniform float2   u_mouse;          // normalized mouse position [0,1]
// 3D mode only:
uniform float4x4 u_modelViewMatrix;
uniform float4x4 u_projectionMatrix;
uniform float3x3 u_normalMatrix;   // cast from float4x4, passed separately

## TEXTURES (declare only when textures are available)
uniform Texture2D    iChannelN;        // N = 0,1,2,3
uniform SamplerState iChannelNSampler;
float4 col = iChannelN.Sample(iChannelNSampler, uv);

## PARAMETER ANNOTATIONS
Place immediately before the uniform declaration (not on auto-provided uniforms):
// @param u_speed {type:"float", min:0, max:5, step:0.1, label:"Speed"}
Supported types: "float", "float2", "float3", "float4", "color", "int"

## MULTI-TURN BEHAVIOR
When the user asks for changes, preserve everything not explicitly requested.
Apply only the minimum delta needed.

## OUTPUT FORMAT
Respond with JSON only. No markdown code fences. No explanatory text outside the JSON.
{
  "title": "...",
  "description": "...",
  "slangFragment": "...",
  "slangVertex": "",
  "warnings": []
}
slangVertex is empty string "" when not needed (2D mode or no vertex changes).
Detect the user's language. Write title, description, and shader comments in that language.
```

---

### 5-2. `app/app/api/compile-slang/route.ts`（**新規作成 / 書き換え**）

**役割：** `slangc` CLI を呼び出して Slang → GLSL / HLSL / WGSL / Metal / SPIR-V へ変換する。

```
POST /api/compile-slang
Request:  { slangFragment: string, slangVertex?: string, target: "glsl"|"hlsl"|"wgsl"|"metal"|"spirv" }
Response: { glsl?: string, vertex?: string, code?: string, target: string, warnings: string[] }
```

**実装骨格：**

```typescript
import { exec }    from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { tmpdir }  from "os";
import path        from "path";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const execAsync = promisify(exec);

async function compileSlang(source: string, entryPoint: string, target: string): Promise<string> {
  const id   = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const dir  = tmpdir();
  const inFile  = path.join(dir, `${id}.slang`);
  const outFile = path.join(dir, `${id}.out`);

  const ext = target === "glsl" ? "frag" : target;

  try {
    await writeFile(inFile, source, "utf-8");
    await execAsync(
      `slangc "${inFile}" -entry ${entryPoint} -target ${target} -o "${outFile}.${ext}"`,
      { timeout: 15_000 }   // 15秒タイムアウト
    );
    return await readFile(`${outFile}.${ext}`, "utf-8");
  } finally {
    await unlink(inFile).catch(() => {});
    await unlink(`${outFile}.${ext}`).catch(() => {});
  }
}

export async function POST(req: NextRequest) {
  // レートリミット（lib/rate-limit.ts を使用）
  const ip = getClientIp(req);
  const limit = checkRateLimit(ip);
  if (!limit.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { slangFragment, slangVertex, target = "glsl" } = await req.json();

  try {
    const glsl    = await compileSlang(slangFragment, "fragmentMain", target);
    const vertex  = slangVertex
      ? await compileSlang(slangVertex, "vertexMain", target)
      : undefined;

    return NextResponse.json({ code: glsl, vertex, target, warnings: [] });
  } catch (err: any) {
    // slangc のエラー出力をそのままクライアントへ
    return NextResponse.json(
      { error: "Slang compilation failed", detail: err.stderr ?? String(err) },
      { status: 400 }
    );
  }
}
```

**エラーハンドリング方針：**
- `slangc` が存在しない場合 → `exec` がエラーを throw → `error: "Slang compilation failed"` を返す
- コンパイルエラー（構文ミス等）→ `err.stderr` に slangc のエラーメッセージが入る → そのままクライアントへ渡す
- クライアント側（`shader-canvas.tsx` の既存のコンパイルエラー表示）でそのまま表示できる

---

### 5-3. `app/app/api/models/route.ts`（**完全書き換え**）

```typescript
import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_AI_MODELS, type AIModelOption } from "@/lib/types";

// シェーダー生成に使えないモデルを除外
function shouldIncludeModel(id: string): boolean {
  const lower = id.toLowerCase();
  const excluded = ["whisper", "tts", "guard", "vision", "audio", "speech", "embed"];
  return !excluded.some(w => lower.includes(w));
}

function inferTier(id: string): AIModelOption["tier"] {
  if (id.includes("70b") || id.includes("k2") || id.includes("32b")) return "pro";
  if (id.includes("8b")  || id.includes("instant"))                  return "fast";
  return "balanced";
}

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key") || process.env.GROQ_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      models: DEFAULT_AI_MODELS,
      source: "fallback",
      warning: "Groq API key is missing. Showing default models.",
    });
  }

  try {
    const groq  = new Groq({ apiKey });
    const list  = await groq.models.list();   // { data: Model[] }
    const models: AIModelOption[] = list.data
      .filter(m => shouldIncludeModel(m.id))
      .map(m => ({
        id:       m.id,
        name:     m.id,
        provider: "Groq",
        tier:     inferTier(m.id),
      }));

    return NextResponse.json({
      models: models.length > 0 ? models : DEFAULT_AI_MODELS,
      source: models.length > 0 ? "groq" : "fallback",
    });
  } catch (err) {
    console.error("[models]", err);
    return NextResponse.json({
      models: DEFAULT_AI_MODELS,
      source: "fallback",
      warning: "Failed to load model list from Groq. Showing fallback models.",
    });
  }
}
```

---

### 5-4. `lib/slang-compiler.ts`（**新規作成 — シンプル版**）

WASM不要。`/api/compile-slang` を呼ぶだけのクライアント側ユーティリティ。

```typescript
// ブラウザ / サーバー共通で使えるAPIクライアント

export type SlangCompileTarget = "glsl" | "hlsl" | "wgsl" | "metal" | "spirv";

export interface SlangCompileResult {
  fragmentCode: string;
  vertexCode?: string;
  target: SlangCompileTarget;
  warnings: string[];
}

export async function compileSlang(
  slangFragment: string,
  slangVertex: string | undefined,
  options: {
    target: SlangCompileTarget;
    apiKey?: string;  // 将来の認証用（現在未使用）
  }
): Promise<SlangCompileResult> {
  const res = await fetch("/api/compile-slang", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slangFragment,
      slangVertex: slangVertex || undefined,
      target: options.target,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? err.error ?? "Slang compilation failed");
  }

  const data = await res.json();
  return {
    fragmentCode: data.code ?? "",
    vertexCode:   data.vertex,
    target:       data.target,
    warnings:     data.warnings ?? [],
  };
}
```

---

### 5-5. `lib/slang-templates.ts`（**新規作成**）

AIが参照するデフォルトテンプレート。`slangFragment` / `slangVertex` のペアで管理。

```typescript
export interface SlangTemplate {
  id: string;
  name: string;
  slangFragment: string;
  slangVertex?: string;   // 2Dは不要
}

export const DEFAULT_SLANG_FRAGMENT = `
[shader("fragment")]
float4 fragmentMain(float4 pos : SV_Position) : SV_Target
{
    float2 uv = pos.xy / u_resolution;
    float t   = u_time * 0.5;
    float3 col = float3(
        0.5 + 0.5 * sin(uv.x * 3.14159 + t),
        0.5 + 0.5 * sin(uv.y * 3.14159 + t + 2.094),
        0.5 + 0.5 * sin((uv.x + uv.y) * 3.14159 + t + 4.189)
    );
    return float4(col, 1.0);
}`.trim();

export const DEFAULT_SLANG_VERTEX_3D = `
struct VSInput { float4 pos : POSITION; float3 normal : NORMAL; float2 uv : TEXCOORD0; };
struct PSInput { float4 pos : SV_Position; float3 normal : TEXCOORD0; float2 uv : TEXCOORD1; float3 worldPos : TEXCOORD2; };

[shader("vertex")]
PSInput vertexMain(VSInput input)
{
    PSInput o;
    float4 worldPos = mul(u_modelViewMatrix, input.pos);
    o.pos      = mul(u_projectionMatrix, worldPos);
    o.normal   = mul((float3x3)u_normalMatrix, input.normal);
    o.uv       = input.uv;
    o.worldPos = worldPos.xyz;
    return o;
}`.trim();
```

---

### 5-6. `components/code-editor.tsx`（**部分変更**）

**変更1：** `language` props の型

```typescript
// 変更前
interface CodeEditorProps { language: 'glsl' | 'hlsl' }

// 変更後
interface CodeEditorProps { language: 'glsl' | 'hlsl' | 'slang' }
```

**変更2：** Slang はHLSLのキーワードセットを流用（文法がほぼ同一）

```typescript
// 既存のコードはそのまま動く。'slang' → HLSL_KEYWORDS / HLSL_BUILTINS を使う
const keywords = language === 'glsl' ? GLSL_KEYWORDS : HLSL_KEYWORDS
const builtins = language === 'glsl' ? GLSL_BUILTINS : HLSL_BUILTINS
```

**変更3：** `HLSL_KEYWORDS` に Slang 固有キーワードを追記

```typescript
// HLSL_KEYWORDS 配列の末尾に追加
'[shader', 'interface', 'import', 'extension', 'Differentiable', 'NoDiff',
'associatedtype', 'property', 'get', 'set',
```

---

### 5-7. `components/ai-chat-panel.tsx`（**部分変更**）

**変更1：** `AIChatPanelProps.language` の型

```typescript
interface AIChatPanelProps {
  language: 'glsl' | 'hlsl' | 'slang'  // 'slang' を追加
  onShaderGenerated: (
    vertex: string,
    fragment: string,
    meta?: {
      summary?: string;
      targetProjectId?: string | null;
      slangFragment?: string;   // 追加
      slangVertex?: string;     // 追加
    }
  ) => void
  // ... 他は変更なし
}
```

**変更2：** APIレスポンス型とコールバック呼び出し（約261〜290行目）

```typescript
// 変更前
const data = await res.json() as {
  webgl?: string; vertexWebgl?: string; description?: string; warnings?: string[]; error?: string;
}
const fragment = data.webgl!
onShaderGenerated(data.vertexWebgl ?? '', fragment, { summary, targetProjectId })

// 変更後
const data = await res.json() as {
  slangFragment?: string;
  slangVertex?: string;
  title?: string;
  description?: string;
  warnings?: string[];
  error?: string;
}

// slangFragment を compileSlang()（WASM優先 → APIフォールバック）でGLSLに変換
import { compileSlang } from "@/lib/slang-compiler";

let fragment = '';
let vertex   = '';

if (data.slangFragment) {
  const compiled = await compileSlang(
    data.slangFragment,
    data.slangVertex || undefined,
    "glsl",
  );
  fragment = compiled.fragmentCode;
  vertex   = compiled.vertexCode ?? '';
}

if (!fragment) return;  // コンパイル失敗時は何もしない（エラー表示はコンパイルAPIが担う）

onShaderGenerated(vertex, fragment, {
  summary: data.description || data.title || 'AI generated shader',
  targetProjectId,
  slangFragment: data.slangFragment,
  slangVertex:   data.slangVertex,
})
```

---

### 5-8. `components/shader-playground.tsx`（**部分変更**）

**変更1：** デフォルトモデル（82行目付近）

```typescript
const defaultSettings: AISettings = {
  model: "llama-3.3-70b-versatile",   // "gemini-2.5-flash" から変更
  ...
}
```

**変更2：** `slangFragment` / `slangVertex` state 追加（state宣言ブロックに追記）

```typescript
const [slangFragment, setSlangFragment] = useState<string>("");
const [slangVertex,   setSlangVertex]   = useState<string>("");
```

**変更3：** `handleShaderGenerated`（738行目付近）

```typescript
// meta に slangFragment / slangVertex を追加
const handleShaderGenerated = useCallback(
  (
    vertexIn: string,
    fragmentIn: string,
    meta?: {
      summary?: string;
      targetProjectId?: string | null;
      slangFragment?: string;
      slangVertex?: string;
    }
  ) => {
    const incomingSlangFrag = meta?.slangFragment ?? "";
    const incomingSlangVert = meta?.slangVertex   ?? "";

    // ... 既存のプロジェクト更新ロジック（fragmentIn, vertexIn はGLSL）...

    // ShaderProject に slang フィールドを追加
    const newProject: ShaderProject = {
      ...existing,
      vertexShader:   nextVertex,          // GLSL（WebGL用）
      fragmentShader: fragmentWithInjectedParams,  // GLSL（WebGL用）
      language:       incomingSlangFrag ? "slang" : "glsl",
      slangFragment:  incomingSlangFrag || undefined,
      slangVertex:    incomingSlangVert || undefined,
      updatedAt:      now,
    };

    // currentProjectId と一致する場合のみ state を更新
    if (targetProjectId === currentProjectId) {
      setFragmentShader(fragmentWithInjectedParams);
      setVertexShader(nextVertex);
      setSlangFragment(incomingSlangFrag);
      setSlangVertex(incomingSlangVert);
    }
  }
)
```

**変更4：** `handleSelectProject`（570行目付近）

```typescript
setFragmentShader(project.fragmentShader);
setVertexShader(project.vertexShader);
setSlangFragment(project.slangFragment ?? "");  // 追加
setSlangVertex(project.slangVertex   ?? "");  // 追加
```

**変更5：** エディタへの props 渡し

```typescript
const currentProject = projects.find(p => p.id === currentProjectId);
const isSlang = currentProject?.language === "slang";

// エディタに渡す value と onChange
const editorValue = editorTab === "vertex"
  ? (isSlang ? slangVertex   : vertexShader)
  : (isSlang ? slangFragment : fragmentShader);

const editorOnChange = editorTab === "vertex"
  ? (isSlang ? setSlangVertex   : setVertexShader)
  : (isSlang ? setSlangFragment : setFragmentShader);

<CodeEditor
  value={editorValue}
  onChange={editorOnChange}
  language={editorTab === "vertex" ? "glsl" : (isSlang ? "slang" : "glsl")}
  // 頂点シェーダーはSlangモードでもGLSLハイライト（vertex.slangは編集頻度が低いため）
  // ※ 将来的に vertex タブも "slang" に変えてよい
  ...
/>
```

**変更6：** Slang手動編集のデバウンス（`useEffect` 追加）

```typescript
// slangFragment または slangVertex が手動編集されたとき、slangcでGLSLに再コンパイル
useEffect(() => {
  if (!slangFragment.trim()) return;
  const currentProject = projects.find(p => p.id === currentProjectId);
  if (currentProject?.language !== "slang") return;

  const timer = setTimeout(async () => {
    try {
      const result = await compileSlang(slangFragment, slangVertex || undefined, "glsl");
      // result.method === "wasm" → ブラウザ内変換
      // result.method === "api"  → slangcフォールバック（自動）
      if (result.fragmentCode) setFragmentShader(result.fragmentCode);
      if (result.vertexCode)   setVertexShader(result.vertexCode);
    } catch (e) {
      console.warn("[slang-compile]", e);
      // エラーは shader-canvas.tsx の既存エラー表示が検出・表示する
    }
  }, 1200);  // 1.2秒デバウンス

  return () => clearTimeout(timer);
}, [slangFragment, slangVertex, currentProjectId, projects]);
```

**変更7：** エクスポートダイアログ

```typescript
// exportFormat の型拡張
const [exportFormat, setExportFormat] = useState<"glsl" | "hlsl" | "wgsl" | "metal" | "slang">("glsl");

// downloadShader を非同期に変更
const downloadShader = async (format: typeof exportFormat) => {
  if (format === "slang") {
    // Slang ソースをそのままダウンロード
    download(editorTab === "vertex" ? slangVertex : slangFragment, "shader.slang");
    return;
  }
  if (format === "glsl") {
    download(editorTab === "vertex" ? vertexShader : fragmentShader, "shader.frag");
    return;
  }
  // hlsl / wgsl / metal → compileSlang()（WASM優先 → slangcフォールバック）で変換
  const currentProject = projects.find(p => p.id === currentProjectId);
  const srcFrag = currentProject?.slangFragment ?? fragmentShader;
  const srcVert = currentProject?.slangVertex;
  const result  = await compileSlang(srcFrag, srcVert, format);
  if (result.fragmentCode) download(result.fragmentCode, `shader.${format}`);
};
```

---

### 5-9. `components/settings-panel.tsx`（**部分変更 — テキストのみ**）

| 変更前 | 変更後 |
|---|---|
| `"Google AI Studio API Key"` | `"Groq API Key"` |
| `placeholder="AIza..."` | `placeholder="gsk_..."` |
| `href="https://aistudio.google.com/apikey"` | `href="https://console.groq.com/keys"` |
| `"Get an API key from Google AI Studio"` | `"Get a free API key from console.groq.com"` |
| `"Loading latest models from Google AI Studio..."` | `"Loading models from Groq..."` |
| `provider: "Google"` (104行目のフォールバック) | `provider: "Groq"` |

---

## 6. 新規ファイル一覧

| パス | 目的 |
|---|---|
| `app/public/slang/slang-wasm.js` | slang-wasm バイナリ（GitHub Releasesから取得） |
| `app/public/slang/slang-wasm.wasm` | 同上 |
| `app/lib/slang-wasm-loader.ts` | WASM初期化・コンパイル呼び出し（⚠️ API要確認） |
| `app/lib/slang-compiler.ts` | WASM優先 + APIフォールバックのラッパー |
| `app/app/api/compile-slang/route.ts` | slangc CLI フォールバックAPI |
| `app/lib/slang-templates.ts` | Slangデフォルトテンプレート |

> これら3ファイルはすでにディスク上に存在する（untracked）。そのまま使用するか設計書に従い書き直す。

---

## 7. テクスチャシステム（変更なし）

既存の `TextureSlot` / `iChannel0〜3` / `TexturePanel` は変更不要。  
Slang でのテクスチャ宣言はAIのシステムプロンプトで指示済み。

```slang
// Slang（AIが生成）
uniform Texture2D    iChannel0;
uniform SamplerState iChannel0Sampler;
float4 col = iChannel0.Sample(iChannel0Sampler, uv);
```

`shader-canvas.tsx` に渡す GLSL は `slangc` が生成するので変換は自動。

---

## 8. 既存プロジェクトとの後方互換

- `language === "glsl"` プロジェクト：スラングコンパイルのデバウンスは一切発火しない
- localStorage の既存データ：`slangFragment` / `slangVertex` が `undefined` でもエラーにならない（optional fields）
- GLSL直接編集は引き続き動作する

---

## 9. 環境変数

```bash
# app/.env.local（GEMINI_API_KEY を削除して差し替え）
GROQ_API_KEY=gsk_...   # https://console.groq.com/keys
```

---

## 10. 依存関係

```bash
# インストール
npm install groq-sdk   # 1.3.0

# 削除前に確認: grep -r "from \"@ai-sdk/google\"\|from \"@google/genai\"\|from \"ai\"" app/
npm remove @ai-sdk/google @google/genai ai
```

---

## 11. 実装優先順位

| 優先度 | 対象 | 概要 |
|---|---|---|
| 🔴 | slang-wasm バイナリ取得 | GitHub Releases → `public/slang/` に配置 |
| 🔴 | `lib/slang-wasm-loader.ts` | ⚠️ Playground ソースでAPI確認してから実装 |
| 🔴 | `lib/slang-compiler.ts` | WASM優先 + APIフォールバックラッパー |
| 🔴 | `lib/types.ts` | `ShaderProject` / `AIShaderHistoryEntry` に slang フィールド追加 |
| 🔴 | `api/generate-shader/route.ts` | Groq化、Slangのみ生成 |
| 🔴 | `settings-panel.tsx` | Google → Groq のテキスト変更 |
| 🟡 | `api/compile-slang/route.ts` | slangc フォールバックAPI（slangc インストール必要） |
| 🟡 | `ai-chat-panel.tsx` | slangFragment 受け取り + compileSlang() 呼び出し |
| 🟡 | `shader-playground.tsx` | slangFragment/Vertex state + handleShaderGenerated + useEffect |
| 🟡 | `code-editor.tsx` | 'slang' 言語対応 |
| 🟡 | `api/models/route.ts` | Groq化 |
| 🟢 | エクスポートダイアログ | HLSL / WGSL / Metal 対応 |

---

## 12. 検証チェックリスト

- [ ] `/slang/slang-wasm.js` がブラウザでロードできる（Network タブで確認）
- [ ] slang-wasm の初期化が成功する（コンソールに `[slang-wasm] ready` が出る）
- [ ] `slangc --version` がターミナルで動作する（フォールバック用）
- [ ] `npm run build` でTypeScriptエラーがゼロ
- [ ] プロンプト送信 → Slangコードがエディタに表示される
- [ ] プレビューが即座に描画される（slangcでGLSLに変換）
- [ ] Slangを手動編集 → 1.2秒後にプレビューが更新される
- [ ] 既存GLSLプロジェクトを開いてもエラーが起きない
- [ ] テクスチャをアップロードしてプロンプト → `iChannel0` が正しく使われる
- [ ] エクスポート → GLSL / HLSL がダウンロードされる
- [ ] slangcがない状態でエラーが適切にフロントへ表示される

---

*更新日：2026-07-01*
*groq-sdk バージョン：1.3.0*
*方針：AIはSlang生成専用、変換はslang-wasm（ブラウザ内）優先 → slangc CLI フォールバック*
