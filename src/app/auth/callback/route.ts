import { NextResponse, type NextRequest } from "next/server";
import { provisionOrganizer } from "@/lib/organizer-registration";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const isOrganizerSignup = request.nextUrl.searchParams.get("flow") === "organizer";
  const failurePath = isOrganizerSignup
    ? "/cadastro-organizador?erro=confirmacao"
    : "/entrar?erro=confirmacao";
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL(failurePath, request.url));
  }

  const supabase = await createSupabaseServerClient(true);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL(failurePath, request.url));
  }

  if (isOrganizerSignup) {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    const organizationName = user?.user_metadata?.organization_name;

    if (
      userError ||
      !user ||
      user.user_metadata?.organizer_signup !== true ||
      typeof organizationName !== "string" ||
      organizationName.trim().length < 2 ||
      organizationName.trim().length > 120
    ) {
      return NextResponse.redirect(new URL(failurePath, request.url));
    }

    try {
      await provisionOrganizer(user.id, organizationName.trim());
    } catch {
      return NextResponse.redirect(new URL("/cadastro-organizador?erro=provisionamento", request.url));
    }
  }

  return NextResponse.redirect(new URL("/painel", request.url));
}
