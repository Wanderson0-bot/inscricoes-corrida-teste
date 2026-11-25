import { clearAuthCookiesAtScopes, createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isMissingSupabaseSession } from "@/lib/supabase/session";
import { getSupabasePublicConfig } from "@/lib/env";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = getSupabasePublicConfig();
  const getAll = () => request.cookies.getAll();
  const setAll: SetAllCookies = (cookiesToSet, headers) => {
    for (const { name, value, options } of cookiesToSet) {
      if (options.maxAge === 0) {
        request.cookies.delete(name);
      } else {
        request.cookies.set(name, value);
      }
    }

    const nextResponse = NextResponse.next({ request });
    for (const cookie of response.cookies.getAll()) {
      nextResponse.cookies.set(cookie);
    }
    for (const { name, value, options } of cookiesToSet) {
      nextResponse.cookies.set(name, value, options);
    }
    for (const [name, value] of Object.entries(headers)) {
      nextResponse.headers.set(name, value);
    }
    response = nextResponse;
  };

  const supabase = createServerClient(url, key, { cookies: { getAll, setAll } });
  const { error } = await supabase.auth.getUser();
  if (isMissingSupabaseSession(error)) {
    await clearAuthCookiesAtScopes({
      getAll,
      setAll,
      storageKey: `sb-${new URL(url).hostname.split(".")[0]}-auth-token`,
      scopes: [{ path: "/" }],
    });
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/painel/:path*", "/api/painel/:path*", "/admin/:path*", "/cadastro-organizador/concluir"],
};
