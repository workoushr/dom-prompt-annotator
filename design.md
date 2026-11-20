# Design & Architecture Specification: dom-prompt-annotator

## 1. ビジョン & コンセプト (Vision & Concept)

`dom-prompt-annotator` は、Web開発者・デザイナー・QAが「画面を見ながら直感的にAI（LLM）へのUI修正プロンプトを生成する」ための Chrome 拡張機能（Manifest V3）です。

対象ページのレイアウトを大きく崩さずに操作できるよう、**Figma UI3 に準拠したフローティングボトムバー（Canvas Bottom Bar）** をページ内に表示します。UI はこのボトムバーと、そこから開くポップオーバー・ドロワーのみで完結し、ブラウザの常設パネルは使用しません。ボトムバーは既定で非表示で、拡張機能アイコンまたは `Alt + S` で呼び出します。呼び出し時の選択モード設定だけを `chrome.storage.local` に永続化し、注釈などのページ状態は **`chrome.storage.session`** にのみ保持するセッション限定の設計とします。ページ更新・再読み込みでマーキング（番号バッジ・指示）は消えます。

---

## 2. デザインシステム & デザイン言語 (Design System)

**Figma UI3** に準拠した、**プロフェッショナルで邪魔にならないミニマルなツール感（Floating Island Panels & Canvas Architecture）** を徹底します。

### 2.1 技術スタック
- **UI Framework**: React 18 + TypeScript
- **Icons**: Lucide React
- **Styling**: Shadow DOM 内スコープドCSS（ページ内オーバーレイ）
- **Component Design**: Figma UI3 のボタン・メニュー・ドロワー・バッジのデザイン言語を踏襲

### 2.2 デザイン原則 (Design Principles)
1. **Unobtrusive（画面を邪魔しない）**:
   - 閲覧対象のWebページが主役。拡張機能のUIはコンパクトなボトムバーに収まり、透過・ぼかし（`backdrop-blur`）で背後を遮らない。
   - デバイスプレビューを開閉してもボトムバーの位置は動かさない。
2. **Precision & Density（高密度かつ精緻）**:
   - フォントサイズは 12px〜13px、余白は `p-1.5`〜`p-2.5` を基調とした Figma / DevTools ライクな情報密度。
3. **Portal Containment（Shadow DOM 隔離の徹底）**:
   - ページ内のボトムバー・ポップオーバー・メニュー・ドロワー・トーストは Shadow DOM 内部に描画し、Webサイト側のDOMやCSSと一切干渉させない。
   - 拡張機能のUIはページ内の1つの Shadow Root に集約し、ページの見た目へ影響を与えない。

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

UI はすべて **ページ内に描画されるライブUI** で構成されます。独立した常設パネルは存在しません。

```text
[ページ内]（ボトムバーは有効時のみ）
  フローティングボトムバー
  ＋ 要素ハイライト / 番号バッジ
  ＋ インライン指示ポップオーバー
  ＋ 指示一覧・設定ドロワー
  ＋ iframe デバイスプレビュー
```

**起動モデル**:

- 初期状態ではボトムバーを描画しない（`isVisible: false`）。ページのクリックやスクロールを横取りしない。
- ツールバーの拡張機能アイコンをクリックすると、ボトムバーを表示して **選択モード (Inspect ON)** を有効にする。この選択状態を `chrome.storage.local` に保存する。
- ボトムバーが非表示のときに `Alt + S` を押した場合も、表示＋選択ONとして同じ設定を保存する。
- ページ遷移・リロード時は保存済みの `inspectMode` を読み、`true` のときだけボトムバーを表示する。選択モードが勝手にONになることはない。
- バー上の選択OFF、またはバーを閉じる操作は `inspectMode: false` を保存する。選択OFFでは現在のページのバーを維持し、閉じる操作では即座に非表示にする。

---

### 3.1 フローティングボトムバー (Floating Bottom Bar)

