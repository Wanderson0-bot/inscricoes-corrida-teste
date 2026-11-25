import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingSupabaseSession } from "@/lib/supabase/session";

export async function getAuthenticatedProfile(writeCookies = false) {
  const supabase = await createSupabaseServerClient(writeCookies);
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError && !isMissingSupabaseSession(userError)) {
    throw new Error("Não foi possível verificar a sessão.", { cause: userError });
  }
  if (!user) {
    redirect("/entrar");
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error("Não foi possível verificar as permissões da conta.", { cause: profileError });
  }

  return { supabase, user, profile };
}

export async function requireOrganizer() {
  const { supabase, user, profile } = await getAuthenticatedProfile();

  if (!profile) {
    redirect("/cadastro-organizador/concluir");
  }
  if (profile.role === "platform_admin") {
    redirect("/admin/financeiro");
  }
  if (profile.role !== "organizer" || !profile.organization_id) {
    redirect("/entrar?erro=acesso");
  }

  return { supabase, user, profile };
}

export async function requirePlatformAdmin() {
  const { supabase, user, profile } = await getAuthenticatedProfile();

  if (!profile) {
    redirect("/cadastro-organizador/concluir");
  }
  if (profile.role !== "platform_admin" || profile.organization_id) {
    redirect("/entrar?erro=acesso");
  }

  return { supabase, user, profile };
}
