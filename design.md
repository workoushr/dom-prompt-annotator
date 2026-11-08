# Design & Architecture Specification: dom-prompt-annotator

## 1. ビジョン & コンセプト (Vision & Concept)

`dom-prompt-annotator` は、Web開発者・デザイナー・QAが「画面を見ながら直感的にAI（LLM）へのUI修正プロンプトを生成する」ための Chrome 拡張機能（Manifest V3）です。

従来の拡張機能によくある「画面右端を 300px〜400px 占有して対象ページのレイアウトを崩してしまう Side Panel」を排し、**Figma UI3 に完全準拠したフローティングボトムバー（Canvas Bottom Bar）** と、**動的UIを巻き戻して指示できるタイムラインリプレイスタジオ（Studio）** を核とするミニマルなUI/UXを提供します。

> **💡 インタラクティブモックアップ**:
> Figma UI3 デザイン言語を再現したスタジオUIプロトタイプは [`docs/studio_mockup.html`](./docs/studio_mockup.html) で確認できます。

---

## 2. デザインシステム & デザイン言語 (Design System)

**Figma UI3** に準拠した、**プロフェッショナルで邪魔にならないミニマルなツール感（Floating Island Panels & Canvas Architecture）** を徹底します。

### 2.1 技術スタック
- **UI Framework**: React 18 + TypeScript
- **Design System / Component Primitive**: **shadcn/ui** (Radix UI Primitives + Tailwind CSS)
- **Icons**: Lucide React
- **Styling**: Tailwind CSS + Shadow DOM 内包スタイルシート

### 2.2 デザイン原則 (Design Principles)
1. **Unobtrusive（画面を邪魔しない）**:
   - 閲覧対象のWebページが主役。拡張機能のUIはコンパクトなボトムバーに収まり、透過・ぼかし（`backdrop-blur`）で背後を遮らない。
2. **Precision & Density（高密度かつ精緻）**:
   - フォントサイズは 12px〜13px、余白は `p-1.5`〜`p-2.5` を基調とした Figma / DevTools ライクな情報密度。
3. **Portal Containment（Shadow DOM 隔離の徹底）**:
   - shadcn/ui の Radix コンポーネント（Popover, Tooltip, DropdownMenu など）は必ず Shadow DOM 内部を `container` に指定し、Webサイト側のDOMやCSSと一切干渉させない。

### 2.3 カラーパレット & トークン (Design Tokens)

```css
:root {
  /* Figma Dark Canvas 風のベースカラー */
  --bg-canvas: #1e1e1e;
  --bg-surface: #2c2c2c;
  --bg-surface-elevated: #383838;
  --bg-surface-hover: rgba(255, 255, 255, 0.08);
  --bg-surface-active: rgba(255, 255, 255, 0.12);

  /* ボーダー・境界線 */
  --border-subtle: rgba(255, 255, 255, 0.1);
  --border-prominent: rgba(255, 255, 255, 0.18);

  /* タイポグラフィ */
  --text-primary: #f5f5f5;
  --text-secondary: #a3a3a3;
  --text-muted: #737373;

  /* アクセントカラー (Figma Blue & Status) */
  --accent-blue: #0d99ff;
  --accent-blue-hover: #007be5;
  --accent-red: #f43f5e;     /* 録画中インジケータ */
  --accent-amber: #f59e0b;   /* デバイスエミュレート警告 */
  --accent-emerald: #10b981; /* コピー完了 */

  /* シャドウ */
  --shadow-figma-bar: 0 12px 32px -4px rgba(0, 0, 0, 0.5), 0 4px 12px -2px rgba(0, 0, 0, 0.35);
  --shadow-popover: 0 16px 40px -6px rgba(0, 0, 0, 0.6);
}
```

---

## 3. UI画面構成とレイアウト仕様 (UI Components Architecture)

全体のUIは大きく分けて **2つの体験** で構成されます。

```text
[体験 A: ライブ画面]
  ページ上に浮かぶ「Figma風ボトムバー」＋「要素ハイライト」＋「インライン指示ポップオーバー」

[体験 B: スタジオ（タイムラインリプレイ）]
  一瞬で消えるトーストやローダーを巻き戻してアノテーションする「専用タブ全画面」
```

---

### 3.1 フローティングボトムバー (Floating Bottom Bar)