ページの画面下部中央に表示されるコンパクトなツールバー（高さ `44px`）。デバイスプレビューの開閉やページの再読み込み後も位置は固定されます。既定では非表示で、起動モデルに従って表示されます。

```text
+----------------------------------------------------------------------------------+
| [🔍 選択 (Alt+S)] | [📱 393×852 (iPhone) ▼] | [📝 3件 ▼] | [📋 コピー] | [ー] [×] |
+----------------------------------------------------------------------------------+
```

| セクション | コンポーネント | 説明 |
| :--- | :--- | :--- |
| **選択モード切替** | `Button` + ステータスドット | クリックまたは `Alt + S` で要素ホバー＆選択モードをON/OFF。アクティブ時はアクセントブルーで発光。OFF時は `inspectMode: false` を保存し、現在ページではバーを維持する。 |
| **デバイスプレビュー** | `DropdownMenu` + `Button` | プリセット（iPhone SE, iPhone 15 Pro, iPad Mini, Desktop, Desktop HD）、縦横回転、デスクトップへのリセットを切替。選択時はページ内 iframe プレビューを表示する。 |
| **指示カウンター & 一覧** | `Button` / `Popover` | 現在の指示件数バッジ（例: `3`）。クリックすると上部にミニマルなドロワーが開き、指示の並び替え・削除・前提指示入力が可能。 |
| **プロンプトコピー** | `Split Button` (Primary) + フォーマットメニュー | ワンクリックで Markdown / JSON をクリップボードにコピー。完了時にチェックアイコンへアニメーションし、スプリットボタン全体が成功色になる。コピー成功後はページのマーキングを全消去する。 |
| **最小化 (Collapse)** | `Button` (Ghost) | ページ下部のボタンを邪魔する場合、ワンクリックで右隅の小さなピル型FAB（フローティングアクションボタン）に折りたたむ。 |
| **閉じる (Close)** | `Button` (Ghost) | ボトムバーとポップオーバーを閉じ、`inspectMode: false` を保存する。次回のページ遷移・リロードでも非表示になる。 |

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

### 3.4 起動・設定のライフサイクル

選択モード設定は **`chrome.storage.local` の `dpa_ui_preferences`** に保存します。

```json
{ "dpa_ui_preferences": { "inspectMode": true } }
```

| 操作 | 永続設定 (`storage.local`) | 現在ページの状態 (`storage.session`) |
| :--- | :--- | :--- |
| 拡張機能アイコンをクリック | `inspectMode: true` を保存（常にON、トグルしない） | `isVisible: true` / `inspectMode: true`。バーを表示 |
| 非表示時に `Alt + S` | `inspectMode: true` を保存 | `isVisible: true` / `inspectMode: true`。バーを表示 |
| バー表示中の `Alt + S` / 「選択」ボタン | 新しいON/OFFを保存 | 選択状態のみ反映。バーは表示したまま |
| バーを閉じる（`×`） | `inspectMode: false` を保存 | `isVisible: false` / `inspectMode: false`。即座に非表示 |
| ページ遷移・リロード | 変更なし | ページ状態をクリアし、`isVisible = inspectMode = 保存値` で初期化 |

- 既定値は `inspectMode: false`。未保存の状態ではバーを描画しない。
- バー上の選択をOFFにした場合、現在のページではバーを維持する（ドロワーやコピーは引き続き使える）。次回のページ遷移・リロードでは `inspectMode: false` が読まれ、バーは表示されない。
- 注釈データはこの設定とは独立しており、永続化されない。設定が `true` でもリロード後の注釈は空になる。

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

### 3.6 UI 調整の詳細 (UI Polish)

1. **デバイスボタンの余白解消**:
   - デバイス未選択時は回転ボタンを描画しないが、ボタン幅を「アクティブ時のデバイスボタン `176px` + 間隔 `2px` + 回転ボタン `28px` = `206px`」に固定する。
   - これにより、デバイス選択のON/OFFでボトムバー全体の幅が変わらず、右側に不要な空白も残らない。
