# Design & Architecture Specification: dom-prompt-annotator

## 1. ビジョン & コンセプト (Vision & Concept)

`dom-prompt-annotator` は、Web開発者・デザイナー・QAが「画面を見ながら直感的にAI（LLM）へのUI修正プロンプトを生成する」ための Chrome 拡張機能（Manifest V3）です。

対象ページのレイアウトを大きく崩さずに操作できるよう、**Figma UI3 に準拠したフローティングボトムバー（Canvas Bottom Bar）** をページ上に常駐させ、指示の管理・マスキング設定・出力は **Chrome サイドパネル** で行います。ページ状態は **`chrome.storage.session`** にのみ保持するセッション限定の設計とし、ページ更新・再読み込みでマーキング（番号バッジ・指示）は消えます。

---

## 2. デザインシステム & デザイン言語 (Design System)

**Figma UI3** に準拠した、**プロフェッショナルで邪魔にならないミニマルなツール感（Floating Island Panels & Canvas Architecture）** を徹底します。

### 2.1 技術スタック
- **UI Framework**: React 18 + TypeScript
- **Icons**: Lucide React
- **Styling**: Tailwind CSS（サイドパネル） / Shadow DOM 内スコープドCSS（ページ内オーバーレイ）
- **Component Design**: Figma UI3 のボタン・メニュー・ドロワー・バッジのデザイン言語を踏襲

### 2.2 デザイン原則 (Design Principles)
1. **Unobtrusive（画面を邪魔しない）**:
   - 閲覧対象のWebページが主役。拡張機能のUIはコンパクトなボトムバーに収まり、透過・ぼかし（`backdrop-blur`）で背後を遮らない。
   - デバイスプレビューを開閉してもボトムバーの位置は動かさない。
2. **Precision & Density（高密度かつ精緻）**:
   - フォントサイズは 12px〜13px、余白は `p-1.5`〜`p-2.5` を基調とした Figma / DevTools ライクな情報密度。
3. **Portal Containment（Shadow DOM 隔離の徹底）**:
   - ページ内のポップオーバー・メニュー・ドロワー・トーストは Shadow DOM 内部に描画し、Webサイト側のDOMやCSSと一切干渉させない。
   - サイドパネルは拡張機能専用オリジンで動作するため、ページ側のCSSの影響を受けない。

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
  --accent-amber: #f59e0b;   /* プレビュー制限・注意喚起 */
  --accent-emerald: #10b981; /* コピー完了 */

  /* シャドウ */
  --shadow-figma-bar: 0 12px 32px -4px rgba(0, 0, 0, 0.5), 0 4px 12px -2px rgba(0, 0, 0, 0.35);
  --shadow-popover: 0 16px 40px -6px rgba(0, 0, 0, 0.6);
}
```

---

## 3. UI画面構成とレイアウト仕様 (UI Components Architecture)

UIは大きく分けて **ページ上に常駐するライブUI** と **拡張機能のサイドパネル** の2つで構成されます。

```text
[ページ上]
  フローティングボトムバー
  ＋ 要素ハイライト / 番号バッジ
  ＋ インライン指示ポップオーバー
  ＋ 指示一覧・設定ドロワー
  ＋ iframe デバイスプレビュー

[サイドパネル]
  指示一覧 / 共通前提 / マスキング設定 / 出力プレビュー / コピー
