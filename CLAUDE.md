# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Slang AI Lab は、AIを活用した Slang シェーダーのプレイグラウンドです。
ユーザーが自然言語でプロンプトを入力すると、AI が **Slang** ソースを生成し、
ブラウザ内で動作する本物の Slang コンパイラ（WebAssembly）が WGSL に変換して
**WebGPU** でリアルタイムにプレビューします。

パイプライン全体:

```
ユーザープロンプト
  → Groq API (/api/generate-shader)     … AI が Slang ソースを生成
  → lib/slang-normalize.ts               … 生成結果を正規化
  → lib/slang-compiler.ts (slang-wasm)   … Slang → WGSL / GLSL / HLSL / Metal / SPIR-V
  → components/webgpu-canvas.tsx         … WGSL を WebGPU で描画
```

**重要**: Slang → 各ターゲットの変換は AI ではなく実コンパイラが行います。
AI に変換をさせてはいけません。

**実装ディレクトリ**: `app/` 配下に Next.js アプリケーションが存在します。
**ドキュメント**: `docs/slang_groq_redesign.md` に Slang × Groq 設計の詳細があります。

## Common Commands

すべて `app/` ディレクトリで実行してください。

```bash
cd app

npm install            # 依存インストール
npm run dev            # 開発サーバー (http://localhost:3000)
npm run build          # プロダクションビルド
npm start              # プロダクションサーバー
npm run lint           # ESLint

npm run test:unit          # Vitest ユニットテスト
npm run test:e2e:install   # 初回のみ: Playwright 用 Chromium を取得
npm run test:e2e           # Playwright E2E
npm run test:ci            # build + ユニット + E2E
npm run qa:lighthouse      # Lighthouse レポート (lighthouse-report/)
```

## Architecture

### Core Structure

```
app/
├── app/
│   ├── page.tsx                        # エントリーポイント (ShaderPlayground をマウント)
│   ├── layout.tsx                      # ルートレイアウト・メタデータ
│   └── api/
│       ├── generate-shader/route.ts    # Groq による Slang 生成エンドポイント
│       └── models/route.ts             # Groq モデル一覧エンドポイント
├── components/
│   ├── shader-playground.tsx           # 中央状態管理・レイアウト統合
│   ├── webgpu-canvas.tsx               # WebGPU レンダラ (Slang→WGSL)
│   ├── shader-canvas.tsx               # 旧 WebGL レンダラ (legacy GLSL プロジェクト用)
│   ├── code-editor.tsx                 # シェーダーコードエディタ
│   ├── compiled-output-panel.tsx       # コンパイル結果 (WGSL/GLSL/…) の表示
│   ├── ai-chat-panel.tsx               # AI プロンプト入力・チャット履歴
│   ├── template-gallery.tsx            # Slang プリセット一覧
│   ├── history-panel.tsx               # プロジェクト一覧サイドバー
│   ├── settings-panel.tsx              # APIキー・モデル選択
│   ├── texture-panel.tsx               # テクスチャスロット管理
│   ├── parameter-panel.tsx             # @param から自動生成されるコントロール
│   └── ui/                             # shadcn/ui ベースのUIコンポーネント群
└── lib/
    ├── types.ts                        # 共有型 (ShaderProject, CompiledArtifact, …)
    ├── slang-compiler.ts               # slang-wasm のロードとコンパイル
    ├── slang-normalize.ts              # 生成された Slang の正規化・エントリ検出
    ├── slang-templates.ts              # Slang プリセット
    ├── compile-to-target.ts            # ターゲット別コンパイルの取りまとめ
    ├── wgsl-bindings.ts                # WGSL の uniform / binding レイアウト解析
    ├── webgpu-device.ts                # GPUDevice の取得・共有
    ├── parameter-parser.ts             # @param アノテーション解析
    ├── mesh-presets.ts / obj-parser.ts # 3D メッシュ (cube/sphere/.obj)
    ├── texture-utils.ts                # 画像ロードとテクスチャ生成
    ├── rate-limit.ts                   # IP ベースのレート制限
    └── stream-json.ts                  # ストリーミング JSON パース
```

