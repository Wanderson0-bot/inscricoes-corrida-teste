import type { AuthError } from "@supabase/supabase-js";

export function isMissingSupabaseSession(error: AuthError | null) {
  return error?.name === "AuthSessionMissingError" ||
    error?.code === "session_not_found" ||
    error?.code === "session_expired" ||
    error?.code === "refresh_token_not_found" ||
    error?.code === "refresh_token_already_used";
}
