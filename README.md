# DOM Prompt Annotator 🎯🛡️

**DOM Prompt Annotator** は、ブラウザ上の任意のDOM要素を直感的に選択して番号付きの修正指示（`#1`, `#2`, ...）を付与し、**React / Vue コンポーネント階層・ソースファイル位置**の自動抽出および **Playwright風の文章・機密情報マスキング** を適用した上で、Claude / ChatGPT / Cursor などのAIコーディングアシスタントへそのまま貼り付けられるプロンプト＆構造化JSONを生成する Chrome 拡張機能（Manifest V3）です。

---

## 概要 (Overview)

フロントエンド開発でLLM（Claude Code, Cursor, GitHub Copilot, ChatGPT 等）にUI修正を依頼する際、以下のような課題がありました。

- **「どの要素か」を言葉で説明するコストが高い**（似たクラス名やボタンが複数ある場合、誤った箇所が修正される）
- **ブラウザ上のDOMとソースコード上のコンポーネント（React / Vue）の対応付けが手間**
- **本番・ステージング環境や社内管理画面のテキストに個人情報（PII）や社外秘データが含まれており、そのままLLMのプロンプトに含められない**

**DOM Prompt Annotator** は、Chrome デベロッパーツールのような要素インスペクタ、ページ内に表示される **Figma UI3 風のフローティングボトムバー**、そして **Playwright `page.screenshot({ mask: [...] })` に着想を得たマスキングエンジン** を統合することで、安全かつ正確にAIへフロントエンド修正指示を伝達します。UI はページ内のボトムバーだけで完結し、ブラウザの常設パネルや DevTools は使用しません。ボトムバーは既定で非表示で、必要なときだけ呼び出します。

---

## 主な機能 (Key Features)

### 1. ページ内フローティングボトムバー & ポップオーバー
- 拡張機能のUIは **ページ内のフローティングボトムバー** のみです。初期状態では非表示で、ページの閲覧やクリックを妨げません。
- ツールバーの拡張機能アイコンをクリックするか、非表示時に **`Alt + S`** を押すと、ボトムバーが表示され **選択モード (Inspect ON)** が有効になります。この選択状態は `chrome.storage.local` に永続化されるため、ページ遷移後も同じ設定でボトムバーが表示されます。
- ボトムバーから、選択モード切替・デバイスプレビュー・指示一覧（ドロワー）・出力フォーマットの選択とコピーを操作できます。指示一覧の確認・削除、共通前提の編集、マスキング設定はボトムバー上部に開く **ドロワー** で行います。
- ページ上の要素をクリックすると、Shadow DOM でスタイル隔離された **インページ・ポップオーバー** が開き、その場で素早く修正指示を入力（`Ctrl/Cmd + Enter` で即保存）できます。

### 2. 親子DOM階層のワンクリック微調整 (`↑ 親要素` / `↓ 子要素`)
- クリックした箇所が `<span>` や `<svg>` などの内側要素だった場合でも、ポップオーバー内の **`↑ 親要素 (Parent)`** / **`↓ 子要素 (Child)`** ボタン（または `Alt + ↑` / `Alt + ↓` ショートカット）で、親の `<button>` やカード全体の `<section>` へ即座にターゲットを切り替えられます。

### 3. React Fiber / Vue 3 コンポーネント名・ソースファイル位置の自動抽出
- Main World ブリッジスクリプト（`mainWorldBridge.js`）により、DOM要素に紐づく **React 16〜19 Fiber (`__reactFiber$*`)** や **Vue 3 インスタンス (`__vueParentComponent`, `__vnode`)** を自動解析します。
- コンポーネント名（例: `HeroPricingCard`）、コンポーネント階層（`["App", "DashboardLayout", "HeroPricingCard"]`）、および開発ビルド時のソースファイル名・行番号（`src/components/HeroPricingCard.tsx:42`）を自動取得し、プロンプトに含めます。

### 4. Playwright風 文章・要素マスキング機能 🛡️
Playwright のビジュアルマスク機能に着想を得た、多層的なプライバシー＆機密保護機能を備えています。
- **Playwright Mask Selectors (`maskSelectors`)**:
  - デフォルトで `input[type="password"]` と `[data-mask="true"]` が登録されており、ページ内ドロワーから `.customer-name` や `.secret-card` など任意のCSSセレクタを自由に追加・削除できます。
  - マッチした要素（および子孫要素）は、HTML構造・タグ・CSSクラスを維持したまま、テキストと機密属性（`value`, `placeholder`, `title`, `alt`, `aria-label`）が自動的に `[MASKED]` に置換されます。
