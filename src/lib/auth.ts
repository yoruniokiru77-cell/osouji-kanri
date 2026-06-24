import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, role, commission_rate")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return null;
  }

  return profile as Profile;
}

export async function requireRole(role: Role) {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect(role === "admin" ? "/admin/login" : "/login");
  }

  if (profile.role !== role) {
    if (role === "staff" && process.env.SINGLE_USER_MODE === "true") {
      redirect("/auth/auto");
    }

    redirect(role === "admin" ? "/admin/login?switch=1" : "/admin/dashboard");
  }

  return profile;
}
