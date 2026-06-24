import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentProfile } from "@/lib/auth";
import { isAdminHost } from "@/lib/domain";

export default async function Home() {
  const headerStore = await headers();
  const adminHost = isAdminHost(headerStore.get("host"));
  const profile = await getCurrentProfile().catch(() => null);

  if (!profile) {
    if (adminHost) {
      redirect("/admin/login");
    }

    if (process.env.SINGLE_USER_MODE === "true") {
      redirect("/auth/auto");
    }

    redirect("/login");
  }

  redirect(profile.role === "admin" ? "/admin/dashboard" : "/staff/dashboard");
}
