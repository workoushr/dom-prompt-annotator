# DOM Prompt Annotator 🎯🛡️

**DOM Prompt Annotator** は、ブラウザ上の任意のDOM要素を直感的に選択して番号付きの修正指示（`#1`, `#2`, ...）を付与し、**React / Vue コンポーネント階層・ソースファイル位置**の自動抽出および **Playwright風の文章・機密情報マスキング** を適用した上で、Claude / ChatGPT / Cursor などのAIコーディングアシスタントへそのまま貼り付けられるプロンプト＆構造化JSONを生成する Chrome 拡張機能（Manifest V3）です。

---

## 概要 (Overview)

フロントエンド開発でLLM（Claude Code, Cursor, GitHub Copilot, ChatGPT 等）にUI修正を依頼する際、以下のような課題がありました。

- **「どの要素か」を言葉で説明するコストが高い**（似たクラス名やボタンが複数ある場合、誤った箇所が修正される）
- **ブラウザ上のDOMとソースコード上のコンポーネント（React / Vue）の対応付けが手間**
- **本番・ステージング環境や社内管理画面のテキストに個人情報（PII）や社外秘データが含まれており、そのままLLMのプロンプトに含められない**

**DOM Prompt Annotator** は、Chrome デベロッパーツールのような要素インスペクタと、画面を邪魔しない **Chrome Side Panel UI**、そして **Playwright `page.screenshot({ mask: [...] })` に着想を得たマスキングエンジン** を統合することで、安全かつ正確にAIへフロントエンド修正指示を伝達します。

---

## 主な機能 (Key Features)

### 1. Chrome Side Panel API 連携 & ページ内ポップオーバー入力
- 拡張機能アイコンをクリックすると **Chrome サイドパネル** が開き、対象ページのレイアウトやビューポートを崩さずに指示リストを管理できます。
- ページ上の要素をクリックすると、Shadow DOM でスタイル隔離された **インページ・ポップオーバー** が開き、その場で素早く修正指示を入力（`Ctrl/Cmd + Enter` で即保存）できます。

### 2. 親子DOM階層のワンクリック微調整 (`↑ 親要素` / `↓ 子要素`)
- クリックした箇所が `<span>` や `<svg>` などの内側要素だった場合でも、ポップオーバー内の **`↑ 親要素 (Parent)`** / **`↓ 子要素 (Child)`** ボタン（または `Alt + ↑` / `Alt + ↓` ショートカット）で、親の `<button>` やカード全体の `<section>` へ即座にターゲットを切り替えられます。

### 3. React Fiber / Vue 3 コンポーネント名・ソースファイル位置の自動抽出
- Main World ブリッジスクリプト（`mainWorldBridge.js`）により、DOM要素に紐づく **React 16〜19 Fiber (`__reactFiber$*`)** や **Vue 3 インスタンス (`__vueParentComponent`, `__vnode`)** を自動解析します。
- コンポーネント名（例: `HeroPricingCard`）、コンポーネント階層（`["App", "DashboardLayout", "HeroPricingCard"]`）、および開発ビルド時のソースファイル名・行番号（`src/components/HeroPricingCard.tsx:42`）を自動取得し、プロンプトに含めます。

### 4. Playwright風 文章・要素マスキング機能 🛡️
Playwright のビジュアルマスク機能に着想を得た、多層的なプライバシー＆機密保護機能を備えています。
- **Playwright Mask Selectors (`maskSelectors`)**:
  - デフォルトで `input[type="password"]` と `[data-mask="true"]` が登録されており、サイドパネルから `.customer-name` や `.secret-card` など任意のCSSセレクタを自由に追加・削除できます。
  - マッチした要素（および子孫要素）は、HTML構造・タグ・CSSクラスを維持したまま、テキストと機密属性（`value`, `placeholder`, `title`, `alt`, `aria-label`）が自動的に `[MASKED]` に置換されます。
