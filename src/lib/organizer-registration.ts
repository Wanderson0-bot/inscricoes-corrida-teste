import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function provisionOrganizer(userId: string, organizationName: string) {
  const admin = createSupabaseAdminClient();
  const { data: existingProfile, error: profileLookupError } = await admin
    .from("user_profiles")
    .select("organization_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileLookupError) throw profileLookupError;
  if (existingProfile) {
    if (existingProfile.role === "organizer" && existingProfile.organization_id) return;
    throw new Error("This account already has a different role.");
  }

  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .insert({ name: organizationName })
    .select("id")
    .single();

  if (organizationError || !organization) {
    throw organizationError ?? new Error("Could not create the organization.");
  }

  const { error: profileError } = await admin.from("user_profiles").insert({
    user_id: userId,
    organization_id: organization.id,
    role: "organizer",
  });

  if (profileError) {
    await admin.from("organizations").delete().eq("id", organization.id);
    throw profileError;
  }
}