- **画面上のビジュアルマスク表示 (`#FF00FF` ストライプオーバーレイ)**:
  - マスク対象の要素が画面上で一目で分かるよう、Playwright 風のマゼンタ色（`#FF00FF`、カラーピッカーで変更可能）のストライプ枠＋`MASKED` バッジをリアルタイム描画します。
- **PII（個人情報・機密トークン）自動検出マスク (`autoMaskPII`)**:
  - メールアドレス ➔ `[MASKED_EMAIL]`
  - 電話番号（日本国内固定/携帯・国際番号・米国番号） ➔ `[MASKED_PHONE]`
  - クレジットカード番号（13〜19桁） ➔ `[MASKED_CARD]`
  - JWT / Bearerトークン / OpenAI (`sk-...`) / GitHub (`ghp_...`) / AWS (`AKIA...`) 等のAPIキー ➔ `[MASKED_TOKEN]`
- **要素単位のワンクリックマスク (`maskText`) & 全文マスクモード (`maskAllText`)**:
  - 個別の要素だけテキストを隠したい場合はポップオーバーまたはカードの「マスクON/OFF」で切り替え可能。「全文テキストマスク」をONにすれば、ページ内の全テキストを隠してDOM構造・CSSクラス・座標・スタイルのみを出力できます。

### 5. 選択モード ⇔ 通常操作モード切替 (`Alt + S`)
- `Alt + S`（またはボトムバーの「選択」ボタン）で、要素を選択する **選択モード (Inspect ON)** と、普段通りボタンクリックやモーダル展開ができる **通常操作モード (Normal)** を瞬時に切り替えられます。
- 選択モードのON/OFFは `chrome.storage.local` の `dpa_ui_preferences.inspectMode` に保存されます。OFFにした場合は現在のページではボトムバーを維持し、次のページ遷移から非表示になります。
- 選択モード中はホバー枠と要素情報ツールチップを表示し、通常操作モード中はページ本来のインタラクションを妨げません。

### 6. セッション限定の注釈データ
- 注釈・共通前提・マスキング設定などのページ状態は **`chrome.storage.session`** にのみ保持し、ディスクへは保存しません。
- 付与した番号バッジと指示は **ページの更新・再読み込みで消えます**。リロード後に自動復元されることはありません。ページ遷移時のクリアも Service Worker が行います。
- UI の選択モード設定（`dpa_ui_preferences`）だけは `chrome.storage.local` に永続化され、注釈データとは独立して扱われます。設定が `inspectMode: true` のままなら、再読み込み後もボトムバーは表示されますが、以前の注釈は復元されません。
- **プロンプトのコピーに成功すると、そのページのマーキング（番号バッジ・指示）を全消去**します。同じ画面で続けて別の修正指示を作り直す場合は、改めて要素を選択してください。

### 7. ページ内 iframe デバイスプレビュー
- ボトムバーのデバイスメニューから iPhone SE / iPhone 15 Pro / iPad Mini / Desktop / Desktop HD などのプリセット、縦横回転を選択できます。
- 選択したサイズの **iframe プレビュー** をページ内に表示します。ボトムバー自体の位置は動かず、プレビューを開閉しても操作バーは同じ場所に固定されます。
- デバイス未選択時のボタンは、回転ボタンを含めたアクティブ時の幅に合わせてあり、状態切替でボトムバーのレイアウトがずれません。
- **同一オリジン**のページのみ、プレビュー内の要素を選択・注釈できます。クロスオリジンのプレビューは表示のみとなります。
- 対象サイトが `X-Frame-Options` や CSP の `frame-ancestors` で iframe 埋め込みを拒否している場合、プレビューを表示できないことがあります（その場合も通常のページ上での注釈操作は継続できます）。

### 8. 2種類の出力フォーマット（LLM向けMarkdown+JSON / 純粋なJSON）
- **LLMプロンプト + JSON (Markdown)**: Claude / ChatGPT / Cursor のチャット欄にそのまま貼り付けられる、自然言語の構造化サマリー＋詳細JSONブロックのハイブリッド形式。
- **純粋なJSON**: 自動化ツールやカスタムスクリプトに連携しやすい整形済み JSON 形式。
- コピー成功時は、メインのコピーボタンと形式切替ボタンで構成される **スプリットボタン全体** が成功色（グリーン）に変わり、チェックアイコンと「コピー完了!」を表示します。

