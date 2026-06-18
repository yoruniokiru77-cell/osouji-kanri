import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";

export default async function Home() {
  const profile = await getCurrentProfile().catch(() => null);

  if (!profile) {
    if (process.env.SINGLE_USER_MODE === "true") {
      redirect("/auth/auto");
    }

    redirect("/login");
  }

  redirect(profile.role === "admin" ? "/admin/dashboard" : "/staff/dashboard");
}
