import { signInAdmin } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; switch?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="login">
      <section className="panel login-card">
        <p className="login-eyebrow">CleanPro</p>
        <h1>管理者ログイン</h1>
        <p className="muted">管理者アカウントでログインしてください。</p>
        {params.switch ? (
          <p className="login-notice">スタッフから管理者アカウントへ切り替えます。</p>
        ) : null}
        {params.error === "role" ? (
          <p className="login-error">このアカウントには管理者権限がありません。</p>
        ) : params.error ? (
          <p className="login-error">メールアドレスまたはパスワードが違います。</p>
        ) : null}
        <form action={signInAdmin} className="form">
          <label className="field">
            <span>メールアドレス</span>
            <input className="input" name="email" required type="email" />
          </label>
          <label className="field">
            <span>パスワード</span>
            <input className="input" name="password" required type="password" />
          </label>
          <SubmitButton className="button" pendingLabel="ログイン中...">
            管理画面へログイン
          </SubmitButton>
        </form>
      </section>
    </main>
  );
}