```

拡張機能アイコンをクリックするとサイドパネルが開き、ページ側は **選択モード (Inspect ON)** になります。ボトムバーとサイドパネルは同一のページ状態を参照し、どちらから操作しても即座に同期されます。

---

### 3.1 フローティングボトムバー (Floating Bottom Bar)

Webページの画面下部中央に常駐するコンパクトなツールバー（高さ `44px`）。デバイスプレビューの開閉やページの再読み込み後も位置は固定されます。

```text
+----------------------------------------------------------------------------------+
| [🔍 選択 (Alt+S)] | [📱 393×852 (iPhone) ▼] | [📝 3件 ▼] | [📋 コピー] | [ー] [×] |
+----------------------------------------------------------------------------------+
```

| セクション | コンポーネント | 説明 |
| :--- | :--- | :--- |
| **選択モード切替** | `Button` + ステータスドット | クリックまたは `Alt + S` で要素ホバー＆選択モードをON/OFF。アクティブ時はアクセントブルーで発光。 |
| **デバイスプレビュー** | `DropdownMenu` + `Button` | プリセット（iPhone SE, iPhone 15 Pro, iPad Mini, Desktop, Desktop HD）、縦横回転、デスクトップへのリセットを切替。選択時はページ内 iframe プレビューを表示する。 |
| **指示カウンター & 一覧** | `Button` / `Popover` | 現在の指示件数バッジ（例: `3`）。クリックすると上部にミニマルなドロワーが開き、指示の並び替え・削除・前提指示入力が可能。 |
| **プロンプトコピー** | `Button` (Primary) + フォーマットメニュー | ワンクリックで Markdown / JSON をクリップボードにコピー。完了時にチェックアイコンへアニメーション。コピー成功後はページのマーキングを全消去する。 |
| **最小化 (Collapse)** | `Button` (Ghost) | ページ下部のボタンを邪魔する場合、ワンクリックで右隅の小さなピル型FAB（フローティングアクションボタン）に折りたたむ。 |
| **閉じる (Close)** | `Button` (Ghost) | ボトムバーとポップオーバーを閉じ、ページを通常表示に戻す。 |

---

### 3.2 要素選択 & 指示ポップオーバー (Inspector Popover)

ページ上の要素をクリックした際、その要素の近くにアンカー表示されるポップオーバー。ビューポート端では上下左右へ自動的に反転・クランプし、ボトムバーと重ならない位置に配置します。

* **機能**:
  * 検出された要素情報バッジ（タグ名、ID/Class、React/Vueコンポーネント名）
  * 階層移動ボタン（`↑ 親要素` / `↓ 子要素`）
  * 修正指示テキスト入力エリア（オートフォーカス、`Ctrl/Cmd + Enter` で保存）
  * マスキング個別トグル（「この要素のテキストを伏字化」）
  * 編集時の削除・キャンセル

---

### 3.3 アノテーション一覧 & 設定ドロワー (Inspector Drawer)

ボトムバーの「📝 3件」をクリックした際、ボトムバーの上部に展開されるフライアウトパネル。

* **タブ構成**:
  1. **指示一覧 (Annotations)**: 各要素のセレクタ・指示内容・フレームワーク情報のカード一覧（該当要素へのジャンプ、削除、全消去）。
  2. **共通前提 (Context)**: ページ全体の前提プロンプト入力（例:「Tailwind CSSを使用」「モバイル対応」）。クイック挿入チップを提供。
  3. **マスキング (Privacy)**: 自動PII伏字化、全文テキストマスク、視覚マスク枠、特定セレクタの一括マスキングルールの設定。

---

### 3.4 サイドパネル (Side Panel)

拡張機能アイコンから開く常設の管理画面。ページのビューポートを占有しないため、要素選択を続けながら指示リストと設定を確認できます。

* **選択モード切替**: ページ側の選択モードをON/OFFする。
* **指示一覧**: 件数バッジ、各指示のセレクタ・フレームワーク・本文・マスク状態、該当要素へのスクロール、削除、全消去。
* **共通前提**: ページ全体への共通指示を編集する。
* **マスキング設定**: `autoMaskPII` / `maskAllText` / `visualMaskEnabled` / `maskColor`、Playwright Mask Selectorsの追加・削除。
* **出力**: Markdown+JSON / 純粋JSONの切り替え、プレビュー、クリップボードへのコピー。

---

### 3.5 iframe デバイスプレビュー (In-page Device Preview)

ボトムバーのデバイスメニューからプリセットを選ぶと、選択した幅・高さ・アスペクト比の **iframe** をページ内に表示します。

```text
+--------------------------------------------------------------+
|                                                              |
|        iframe プレビュー (例: 393 × 852 / iPhone 15 Pro)       |
|        ─ 同一オリジンなら要素選択＆注釈が可能                  |
|        ─ X-Frame-Options / frame-ancestors で拒否される場合あり  |
|                                                              |
+--------------------------------------------------------------+
| [🔍 選択] [📱 393×852 ▼] [📝 3件] [📋 コピー] [ー] [×]          |  ← 位置固定
+--------------------------------------------------------------+
```

* **ボトムバーは iframe の外側**に描画し、プレビューの開閉・サイズ変更でも位置を変えない。
* **同一オリジン**の場合のみ、iframe 内のドキュメントへアクセスして要素選択・注釈・マスキングを適用できる。
* **クロスオリジン**の場合は表示のみとなり、内部要素の注釈はできない。
* 対象サイトが `X-Frame-Options` や CSP の `frame-ancestors` で埋め込みを拒否している場合、プレビューは表示できない。その場合もトップレベルページでの通常の注釈操作は継続できる。
* プレビューはページの状態を変更しない（ページの再読み込みやビューポートの書き換えを行わない）。

---

## 4. フロントエンド技術設計 (Implementation Architecture)

### 4.1 Shadow DOM へのオーバーレイ適用
Content Script 内で Webサイト側のCSSと隔離するため、以下の構成を取ります。

1. **Shadow Root ホスト**:
   - `content/index.tsx` が `#dpa-root-host` を作成し、Shadow Root 内に React ルートをマウントする。
   - ページ側のCSSリセットや `!important` の影響を受けない。
2. **スコープドCSS**:
   - `overlayStyles.ts` のCSS文字列を Shadow Root 内の `<style>` として注入する。
   - ポップオーバー・メニュー・ドロワー・トーストも同一 Shadow Root 内に描画し、`document.body` 直下へ漏らさない。
3. **Main World ブリッジ**:
   - `mainWorldBridge.js` を `web_accessible_resources` 経由で注入し、React Fiber / Vue 3 のコンポーネント情報を `postMessage` で Content Script へ渡す。

### 4.2 状態モデルとセッション管理

ページ状態 `PageAnnotationState` は以下を保持します。

