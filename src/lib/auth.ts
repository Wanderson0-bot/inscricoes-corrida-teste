import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireOrganizer(writeCookies = false) {
  const supabase = await createSupabaseServerClient(writeCookies);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (
    userError &&
    userError.code !== "session_not_found" &&
    userError.code !== "refresh_token_not_found" &&
    userError.name !== "AuthSessionMissingError"
  ) {
    throw new Error("Não foi possível verificar a sessão.");
  }
  if (!user) {
    redirect("/entrar");
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single();

  if (profileError && profileError.code !== "PGRST116") {
    throw new Error("Não foi possível verificar as permissões do organizador.");
  }
  if (!profile || profile.role !== "organizer" || !profile.organization_id) {
    await supabase.auth.signOut();
    redirect("/entrar?erro=acesso");
  }

  return { supabase, user, profile };
}

export async function requirePlatformAdmin(writeCookies = false) {
  const supabase = await createSupabaseServerClient(writeCookies);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (
    userError &&
    userError.code !== "session_not_found" &&
    userError.code !== "refresh_token_not_found" &&
    userError.name !== "AuthSessionMissingError"
  ) {
    throw new Error("Não foi possível verificar a sessão.");
  }
  if (!user) {
    redirect("/entrar");
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single();

  if (profileError && profileError.code !== "PGRST116") {
    throw new Error("Não foi possível verificar as permissões administrativas.");
  }
  if (!profile || profile.role !== "platform_admin" || profile.organization_id) {
    await supabase.auth.signOut();
    redirect("/entrar?erro=acesso");
  }

  return { supabase, user, profile };
}