2. **コピー成功色の適用範囲**:
   - コピー用スプリットボタンは、メインの「プロンプトコピー」と形式切替（`Markdown / JSON`）の2つのボタンで構成される。
   - 成功時はラッパーに成功状態を付与し、**両方のボタン**を同時に成功色（`#059669`、ホバー時 `#047857`）へ変更する。片方だけが青いまま残らない。
   - 成功表示はチェックアイコン＋「コピー完了!」で、`2.5秒` 後に通常状態へ戻る。

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

状態は **永続UI設定** と **ページ限定の一時状態** に分離します。

**(1) 永続UI設定: `dpa_ui_preferences`（`chrome.storage.local`）**

```ts
interface UiPreferences {
  inspectMode: boolean; // 既定 false
}
```

- 拡張機能アイコン、`Alt + S`、バー上の選択切替、バーを閉じる操作によって更新する。
- ページをまたいで残るのはこの設定だけであり、「選択モードを再開するか」を決める。
- 読み込み失敗時はメモリ上の既定値（`inspectMode: false`）にフォールバックし、例外を投げない。

**(2) ページ状態: `PageAnnotationState`（`chrome.storage.session`）**

- `annotations`: 番号付きの指示（要素メタデータ、セレクタ、XPath、指示文、マスク状態）
- `globalInstruction`: ページ全体の共通前提
- `maskingConfig`: PII / 全文マスク / 視覚マスク / カスタムセレクタ / マスク色
- `inspectMode`: 選択モードのON/OFF（永続設定をミラーし、イベント処理のゲートに使う）
- `isVisible`: このページでボトムバーを描画するか

**ページ状態の保存先は `chrome.storage.session` のみ**とし、URLを `origin + pathname` に正規化したキーで管理します。ディスクへは保存しません。デバイスプレビューの選択状態は React のローカル状態であり、永続化しません。

- Background はタブの読み込み開始時に該当URLのページ状態を削除し、リロード・遷移で注釈が復活しないようにする。
- Content Script は初期化時に `dpa_ui_preferences` を読み、`isVisible = inspectMode = inspectMode設定` としてページ状態を初期化する。過去の番号バッジ・指示は再描画しない。
- ブラウザセッションをまたいだ注釈の復元も行わない。
- ページ状態の書き込み元はページ内の Content Script のみで、複数UI間の同期は不要。

### 4.3 メッセージルーティング

```text
[ツールバーアイコン] ──(chrome.action.onClicked)──▶ [Background]
                                                      │ 1. dpa_ui_preferences.inspectMode = true
                                                      │ 2. SET_INSPECT_MODE { enabled: true }
                                                      ▼
[ページ内 OverlayApp] ◀───────────────────────────────┘
        │  未注入なら chrome.scripting で content.js を再注入
        │
        ├──(GET_PAGE_STATE)──▶ [Background] ──▶ [chrome.storage.session]
        ├──(PAGE_STATE_UPDATED)──▶ [Background]（互換用の通知）
        └──(SET_INSPECT_MODE)──▶ 永続設定の保存＋ページ状態の更新
```

- Background はアイコンクリック時に制限URLを除外し、`saveInspectMode(true)` を保存してから `SET_INSPECT_MODE` を送る。ON専用であり、アイコンクリックでOFFにはしない。
- Content Script が未注入のタブでは、Background が `chrome.scripting.executeScript` で `content.js` を注入してからメッセージを再送する。
- 受信側の Content Script は、INSPECT ON時に `isVisible: true` と選択モードを更新し、最小化状態も解除する。OFF時（バー上の切替）は選択モードのみOFFにし、バーは維持する。
- 注釈・設定の変更は Content Script が `chrome.storage.session` に保存し、必要に応じて `PAGE_STATE_UPDATED` を通知する。独立した管理UIは存在しないため、この通知は互換目的の片方向通知である。
- 制限URL（`chrome://`, `chrome-extension://`, Web Store 等）では操作をスキップする。