---

## 権限 (Permissions)

`public/manifest.json` で要求する権限は以下の通りです。デバッガ関連の権限は使用しません。

| 権限 | 用途 |
| :--- | :--- |
| `activeTab` | 操作対象のアクティブタブへアクセスする |
| `storage` | UI設定を `chrome.storage.local`、注釈などのページ状態を `chrome.storage.session` に保持する |
| `scripting` | コンテンツスクリプトが未注入のタブへフォールバック注入する |
| `tabs` | アクティブタブのURL・タイトルを取得して状態を同期する |
| `host_permissions: <all_urls>` | 任意のページでDOM選択・注釈・マスキングを行う |

`debugger`（DevTools プロトコル）権限は使用しません。UI はページ内のボトムバーとコンテンツスクリプトのみで構成されます。

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

# 型チェック・単体テスト・本番ビルド (dist/ ディレクトリに出力されます)
npm run typecheck
npm test
npm run build
```

### 2. Chrome への拡張機能読み込み手順

1. Google Chrome を開き、アドレスバーに `chrome://extensions` と入力して移動します。
2. 画面右上の **「デベロッパー モード (Developer mode)」** トグルを **ON** にします。
3. 左上の **「パッケージ化されていない拡張機能を読み込む (Load unpacked)」** をクリックします。
4. 本リポジトリ内のビルド出力フォルダ **`dist/`** を選択して読み込みます。
5. ツールバーの拡張機能アイコンから **「DOM Prompt Annotator」** をピン留めします。対象ページでアイコンをクリックするとページ下部にボトムバーが表示され、選択モードが有効になります。この設定は保存され、以後のページ遷移でもボトムバーが表示されます。ボトムバーを閉じる（`×`）か、バー上の選択をOFFにすると、設定は無効として保存されます。

### 3. 同梱デモページ (`demo.html`) での動作確認

`public/demo.html`（ビルド後は `dist/demo.html` にもコピーされます）に、React Fiber / Vue 3 コンポーネント階層・PII・`[data-mask="true"]` 要素を搭載した **動作確認用 SaaS ダッシュボード** を用意しています。

```bash
# ローカルサーバー等で公開するか、ビルド後の dist/demo.html を開いてテストできます
npx vite preview --port 4173
```

> **Note**: `file://` URL で開いたページに対して拡張機能を動作させる場合は、`chrome://extensions` の「DOM Prompt Annotator」詳細画面で **「ファイルの URL へのアクセスを許可する」** を ON にしてください。

### 4. 実ブラウザ E2E テスト (`npm run test:e2e`)

`npm run test:e2e` は `dist/` をビルドした上で、**アンパック済み拡張機能を実際の Chrome に読み込んで** 以下を検証します。

- 既定状態（`dpa_ui_preferences` 未保存）でボトムバーが表示されず、ページのクリックを奪わないこと
- `inspectMode: true` を保存した状態で、リロード後にボトムバーが表示されること
- 選択をOFFにすると `inspectMode: false` が保存され、現在ページではバーを維持しつつ、次回ナビゲーションでは表示されないこと
- 注釈が `chrome.storage.session` のみに保存され、`chrome.storage.local` には書き込まれないこと
- 要素選択からポップオーバー保存、番号バッジと指示数の反映
- プロンプトのコピー（クリップボード内容）と、コピー成功後のマーキング消去
- ページ再読み込み後にマーキングが復元されないこと
- iframe デバイスプレビューの表示と、開閉時にボトムバーが移動しないこと
- manifest から旧UI用の権限・定義が削除されていること

実行には Chrome for Testing（または Playwright の Chromium）が必要です。次のいずれかの方法で解決されます。

```bash
# 方法 A: Playwright の Chromium を用意する（~/.cache/ms-playwright 配下を自動検出）
npx playwright install chromium

# 方法 B: Chrome for Testing の実行ファイルを明示する
CHROME_PATH=/path/to/chrome-for-testing/chrome npm run test:e2e
```

ヘッドレスモードで実行されるため、GUI のない CI 環境でも動作します。

---

## 使い方とショートカットキー一覧 (Usage & Shortcuts)

### 基本ワークフロー

