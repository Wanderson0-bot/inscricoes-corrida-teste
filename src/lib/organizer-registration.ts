import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function provisionOrganizer(userId: string, organizationName: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("provision_organizer", {
    p_user_id: userId,
    p_organization_name: organizationName,
  });

  if (error) throw error;
}
