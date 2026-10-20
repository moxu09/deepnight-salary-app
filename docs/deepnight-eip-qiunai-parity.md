# 深夜 EIP 功能同步

功能對照來源：秋奈 GitHub `7a122a9`。深夜基礎版本：`dc55674`。沒有使用秋奈本機未提交內容。

## 本次加入

- 後台 `/admin/activities`：建立、編輯、發布、停止發布活動；管理場次、訂單及到職天數門檻、不參與與地區回覆、參與說明。
- 員工工作台「活動報名」：查看本人資格與回覆、選擇場次、攜帶一位親友；截止後鎖定。沿用秋奈 GitHub 的單選及一位親友規則。
- 名單按場次分組，可匯出 Excel 與 A4 橫式列印；完整分頁讀取回覆與親友資料，時間使用台北時間。
- 公告可建立單選／複選投票；投票統計與個人選項同時顯示在既有公告、簽署頁；修改投票失敗時保留原投票。
- 員工工作台「App 下載」及後台 `/admin/app-installers`：管理員可發布四平台安裝包；Windows 使用 EXE、macOS 使用 ZIP、Android 使用 APK。單檔 50 MB，下載前核對雜湊及大小。
- 桌面登入 bootstrap 與本人申請紀錄 API。

## 資料邊界

活動、選項、回覆及親友使用 `deepnight_*` 新表；員工為 `players`，資格訂單為 `play_orders`。投票依公告的 `organization_code=deepnight` 驗證。

安裝包資料以 `organization_code=deepnight` 查詢，物件只允許 `deepnight/installers/<platform>/`。管理員發布安裝包與員工下載分別驗證，財務 ERP 安裝包原有的擁有者權限保持獨立。

新表啟用 RLS、撤銷瀏覽器直接存取；寫入 RPC 只允許 service role。已報名的活動或選項不能刪除，可停止發布保存紀錄。

## 正式資料庫

依序套用以下遷移；均已在本機 PostgreSQL 相容環境驗證可重複套用：

1. `20261021010000_deepnight_eip_activities_polls.sql`
2. `20261021011000_deepnight_eip_atomic_responses.sql`
3. `20261021012000_eip_app_installers.sql`
4. `20261021013000_deepnight_activity_history_guards.sql`

2026-10-21 已透過正式專案 SQL Editor 套用，REST 檢查五個新表可用；新表 RLS 開啟，anon/authenticated 直接 SELECT 權限為 false。使用不存在 ID 呼叫兩個 RPC，均回傳預期的業務拒絕，沒有建立任何活動、投票或薪資測試紀錄。

## 驗證與部署

- 執行 `node --test test/*.test.mjs`、`npm run lint`、`npm run build`。
- 安裝包及報名／投票測試均使用假資料；Excel 測試實際寫入再讀回 XLSX。
- 正式部署後需核對活動、投票、下載 API 的登入與管理權限，以及既有工作台、訊息、簽署、財務下載。
- 深夜原生安裝包尚未製作或上傳，下載頁會顯示尚未發布；不能將秋奈安裝包改名當成深夜 App。
- 秋奈 Bot 的活動通知排程沒有移植到深夜 Bot；本次加入活動管理及報名，不宣稱已具備自動活動私訊。
- Railway 部署狀態另行確認；本機建置成功不代表正式站已更新。