1. 対象のWebページを開き、拡張機能アイコンをクリックして **ボトムバー** を表示します（ページ側は選択モードになります）。ボトムバーが非表示の場合は **`Alt + S`** でも表示できます。
2. 選択モードがOFFの場合は、ボトムバーの「選択」ボタン、または **`Alt + S`** で有効にします。
3. ページ上の修正したい要素にマウスを合わせると、青色のハイライト枠と `<tag#id.class> [React: ComponentName]` ツールチップが表示されます。
4. 要素をクリックすると **ポップオーバー** が開きます。必要に応じて **`↑ 親要素`** / **`↓ 子要素`** で対象要素の階層を調整し、修正指示を入力して **「追加 / 保存」**（`Ctrl + Enter` / `Cmd + Enter`）を押します。
5. モーダルを開いたりアコーディオンを展開したい場合は、一度 **`Alt + S`** で通常操作モードに戻して画面を操作し、再度 **`Alt + S`** で選択モードに切り替えて続きの要素（`#2`, `#3`...）を追加します。
6. ボトムバーの **「プロンプトコピー」** をクリックして AI コーディングアシスタントに貼り付けます。ページ全体の前提やマスキング設定は、ボトムバーの指示一覧から開く **ドロワー** で確認・編集できます。コピーに成功すると、そのページのマーキングは消去されます。

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

ページ内ドロワーまたはボトムバーから出力される JSON ペイロード（および Markdown 末尾の JSON ブロック）は以下のスキーマに従います。

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
│   ├── build.mjs                     # Vite マルチバンドルビルドスクリプト (Content + Background + Bridge)
│   ├── e2e.mjs                       # 実Chromeでアンパック済み拡張機能を検証するE2Eハーネス
│   └── verify-dist.mjs               # dist/ の成果物検証
├── e2e/
│   └── fixture.html                  # E2E用の固定テストページ
├── src/
│   ├── types/
│   │   └── annotation.ts             # データモデル・メッセージング型定義
│   ├── utils/
│   │   ├── masker.ts                 # Playwright風マスキング＆PIIサニタイズエンジン
│   │   ├── preferences.ts            # dpa_ui_preferences の chrome.storage.local 永続化
│   │   ├── storage.ts                # URL単位の chrome.storage.session ページ状態管理
│   │   ├── promptFormatter.ts        # LLM向けMarkdownプロンプト＆JSONフォーマッタ
│   │   └── __tests__/                # masker / preferences / storage / formatter 単体テスト
│   ├── background/
│   │   ├── index.ts                  # Service Worker (アイコン起動・タブ間メッセージ中継・注入)
│   │   └── __tests__/                # Background 単体テスト
│   ├── content/
│   │   ├── index.tsx                 # Shadow DOM ホスト (#dpa-root-host) マウント＆Bridge注入
│   │   ├── OverlayApp.tsx            # ページ上オーバーレイUI (ホバー枠・バッジ・ポップオーバー・マスク枠)
│   │   ├── FloatingBottomBar.tsx     # Figma UI3 風ボトムバー (選択・デバイス・指示・コピー)
│   │   ├── AnnotationDrawer.tsx      # 指示一覧・共通前提・マスキング設定ドロワー
│   │   ├── DevicePreview.tsx         # ページ内 iframe デバイスプレビュー
│   │   ├── overlayStyles.ts          # Shadow DOM 内部用スコープドCSS
│   │   ├── domExtractor.ts           # CSSセレクタ生成・XPath生成・スタイル＆メタデータ抽出
│   │   ├── mainWorldBridge.ts        # Main World 実行スクリプト (React Fiber / Vue 3 解析)
│   │   ├── mainWorldInjection.ts     # mainWorldBridge.js の注入ヘルパー (トップ/同一オリジンiframe)
│   │   └── __tests__/                # Content Script 各モジュールの単体テスト
│   └── __tests__/
│       ├── integration.test.tsx      # OverlayApp + ボトムバー/ドロワー/プレビューの結合テスト
│       └── buildEncoding.test.ts     # ビルド成果物の文字コード検証
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### 開発コマンド一覧

| コマンド | 説明 |
| :--- | :--- |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) による型チェックを実行 |
| `npm test` | Vitest + JSDOM による全単体テスト・結合テストを実行 |
| `npm run test:e2e` | `dist/` をビルドし、実 Chrome（ヘッドレス）でアンパック済み拡張機能のE2Eテストを実行 |
| `npm run build` | `dist/` ディレクトリへ Chrome 拡張機能一式をビルド |
| `npm run verify-dist` | ビルド成果物 (`dist/`) の構成を検証 |
