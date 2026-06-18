# ハウスクリーニング管理アプリ MVP

Next.js + Supabase + Vercel で動かす最小版です。

## 機能

- 管理者/スタッフのログイン
- スタッフ1名向けの自動ログインモード
- 管理者による予約登録
- スタッフ別の担当予約表示
- スタッフの実績報告
- スタッフの経費申請
- 管理者の経費承認、購入済み処理
- 領収書画像の添付必須バリデーション
- 月次の売上、給料、経費、純利益の自動計算

## 初期設定

1. Supabase で新規プロジェクトを作成します。
2. `supabase/schema.sql` を SQL Editor で実行します。
3. Supabase Auth でユーザーを作成します。
4. `profiles` テーブルに作成したユーザーの行を追加し、`role` を `admin` または `staff` にします。
5. `.env.example` を参考に `.env.local` を作成します。
6. `npm install` のあと `npm run dev` を実行します。

### profiles の登録例

Supabase Auth で作ったユーザーIDを `id` に入れてください。

```sql
insert into public.profiles (id, display_name, role, commission_rate)
values
  ('AUTH_USER_ID_FOR_ADMIN', '管理者', 'admin', 0.5),
  ('AUTH_USER_ID_FOR_STAFF', 'スタッフA', 'staff', 0.5);
```

## Vercel

Vercel の Environment Variables に以下を設定します。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SINGLE_USER_MODE=false`

GitHub に push したあと、Vercel でそのリポジトリを Import すればデプロイできます。

公開運用では `SINGLE_USER_EMAIL` と `SINGLE_USER_PASSWORD` は設定しません。
スタッフ・管理者は Supabase Authentication のアカウントでログインします。

## 公開運用のURL

- スタッフ: `https://your-vercel-domain/staff/dashboard`
- 管理者: `https://your-vercel-domain/admin/login`
- 管理者マスタ: `https://your-vercel-domain/admin/masters`

## ローカル確認

```bash
npm run build
npm run dev
```

`.env.local` がない状態では Supabase に接続できないため、ログイン以降の画面確認には環境変数の設定が必要です。

## 既存Supabaseプロジェクトの更新

仕様書対応版へ更新する場合は、SQL Editorで次のマイグレーションを実行します。

```text
supabase/migrations/20260613_spec_expansion.sql
supabase/migrations/20260613_report_approval.sql
supabase/migrations/20260613_workers.sql
supabase/migrations/20260613_spreadsheet_import_tracking.sql
supabase/migrations/20260613_staff_update_reservations.sql
supabase/migrations/20260613_service_categories_ascii.sql
supabase/migrations/20260613_report_payment_reconciliation.sql
supabase/migrations/20260613_parking_notes.sql
supabase/migrations/20260614_staff_replace_reservation_workers.sql
supabase/migrations/20260614_staff_update_full_reservation.sql
supabase/migrations/20260614_service_content_master.sql
```

`20260613_create_admin_profile.sql` はテンプレートです。
`ADMIN_EMAIL@example.com` を実際の管理者メールに置き換えてから実行してください。

予約ステータス、案件別歩合率、経費の関連案件・メモ・承認情報が追加されます。

## スタッフ1名で使う場合

`SINGLE_USER_MODE=true` にすると、ログイン画面を表示せず、設定したスタッフで内部的に自動認証します。

```env
SINGLE_USER_MODE=true
SINGLE_USER_EMAIL=staff@example.com
SINGLE_USER_PASSWORD=任意のパスワード
```

このメールアドレスとパスワードのユーザーは、Supabase Authentication に事前登録してください。