Slang コンパイラの wasm 実体は `app/public/slang/`（`slang-wasm.js` / `slang-wasm.wasm`）に
バンドルされており、クライアントから遅延ロードされます。

### 状態管理とデータフロー

- **中央状態**: `shader-playground.tsx`
- **永続化**: `localStorage`
  - `slang-ai-lab-projects` — `ShaderProject[]`
  - `slang-ai-lab-project-textures` — プロジェクトごとのテクスチャスロット
  - `slang-ai-lab-settings` — `AISettings`
  - `slang-ai-lab-ai-shader-history` — プロジェクトごとの AI 生成履歴
  - `slang-ai-lab-ai-chat-*` — プロジェクトごとのチャット履歴 (`ai-chat-panel.tsx`)
- **自動保存**: シェーダーコード変更はデバウンス後に自動保存

### Uniform Contract

Slang ソースでは、参照する uniform をすべてグローバルスコープで宣言する必要があります
（未宣言の識別子は `error[E30015]: undefined identifier` でコンパイルが失敗します）。

```slang
uniform float  u_time;       // 経過秒数
uniform float2 u_resolution; // キャンバス解像度 (px)
uniform float2 u_mouse;      // 正規化 0..1、左上原点（スクリーンUVと同じ空間）
```

- フラグメントエントリ: `[shader("fragment")] float4 fragmentMain(float4 fragCoord : SV_Position) : SV_Target`
- スクリーンUV: `float2 uv = fragCoord.xy / u_resolution;`
- `u_mouse.y` は反転させないこと（UV と同じ空間で定義されています）
- テクスチャ: `Texture2D iChannel0; SamplerState iChannel0Sampler;` を宣言して
  `iChannel0.Sample(iChannel0Sampler, uv)` でサンプリング（`iChannel0`〜`iChannel3`）

追加の uniform に `@param` アノテーションを付けると、`parameter-parser.ts` が解析して
`parameter-panel.tsx` にスライダーやカラーピッカーを自動生成します。

### AI Integration

- `app/api/generate-shader/route.ts` が Groq SDK を呼び出します。システムプロンプトは
  同ファイル内の `PROMPT_CORE` に定義されています（Slang の文法規則・uniform 契約・
  アーティスティックな品質ガイドを含む）。
- モデル既定値は `lib/types.ts` の `DEFAULT_AI_MODEL_ID`。廃止されたモデル ID は
  `DEPRECATED_AI_MODEL_IDS` に基づき読み込み時に自動移行されます。
- API キーはサーバー側 `GROQ_API_KEY`（任意）か、ユーザーが Settings パネルで入力した
  キー（`localStorage` のみに保存し、リクエストごとに転送）を使用します。
- レート制限は `lib/rate-limit.ts`（IP ベース）。

### Legacy GLSL Support

`language: "glsl"` の既存プロジェクトは引き続き `shader-canvas.tsx`（WebGL）で開きます。
新規プロジェクトは常に Slang です。この後方互換は `app/e2e/legacy-glsl.spec.ts` で
テストされているので、壊さないよう注意してください。

## Development Guidelines

- 新しい機能を Slang 側に追加するときは、`lib/__tests__/` のユニットテストと
  `app/e2e/` の E2E の両方を確認する
- UI の見た目を変更するときは `DESIGN.md` のデザインシステムに従う
- コンパイルエラーはユーザーに見せる情報なので、握りつぶさず
  `CompiledArtifact` の `errors` / `warnings` に載せる

## File Naming Conventions

- コンポーネント: `kebab-case.tsx` (例: `shader-playground.tsx`)
- 型定義・ユーティリティ: `kebab-case.ts` (例: `slang-templates.ts`)
- UIコンポーネント: `components/ui/` 配下に shadcn/ui パターンで配置
- テスト: ユニットは `lib/__tests__/*.test.ts`、E2E は `app/e2e/*.spec.ts`
