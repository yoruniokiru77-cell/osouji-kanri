import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { signIn } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { isAdminHost } from "@/lib/domain";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const headerStore = await headers();
  if (isAdminHost(headerStore.get("host"))) {
    redirect("/admin/login");
  }

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
          <SubmitButton className="button" pendingLabel="ログイン中...">
            ログイン
          </SubmitButton>
        </form>
      </section>
    </main>
  );
}