### 4.4 コピー成功時のマーキング消去フロー

```text
1. ユーザーが「プロンプトコピー」を実行
2. 現在の PageAnnotationState から Markdown+JSON または JSON を生成
3. navigator.clipboard.writeText() でコピー
4. 成功時: annotations を空にした状態を chrome.storage.session へ保存
5. 現在のページ状態を再描画（番号バッジ・ポップオーバーを除去）し、指示件数を 0 に更新
6. コピーボタンを成功色で表示し、2.5秒後に通常状態へ戻す
```

マーキングの消去はクリップボードへの書き込みが成功した場合にのみ行います。これにより「コピーできたので、そのページの指示は役目を終えた」という操作と状態を一致させます。

### 4.5 ディレクトリ構成

```text
src/
├── types/
│   └── annotation.ts             # 共通型・メッセージ型・デバイスプリセット
├── utils/
│   ├── masker.ts                 # Playwright風マスキング・PIIサニタイズ
│   ├── preferences.ts            # dpa_ui_preferences の chrome.storage.local 永続化
│   ├── storage.ts                # chrome.storage.session のページ状態管理
│   ├── promptFormatter.ts        # Markdown+JSON / JSON 出力
│   └── __tests__/                # masker / preferences / storage / formatter 単体テスト
├── background/
│   ├── index.ts                  # Service Worker（アイコン起動・メッセージ中継・注入・遷移時クリア）
│   └── __tests__/                # Background 単体テスト
├── content/
│   ├── index.tsx                 # Shadow Root ホスト作成・Bridge 注入
│   ├── OverlayApp.tsx            # 選択・ホバー・ポップオーバー・バッジ・プレビュー
│   ├── FloatingBottomBar.tsx     # Figma UI3 風ボトムバー
│   ├── AnnotationDrawer.tsx      # 指示一覧・共通前提・マスキングドロワー
│   ├── DevicePreview.tsx         # 同一オリジン iframe デバイスプレビュー
│   ├── overlayStyles.ts          # Shadow DOM 用スコープドCSS
│   ├── domExtractor.ts           # セレクタ・XPath・スタイル・メタデータ抽出
│   ├── mainWorldBridge.ts        # React Fiber / Vue 3 解析
│   ├── mainWorldInjection.ts     # Bridge スクリプトの注入（トップ／同一オリジンiframe）
│   └── __tests__/                # OverlayApp / バー / ドロワー / 抽出 単体テスト
└── __tests__/
    ├── integration.test.tsx      # OverlayApp + ボトムバー/ドロワー/プレビュー結合テスト
    └── buildEncoding.test.ts     # ビルド成果物の文字コード検証
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

- **既定は非表示**: ボトムバーは `dpa_ui_preferences.inspectMode` が `true` のページでのみ表示される。未設定・`false` ではDOMを描画せず、ページ操作を妨げない。
- **設定と注釈の分離**: 選択モード設定だけが `chrome.storage.local` に残り、注釈・共通前提・マスキング設定は `chrome.storage.session` のみ。ページ更新・再読み込み・ブラウザ終了でマーキングは失われる。
- **コピーで消去**: コピー成功後は指示を再編集できないため、必要な調整はコピー前に完了させる。
- **iframe プレビュー**: 同一オリジンのみ注釈可能。`X-Frame-Options` / `frame-ancestors` により表示できないサイトがある。
- **フレームワーク情報**: React 16〜19 / Vue 3 の開発ビルドを対象とし、本番ビルドではコンポーネント名・ソース位置が取得できない場合がある。
- **権限**: `activeTab`, `storage`, `scripting`, `tabs`, `host_permissions` のみを使用し、`debugger` を含む DevTools 系権限や常設パネル用の権限は要求しない。
- **制限URL**: `chrome://` や Web Store など、Content Script を注入できないページでは動作しない。
