import { redirect } from "next/navigation";
import { signIn } from "@/app/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (process.env.SINGLE_USER_MODE === "true") {
    redirect("/auth/auto");
  }

  return (
    <main className="login">
      <section className="panel login-card">
        <h1>ログイン</h1>
        <p className="muted">管理者・スタッフ共通のログイン画面です。</p>
        <form action={signIn} className="form">
          <label className="field">
            <span>メールアドレス</span>
            <input className="input" name="email" type="email" required />
          </label>
          <label className="field">
            <span>パスワード</span>
            <input className="input" name="password" type="password" required />
          </label>
          <button className="button" type="submit">
            ログイン
          </button>
        </form>
      </section>
    </main>
  );
}