- **画面上のビジュアルマスク表示 (`#FF00FF` ストライプオーバーレイ)**:
  - マスク対象の要素が画面上で一目で分かるよう、Playwright 風のマゼンタ色（`#FF00FF`、カラーピッカーで変更可能）のストライプ枠＋`MASKED` バッジをリアルタイム描画します。
- **PII（個人情報・機密トークン）自動検出マスク (`autoMaskPII`)**:
  - メールアドレス ➔ `[MASKED_EMAIL]`
  - 電話番号（日本国内固定/携帯・国際番号・米国番号） ➔ `[MASKED_PHONE]`
  - クレジットカード番号（13〜19桁） ➔ `[MASKED_CARD]`
  - JWT / Bearerトークン / OpenAI (`sk-...`) / GitHub (`ghp_...`) / AWS (`AKIA...`) 等のAPIキー ➔ `[MASKED_TOKEN]`
- **要素単位のワンクリックマスク (`maskText`) & 全文マスクモード (`maskAllText`)**:
  - 個別の要素だけテキストを隠したい場合はポップオーバーまたはカードの「マスクON/OFF」で切り替え可能。「全文マスク」をONにすれば、ページ内の全テキストを隠してDOM構造・CSSクラス・座標・スタイルのみを出力できます。

### 5. 選択モード ⇔ 通常操作モード切替 (`Alt + S`) & リロード後の自動復元
- `Alt + S`（またはサイドパネル/画面右下ピルのボタン）で、要素を選択する **選択モード (Inspect ON)** と、普段通りボタンクリックやモーダル展開ができる **通常操作モード (Normal)** を瞬時に切り替えられます。
- 付与した指示データと設定は URL 単位（`origin + pathname`）で `chrome.storage.local` に自動保存されるため、Vite HMR やページリロード後も CSS セレクタ / XPath から `#1`, `#2` バッジが自動復元されます。

### 6. 2種類の出力フォーマット（LLM向けMarkdownプロンプト / 純粋なJSON）
- **LLMプロンプト + JSON (Markdown)**: Claude / ChatGPT / Cursor のチャット欄にそのまま貼り付けられる、自然言語の構造化サマリー＋詳細JSONブロックのハイブリッド形式。
- **純粋なJSON**: 自動化ツールやカスタムスクリプトに連携しやすい整形済み JSON 形式。

---

## インストール・ビルド手順 (Setup & Loading in Chrome)