Webページの画面下部中央に常駐するコンパクトなツールバー（高さ `44px`）。

```text
+-----------------------------------------------------------------------------------------+
| [🔍 選択 (Alt+S)] | [📱 393×852 (iPhone) ▼] | [🔴 REC] | [📝 3件 ▼] | [📋 コピー] | [ー] |
+-----------------------------------------------------------------------------------------+
```

| セクション | コンポーネント (shadcn/ui) | 説明 |
| :--- | :--- | :--- |
| **選択モード切替** | `Toggle` / `Button` | クリックまたは `Alt + S` で要素ホバー＆選択モードをON/OFF。アクティブ時はアクセントブルーで発光。 |
| **デバイスエミュレート** | `DropdownMenu` + `Button` | クリックでプリセット（iPhone 15 Pro, iPad, Desktop）やカスタムサイズ、画面回転（Portrait/Landscape）を切替。 |
| **セッション録画 (REC)** | `Button` (録画中は点滅ドット) | 動的UI記録用。クリックすると録画開始、停止すると専用リプレイタブが自動起動。 |
| **指示カウンター & 一覧** | `Popover` / `Sheet` | 現在の指示件数バッジ（例: `3`）。クリックすると上部にミニマルなドロワーが開き、指示の並び替え・削除・前提指示入力が可能。 |
| **プロンプトコピー** | `Button` (Primary) | ワンクリックで最適化された Markdown / JSON をクリップボードにコピー。完了時にチェックアイコンへアニメーション。 |
| **最小化 (Collapse)** | `Button` (Ghost) | ページ下部のボタンを邪魔する場合、ワンクリックで右隅の小さなピル型FAB（フローティングアクションボタン）に折りたたむ。 |

---

### 3.2 要素選択 & 指示ポップオーバー (Inspector Popover)

ページ上の要素をクリックした際、その要素の真上にアンカー表示されるポップオーバー。

* **コンポーネント**: `shadcn/ui` の `Popover` + `Textarea` + `Badge`
* **機能**:
  * 検出された要素情報バッジ（タグ名、ID/Class、React/Vueコンポーネント名）
  * 階層移動ボタン（`↑ 親要素` / `↓ 子要素`）
  * 修正指示テキスト入力エリア（オートフォーカス、`Ctrl/Cmd + Enter` で保存）
  * マスキング個別トグル（「この要素のテキストを伏字化」）

---

### 3.3 アノテーション一覧 & 設定ドロワー (Inspector Drawer)

ボトムバーの「📝 3件」をクリックした際、ボトムバーの上部にスッと展開されるフライアウトパネル。

* **コンポーネント**: `shadcn/ui` の `Card` / `ScrollArea` / `Tabs`
* **タブ構成**:
  1. **指示一覧 (Annotations)**: 各要素のサムネイル・セレクタ・指示内容のカード一覧（ドラッグでの並び替え、削除、ジャンプ）。
  2. **共通前提 (Context)**: ページ全体の前提プロンプト入力（例:「Tailwind CSSを使用」「レスポンシブ崩れの修正」）。
  3. **マスキング (Privacy)**: 自動PII伏字化、特定セレクタの一括マスキングルールの設定。

---

### 3.4 タイムラインリプレイスタジオ (Dedicated Replay Studio Tab)

ボトムバーの「🔴 録画停止」を押した際に開く、全画面スタジオタブ。

```text
+------------------------------------------------------------------------------------+
| [Header] DPA Studio | 00:15.420 | [🔒 全文テキストマスク (maskAllText)] | [AIプロンプト出力] |
+-----------------------------------------------------------------+------------------+
|                                                                 |                  |
|                      プレビュー画面 (iframe)                     |  アノテーション   |
|            (指定デバイス枠内で当時のDOMを完全再現)                |  リスト          |
|                                                                 |                  |
|                 [一時停止中のトースト通知]                       |  #1 トースト通知  |
|               (クリックして指示入力ポップオーバー)                 |     文言と消去    |
|                                                                 |     時間の修正    |
|                                                                 |                  |
+-----------------------------------------------------------------+                  |
| [▶ 再生/停止] [⏪ -1s] [00:03.200 / 00:15.400] [⏩ +1s]          |                  |
| =====|========================================================= |                  |
| (クリック・Mutation等のイベントマーカーが並ぶシークバー)             |                  |
+-----------------------------------------------------------------+------------------+
```

