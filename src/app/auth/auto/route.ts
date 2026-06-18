import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function redirectUrl(request: Request, pathname: string) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");

  if (host) {
    url.host = host;
  }

  url.pathname = pathname;
  url.search = "";
  return url;
}

export async function GET(request: Request) {
  if (process.env.SINGLE_USER_MODE !== "true") {
    return NextResponse.redirect(redirectUrl(request, "/login"));
  }

  const email = process.env.SINGLE_USER_EMAIL;
  const password = process.env.SINGLE_USER_PASSWORD;

  if (!email || !password) {
    return new NextResponse("単独運用モードの認証情報が設定されていません。", {
      status: 500,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    const message = error?.message.toLowerCase().includes("email not confirmed")
      ? "確認メールを開いてメールアドレスを認証してください。認証後は自動でスタッフ画面へ進みます。"
      : "Supabaseにスタッフユーザーが未登録です。Authenticationでユーザーを作成してください。";

    return new NextResponse(
      message,
      { status: 503 },
    );
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!existingProfile) {
    const { error: profileError } = await supabase.from("profiles").insert({
      id: data.user.id,
      display_name: "スタッフ",
      role: "staff",
      commission_rate: 0.5,
    });

    if (profileError) {
      return new NextResponse(
        "スタッフ情報を作成できませんでした。Supabaseで最新のschema.sqlを実行してください。",
        { status: 503 },
      );
    }
  }

  return NextResponse.redirect(redirectUrl(request, "/staff/dashboard"));
}