- **リポジトリ URL**: [https://github.com/workoushr/dom-prompt-annotator](https://github.com/workoushr/dom-prompt-annotator)

### 1. リポジトリのクローンとビルド

```bash
# リポジトリのクローン
git clone https://github.com/workoushr/dom-prompt-annotator.git
cd dom-prompt-annotator

# 依存パッケージのインストール
npm install

# 型チェック・テスト・本番ビルド (dist/ ディレクトリに出力されます)
npm run typecheck
npm test
npm run build
```

### 2. Chrome への拡張機能読み込み手順

1. Google Chrome を開き、アドレスバーに `chrome://extensions` と入力して移動します。
2. 画面右上の **「デベロッパー モード (Developer mode)」** トグルを **ON** にします。
3. 左上の **「パッケージ化されていない拡張機能を読み込む (Load unpacked)」** をクリックします。
4. 本リポジトリ内のビルド出力フォルダ **`dist/`** を選択して読み込みます。
5. ツールバーの拡張機能アイコンから **「DOM Prompt Annotator」** をピン留めし、アイコンをクリックすると右側にサイドパネルが開きます。

### 3. 同梱デモページ (`demo.html`) での動作確認

`public/demo.html`（ビルド後は `dist/demo.html` にもコピーされます）に、React Fiber / Vue 3 コンポーネント階層・PII・`[data-mask="true"]` 要素を搭載した **動作確認用 SaaS ダッシュボード** を用意しています。

```bash
# ローカルサーバー等で公開するか、ビルド後の dist/demo.html を開いてテストできます
npx vite preview --port 4173
```

> **Note**: `file://` URL で開いたページに対して拡張機能を動作させる場合は、`chrome://extensions` の「DOM Prompt Annotator」詳細画面で **「ファイルの URL へのアクセスを許可する」** を ON にしてください。

---

## 使い方とショートカットキー一覧 (Usage & Shortcuts)

### 基本ワークフロー

1. 対象のWebページを開き、拡張機能アイコンをクリックして **サイドパネル** を表示します。
2. サイドパネル上部の **「選択モード (Inspect ON)」** ボタンをクリックするか、キーボードの **`Alt + S`** を押します。
3. ページ上の修正したい要素にマウスを合わせると、青色のハイライト枠と `<tag#id.class> [React: ComponentName]` ツールチップが表示されます。
4. 要素をクリックすると **ポップオーバー** が開きます。必要に応じて **`↑ 親要素`** / **`↓ 子要素`** で対象要素の階層を調整し、修正指示を入力して **「追加 / 保存」**（`Ctrl + Enter` / `Cmd + Enter`）を押します。
5. モーダルを開いたりアコーディオンを展開したい場合は、一度 **`Alt + S`** で通常操作モードに戻して画面を操作し、再度 **`Alt + S`** で選択モードに切り替えて続きの要素（`#2`, `#3`...）を追加します。
6. サイドパネルで **「ページ全体の前提・共通指示」** や **「Playwright風マスキング設定」** を確認し、下部の **「クリップボードにコピー」** をクリックして AI コーディングアシスタントに貼り付けます。

### キーボードショートカット一覧

| ショートカット | 動作内容 |
| :--- | :--- |
| **`Alt + S`** (`Option + S`) | **選択モード (Inspect ON)** ⇔ **通常操作モード (Normal)** の切り替え |
| **`Alt + ↑`** (`Alt + ArrowUp`) | ポップオーバー表示中、選択ターゲットを **1つ上の親要素 (`parentElement`)** へ移動 |
| **`Alt + ↓`** (`Alt + ArrowDown`) | ポップオーバー表示中、選択ターゲットを **最初の子要素 (`firstElementChild`)** へ移動 |
| **`Ctrl + Enter`** / **`Cmd + Enter`** | ポップオーバーで入力中の修正指示を確定・保存 |
| **`Escape`** | ポップオーバーを閉じる（ポップオーバー非表示時は選択モードを終了） |

---

## 出力JSONスキーマ例 (Output JSON Schema)

サイドパネルから出力される JSON ペイロード（および Markdown 末尾の JSON ブロック）は以下のスキーマに従います。

```json
{
  "pageContext": {
    "url": "https://app.example.com/dashboard",
    "title": "CloudMetrics SaaS Dashboard",
    "viewport": {
      "width": 1440,
      "height": 900
    },
    "timestamp": "2026-11-07T06:00:00.000Z",
    "globalInstruction": "全体的にモダンな配色に修正し、Tailwind CSSのユーティリティクラスで統一してください。",
    "maskingConfig": {
      "autoMaskPII": true,
      "maskAllText": false,
      "maskSelectors": [
        "input[type=\"password\"]",
        "[data-mask=\"true\"]",
        ".customer-name"
      ],
      "maskColor": "#FF00FF",
      "visualMaskEnabled": true
    }
  },
  "annotations": [
    {
      "id": 1,
      "instruction": "CTAボタンをグラデーション背景にし、ホバー時のアニメーションを追加",
      "maskText": false,
      "createdAt": "2026-11-07T05:59:30.000Z",
      "element": {
        "tagName": "button",
        "id": "upgrade-cta-btn",
        "className": "btn-upgrade bg-indigo-600 text-white px-4 py-2 rounded",
        "selector": "#upgrade-cta-btn",
        "xpath": "//*[@id=\"upgrade-cta-btn\"]",
        "attributes": {
          "id": "upgrade-cta-btn",
          "class": "btn-upgrade bg-indigo-600 text-white px-4 py-2 rounded"
        },
        "textContent": "プランをアップグレード",
        "outerHTMLSnippet": "<button id=\"upgrade-cta-btn\" class=\"btn-upgrade bg-indigo-600 text-white px-4 py-2 rounded\"><span id=\"upgrade-cta-inner-text\" class=\"btn-label\">プランをアップグレード</span></button>",
        "rect": {
          "x": 120,
          "y": 260,
          "width": 220,
          "height": 44
        },
        "computedStyles": {
          "display": "inline-flex",
          "position": "relative",
          "color": "rgb(255, 255, 255)",
          "backgroundColor": "rgb(79, 70, 229)",
          "fontSize": "14px",
          "fontWeight": "600",
          "padding": "8px 16px",
          "borderRadius": "8px"
        },
        "framework": {
          "detected": "react",
          "componentName": "HeroPricingCard",
          "componentHierarchy": [
            "App",
            "DashboardLayout",
            "HeroPricingCard"
          ],
          "source": {
            "fileName": "src/components/HeroPricingCard.tsx",
            "lineNumber": 42,
            "columnNumber": 8
          }
        }
      }
    }
  ]
}
```

---

## アーキテクチャ・ディレクトリ構成 (Architecture & Directory Structure)

```text
dom-prompt-annotator/
├── public/
│   ├── manifest.json                 # Chrome Extension Manifest V3 定義
│   ├── demo.html                     # React/Vue/PII/Mask 動作確認用デモページ
│   └── icons/                        # 拡張機能アイコン (16/48/128px & SVG)
├── scripts/
│   └── build.mjs                     # Vite マルチバンドルビルドスクリプト (SidePanel + Content + Background + Bridge)
├── src/
│   ├── types/
│   │   └── annotation.ts             # データモデル・メッセージング型定義
│   ├── utils/
│   │   ├── masker.ts                 # Playwright風マスキング＆PIIサニタイズエンジン
│   │   ├── storage.ts                # URL単位の chrome.storage.local 永続化ユーティリティ
│   │   └── __tests__/                # masker / storage 単体テスト
│   ├── background/
│   │   ├── index.ts                  # Service Worker (Side Panel起動・タブ間メッセージ中継)
│   │   └── __tests__/                # Background 単体テスト
│   ├── content/
│   │   ├── index.tsx                 # Shadow DOM ホスト (#dpa-root-host) マウント＆Bridge注入
│   │   ├── OverlayApp.tsx            # ページ上オーバーレイUI (ホバー枠・バッジ・ポップオーバー・マスク枠)
│   │   ├── overlayStyles.ts          # Shadow DOM 内部用スコープドCSS
│   │   ├── domExtractor.ts           # CSSセレクタ生成・XPath生成・スタイル＆メタデータ抽出
│   │   ├── mainWorldBridge.ts        # Main World 実行スクリプト (React Fiber / Vue 3 解析)
│   │   └── __tests__/                # Content Script 各モジュールの単体テスト
│   ├── sidepanel/
│   │   ├── index.html                # Side Panel エントリHTML
│   │   ├── main.tsx                  # Side Panel React マウント
│   │   ├── SidePanelApp.tsx          # Side Panel メインUI (指示管理・マスク設定・プレビュー・コピー)
│   │   ├── promptFormatter.ts        # LLM向けMarkdownプロンプト＆JSONフォーマッタ
│   │   ├── styles.css                # Tailwind CSS スタイル
│   │   └── __tests__/                # Side Panel / Formatter 単体テスト
│   └── __tests__/
│       └── integration.test.tsx      # OverlayApp + SidePanelApp 一気通貫 E2E 結合テスト
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### 開発コマンド一覧

| コマンド | 説明 |
| :--- | :--- |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) による型チェックを実行 |
| `npm test` | Vitest + JSDOM による全単体テスト・結合テストを実行 |
| `npm run build` | `dist/` ディレクトリへ Chrome 拡張機能一式をビルド |
