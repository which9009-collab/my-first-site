# 劉亦中 Yvette 個人網站

無障礙永續顧問劉亦中的自我介紹網站，含訪客留言板與 AI 一句話總結。

- 正式網址：https://my-first-site-eight-nu.vercel.app/
- 舊網址（GitHub Pages，無留言板）：https://which9009-collab.github.io/my-first-site/

## 架構

| 檔案 | 用途 |
|---|---|
| `index.html` | 整個網頁（HTML、CSS、JS 都在這個檔案） |
| `api/guestbook.js` | 留言板 API：讀取最新 50 則、新增留言 |
| `api/summary.js` | AI 一句話總結 API，使用 Claude（`claude-haiku-4-5`） |

推送到 GitHub 的 `main` 分支後，Vercel 會自動部署。

## 環境變數

所有密碼和金鑰都只存在 Vercel，不在程式碼裡。程式透過 `process.env` 讀取。

| 變數 | 用途 | 來源 |
|---|---|---|
| `DATABASE_URL` | Neon Postgres 連線字串（含帳號密碼） | Vercel Storage 的 Neon 整合自動建立 |
| `ANTHROPIC_API_KEY` | Claude API 金鑰 | 在 Anthropic Console 產生，手動加到 Vercel |
| `IP_SALT`（選填） | 防洗版用的 IP 雜湊鹽值 | 任意隨機文字；未設定時改用 `DATABASE_URL` |

範本見 [`.env.example`](.env.example)。

**新增或修改變數：** Vercel 專案 → Settings → Environment Variables → 填好後按 Save，再到 Deployments 對最新部署按 **⋯ → Redeploy**，新值才會生效。

**更換金鑰（例如懷疑外洩）：**

1. 在 Anthropic Console 產生新金鑰。
2. 到 Vercel 把 `ANTHROPIC_API_KEY` 改成新值，然後 Redeploy。
3. 確認網站的 AI 總結正常後，回 Anthropic Console 刪除舊金鑰。

資料庫密碼要更換時，到 Neon 控制台重設密碼，Vercel 的 Neon 整合會同步更新 `DATABASE_URL`；更新後同樣要 Redeploy。

## 資料表

第一次呼叫 API 時會自動建立：

- `guestbook`：留言（`id`、`name`、`message`、`ip_hash`、`created_at`）
- `guestbook_summary`：最近一次的 AI 總結，留言沒變時直接重用

刪除單則留言：在 Neon 的 SQL Editor 執行 `DELETE FROM guestbook WHERE id = <編號>;`