- `annotations`: 番号付きの指示（要素メタデータ、セレクタ、XPath、指示文、マスク状態）
- `globalInstruction`: ページ全体の共通前提
- `maskingConfig`: PII / 全文マスク / 視覚マスク / カスタムセレクタ / マスク色
- `inspectMode`: 選択モードのON/OFF
- `isVisible`: ボトムバーの表示状態

**保存先は `chrome.storage.session` のみ**とし、URLを `origin + pathname` に正規化したキーで管理します。ディスクへは保存しません。

- ページ更新・再読み込み時はコンテンツ側の状態を初期化し、過去の番号バッジ・指示を再描画しない。
- ブラウザセッションをまたいだ復元も行わない。
- サイドパネルとページ内オーバーレイは、背景 Service Worker を経由して同じ状態を共有する。

### 4.3 メッセージルーティング

```text
[サイドパネル] ──(SET_INSPECT_MODE / DELETE_ANNOTATION / UPDATE_*)──▶ [Background]
                                                                          │
                                                                          ▼
[ページ内 OverlayApp] ◀──(GET_PAGE_STATE / HIGHLIGHT_ELEMENT 等)──────────┘
        │
        └──(PAGE_STATE_UPDATED)──▶ [Background] ──▶ [サイドパネル]
```

- Background はアクティブタブを解決し、Content Script が未注入の場合は `chrome.scripting` でフォールバック注入してからメッセージを転送する。
- 状態変更は必ず保存後に `PAGE_STATE_UPDATED` をブロードキャストし、両UIの表示を一致させる。
- 制限URL（`chrome://`, `chrome-extension://`, Web Store 等）では操作をスキップする。

### 4.4 コピー成功時のマーキング消去フロー

```text
1. ユーザーが「プロンプトコピー」を実行
2. 現在の PageAnnotationState から Markdown+JSON または JSON を生成
3. navigator.clipboard.writeText() でコピー
4. 成功時: annotations を空にした状態を chrome.storage.session へ保存
5. PAGE_STATE_UPDATED をブロードキャスト
6. ページ上の番号バッジ・ポップオーバーを除去し、指示件数を 0 に更新
```

マーキングの消去はクリップボードへの書き込みが成功した場合にのみ行います。これにより「コピーできたので、そのページの指示は役目を終えた」という操作と状態を一致させます。

### 4.5 ディレクトリ構成

```text
src/
├── types/
│   └── annotation.ts           # 共通型・メッセージ型・デバイスプリセット
├── utils/
│   ├── masker.ts               # Playwright風マスキング・PIIサニタイズ
│   ├── storage.ts              # chrome.storage.session のページ状態管理
│   └── promptFormatter.ts      # Markdown+JSON / JSON 出力
├── background/
│   └── index.ts                # Service Worker（サイドパネル起動・メッセージ中継・注入）
├── content/
│   ├── index.tsx               # Shadow Root ホスト作成・Bridge 注入
│   ├── OverlayApp.tsx          # 選択・ホバー・ポップオーバー・バッジ・プレビュー
│   ├── FloatingBottomBar.tsx   # Figma UI3 風ボトムバー
│   ├── AnnotationDrawer.tsx    # 指示一覧・共通前提・マスキングドロワー
│   ├── overlayStyles.ts        # Shadow DOM 用スコープドCSS
│   ├── domExtractor.ts         # セレクタ・XPath・スタイル・メタデータ抽出
│   └── mainWorldBridge.ts      # React Fiber / Vue 3 解析
├── sidepanel/
│   ├── index.html
│   ├── main.tsx
│   ├── SidePanelApp.tsx        # 指示管理・マスキング設定・出力
│   └── styles.css              # Tailwind CSS
└── __tests__/
    └── integration.test.tsx    # OverlayApp + SidePanelApp 結合テスト
```

### 4.6 マスキングの適用順序

出力生成時は以下の順序でサニタイズします。

1. 要素単位の `maskText` を適用
2. `maskAllText` が有効なら全テキストを `[MASKED]` に置換
3. `maskSelectors` に一致する要素（および子孫）のテキスト・機密属性を `[MASKED]` に置換
4. `autoMaskPII` が有効ならメール・電話・カード・トークン等を種別ごとのプレースホルダへ置換

視覚マスク（`#FF00FF` のストライプ枠＋`MASKED` バッジ）はページ上での確認用であり、出力データ自体は上記のテキスト置換によって保護されます。

---

## 5. 設計上の制約 (Known Constraints)

- **セッション限定**: ページ状態は `chrome.storage.session` のみ。ページ更新・再読み込み・ブラウザ終了でマーキングは失われる。
- **コピーで消去**: コピー成功後は指示を再編集できないため、必要な調整はコピー前に完了させる。
- **iframe プレビュー**: 同一オリジンのみ注釈可能。`X-Frame-Options` / `frame-ancestors` により表示できないサイトがある。
- **フレームワーク情報**: React 16〜19 / Vue 3 の開発ビルドを対象とし、本番ビルドではコンポーネント名・ソース位置が取得できない場合がある。
- **制限URL**: `chrome://` や Web Store など、Content Script を注入できないページでは動作しない。