* **ヘッダー**:
  * **全文テキストマスク (`maskAllText`) トグル**: 録画されたDOM内のテキスト（機密情報や顧客データ）を丸ごと `[MASKED]` に一括伏字化するスイッチ。ONにするとReplayer内の表示およびエクスポートされるプロンプト・JSONの双方が完全にマスキングされ、純粋なDOM構造・CSSスタイル・操作ログのみをAIに送信可能。
* **中央部**: `rrweb-player` によるサンドボックス化されたDOM再構築エリア。一時停止中にホバー・クリックするとライブ画面と全く同じアノテーションUIが動作。
* **下部シークバー**:
  * 時間軸バー上に「クリックした瞬間」「DOMが変化した瞬間（トースト出現）」がピン留め（Marker）され、クリックでその瞬間へ一発ジャンプ可能。
* **右側パネル**:
  * タイムライン上で登録された指示の一覧と、前後のユーザーアクションログ。

---

## 4. フロントエンド技術設計 (Implementation Architecture)

### 4.1 Shadow DOM への shadcn/ui (Tailwind) 適用方針
Content Script 内で Webサイト側のCSSと隔離しつつ shadcn/ui を使うため、以下のパイプラインを構築します：

1. **CSS Injection**:
   - ビルド時に Tailwind CSS を単一の CSS 文字列としてバンドル。
   - `content/index.tsx` でマウントする Shadow Root 内部に `<style>` タグとして直接注入する。
2. **Radix UI Portal の Shadow Root バインド**:
   - `PopoverContent`, `DropdownMenuContent`, `TooltipContent` などの Portal 系コンポーネントに対し、`container={shadowRootRef}` を渡す共通ラッパーを提供。
   - これにより、ポップオーバーが `<body>` 直下に漏れてスタイル崩れを起こすのを 100% 防止する。

### 4.2 ディレクトリ構成案

```text
src/
├── components/ui/              # shadcn/ui コンポーネント群 (Radix + Tailwind)
│   ├── button.tsx
│   ├── popover.tsx
│   ├── dropdown-menu.tsx
│   ├── toggle.tsx
│   ├── textarea.tsx
│   ├── scroll-area.tsx
│   └── badge.tsx
├── content/                    # ページ内オーバーレイ & ボトムバー
│   ├── index.tsx               # Shadow Root ホスト作成
│   ├── FloatingBottomBar.tsx   # Figma風ボトムバー本体
│   ├── ElementPopover.tsx      # 要素選択時ポップオーバー
│   ├── AnnotationDrawer.tsx    # 指示一覧・設定ドロワー
│   ├── domExtractor.ts         # セレクタ・スタイル・React Fiber抽出
│   └── mainWorldBridge.ts      # Main World解析
├── studio/                     # タイムラインリプレイ専用タブ
│   ├── index.html
│   ├── main.tsx
│   ├── StudioApp.tsx           # スタジオメイン画面
│   ├── TimelineBar.tsx         # シークバー & イベントピン
│   └── ReplayViewer.tsx        # rrweb-player ラッパー
├── background/                 # Service Worker (CDP制御・録画・通信)
│   ├── index.ts
│   └── debuggerManager.ts      # chrome.debugger によるViewport制御
├── utils/                      # 共通ロジック
│   ├── promptFormatter.ts      # LLM向けMarkdown/JSON出力
│   ├── masker.ts               # PIIサニタイズ
│   └── storage.ts              # chrome.storage 永続化
└── types/
    └── annotation.ts           # 共通型定義
```

---

## 5. ロードマップ (Milestones)

- **Phase 1: Figma風ボトムバーへの移行**
  - shadcn/ui コンポーネント基盤のセットアップ（Shadow DOM 適合）。
  - Side Panel の主要機能をボトムバー（`FloatingBottomBar.tsx`）＋ドロワーへ集約。
- **Phase 2: デバイスサイズエミュレーションの統合 (Issue #1)**
  - `chrome.debugger` API による Viewport 切り替えをボトムバーのドロップダウンに実装。
- **Phase 3: タイムラインリプレイスタジオの実装 (Issue #2)**
  - `rrweb` による録画・専用タブスタジオ（`studio/`）の実装。
  - 一時停止DOMに対するアノテーションと、操作ログ付きプロンプト出力の結合。
