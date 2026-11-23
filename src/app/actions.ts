"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrganizer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppUrl, getPrivacyPolicyVersion } from "@/lib/env";
import { provisionOrganizer } from "@/lib/organizer-registration";

const raceSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(4000).default(""),
  location: z.string().trim().max(240).default(""),
  startsAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  regulation: z.string().trim().max(20000).default(""),
  published: z.boolean().default(false),
});

const updateRaceSchema = raceSchema.extend({
  id: z.string().uuid(),
});

const categorySchema = z.object({
  raceId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  priceCents: z.coerce.number().int().min(0).max(100_000_000),
  capacity: z.coerce.number().int().min(1).max(1_000_000),
});

const categoryUpdateSchema = categorySchema.extend({
  categoryId: z.string().uuid(),
});

const teamSchema = z.object({
  raceId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
});

const couponSchema = z.object({
  raceId: z.string().uuid(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,32}$/),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.coerce.number().int().min(1),
  usageLimit: z.union([z.coerce.number().int().min(1), z.literal("")]).optional(),
  teamIds: z.array(z.string().uuid()).default([]),
});

const courtesyRuleSchema = z.object({
  raceId: z.string().uuid(),
  teamId: z.string().uuid(),
  couponId: z.string().uuid(),
  paidEntriesRequired: z.coerce.number().int().min(1).max(100_000),
  maximumCourtesies: z.coerce.number().int().min(1).max(100_000),
});

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function moneyToCents(value: string) {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return Number.NaN;
  return Math.round(Number(value.replace(",", ".")) * 100);
}

function formStringArray(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is string => typeof value === "string");
}

async function getRaceCoverFile(formData: FormData) {
  const value = formData.get("coverImage");
  if (value === null || typeof value === "string" || value.size === 0) {
    return { file: null, invalid: false };
  }

  if (value.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(value.type)) {
    return { file: null, invalid: true };
  }

  const signature = new Uint8Array(await value.slice(0, 12).arrayBuffer());
  const isJpeg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
  const isPng = signature[0] === 0x89 && signature[1] === 0x50 && signature[2] === 0x4e && signature[3] === 0x47;
  const isWebp = signature[0] === 0x52 && signature[1] === 0x49 && signature[2] === 0x46 && signature[3] === 0x46
    && signature[8] === 0x57 && signature[9] === 0x45 && signature[10] === 0x42 && signature[11] === 0x50;
  const signatureMatchesType = (value.type === "image/jpeg" && isJpeg)
    || (value.type === "image/png" && isPng)
    || (value.type === "image/webp" && isWebp);
  return signatureMatchesType ? { file: value, invalid: false } : { file: null, invalid: true };
}

async function uploadRaceCover(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  raceId: string,
  file: File,
) {
  const path = `${organizationId}/${raceId}/cover`;
  const { error } = await supabase.storage.from("race-covers").upload(path, file, {
    cacheControl: "0",
    contentType: file.type,
    upsert: true,
  });
  if (error) {
    console.error("Failed to upload race cover", { raceId, message: error.message });
    return null;
  }
  return path;
}

export async function signIn(formData: FormData) {
  const email = formString(formData, "email").trim().toLowerCase();
  const password = formString(formData, "password");
  if (!z.string().email().safeParse(email).success || password.length < 1) {
    redirect("/entrar?erro=credenciais");
  }

  const supabase = await createSupabaseServerClient(true);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect("/entrar?erro=credenciais");
  }

  revalidatePath("/", "layout");
  redirect("/painel");
}

export async function registerOrganizer(formData: FormData) {
  const parsed = z.object({
    organizationName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
    privacyConsent: z.literal("on"),
  }).safeParse({
    organizationName: formString(formData, "organizationName"),
    email: formString(formData, "email").trim().toLowerCase(),
    password: formString(formData, "password"),
    privacyConsent: formString(formData, "privacyConsent"),
  });

  if (!parsed.success) redirect("/cadastro-organizador?erro=validacao");

  const supabase = await createSupabaseServerClient(true);
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        organizer_signup: true,
        organization_name: parsed.data.organizationName,
        organizer_name: parsed.data.organizationName,
        privacy_consent_at: new Date().toISOString(),
        privacy_policy_version: getPrivacyPolicyVersion(),
      },
      emailRedirectTo: `${getAppUrl()}/auth/callback?flow=organizer`,
    },
  });

  if (error || !data.user) redirect("/cadastro-organizador?erro=cadastro");

  if (data.session) {
    try {
      await provisionOrganizer(data.user.id, parsed.data.organizationName);
    } catch {
      redirect("/cadastro-organizador?erro=provisionamento");
    }

    revalidatePath("/", "layout");
    redirect("/painel");
  }

  redirect("/cadastro-organizador?cadastro=confirmar");
}

export async function signOut() {
  const { supabase } = await requireOrganizer(true);
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("Não foi possível encerrar a sessão.");
  redirect("/entrar");
}

export async function createRace(formData: FormData) {
  const { supabase, profile } = await requireOrganizer();
  const cover = await getRaceCoverFile(formData);
  const parsed = raceSchema.safeParse({
    name: formString(formData, "name"),
    slug: formString(formData, "slug"),
    description: formString(formData, "description"),
    location: formString(formData, "location"),
    startsAt: formString(formData, "startsAt"),
    regulation: formString(formData, "regulation"),
    published: formData.get("published") === "on",
  });
  if (!parsed.success || cover.invalid) redirect(`/painel/corridas/nova?erro=${cover.invalid ? "imagem-invalida" : "validacao"}`);

  const { data: race, error } = await supabase
    .from("races")
    .insert({
      organization_id: profile.organization_id,
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description,
      location: parsed.data.location,
      starts_at: new Date(parsed.data.startsAt).toISOString(),
      regulation: parsed.data.regulation,
      published: parsed.data.published,
    })
    .select("id")
    .single();

  if (error || !race) redirect("/painel/corridas/nova?erro=salvar");
  if (cover.file) {
    const coverPath = await uploadRaceCover(supabase, profile.organization_id, race.id, cover.file);
    if (!coverPath) redirect(`/painel/corridas/${race.id}?erro=upload-imagem`);
    const { error: coverUpdateError } = await supabase.from("races")
      .update({ cover_image_path: coverPath })
      .eq("id", race.id)
      .eq("organization_id", profile.organization_id);
    if (coverUpdateError) {
      console.error("Failed to save race cover path", { raceId: race.id, message: coverUpdateError.message });
      redirect(`/painel/corridas/${race.id}?erro=upload-imagem`);
    }
  }
  revalidatePath("/painel");
  redirect(`/painel/corridas/${race.id}`);
}

export async function updateRace(formData: FormData) {
  const { supabase, profile } = await requireOrganizer();
  const cover = await getRaceCoverFile(formData);
  const parsed = updateRaceSchema.safeParse({
    id: formString(formData, "raceId"),
    name: formString(formData, "name"),
    slug: formString(formData, "slug"),
    description: formString(formData, "description"),
    location: formString(formData, "location"),
    startsAt: formString(formData, "startsAt"),
    regulation: formString(formData, "regulation"),
    published: formData.get("published") === "on",
  });
  if (!parsed.success || cover.invalid) redirect(`/painel/corridas/${formString(formData, "raceId")}?erro=${cover.invalid ? "imagem-invalida" : "validacao"}`);

  const coverPath = cover.file
    ? await uploadRaceCover(supabase, profile.organization_id, parsed.data.id, cover.file)
    : null;
  if (cover.file && !coverPath) redirect(`/painel/corridas/${parsed.data.id}?erro=upload-imagem`);

  const { error } = await supabase
    .from("races")
    .update({
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description,
      location: parsed.data.location,
      starts_at: new Date(parsed.data.startsAt).toISOString(),
      regulation: parsed.data.regulation,
      published: parsed.data.published,
      ...(coverPath ? { cover_image_path: coverPath } : {}),
    })
    .eq("id", parsed.data.id)
    .select("id")
    .single();
  if (error) redirect(`/painel/corridas/${parsed.data.id}?erro=salvar`);

  revalidatePath("/painel");
  revalidatePath(`/painel/corridas/${parsed.data.id}`);
  revalidatePath(`/corridas/${parsed.data.slug}`);
  redirect(`/painel/corridas/${parsed.data.id}`);
}

export async function deleteRace(formData: FormData) {
  const { supabase } = await requireOrganizer();
  const parsed = z.string().uuid().safeParse(formString(formData, "raceId"));
  if (!parsed.success) redirect("/painel?erro=excluir-corrida");

  const raceId = parsed.data;
  const { count, error: registrationsError } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("race_id", raceId);
  if (registrationsError) redirect("/painel?erro=excluir-corrida");
  if ((count ?? 0) > 0) redirect("/painel?erro=corrida-com-inscricoes");

  const { error } = await supabase.from("races").delete().eq("id", raceId).select("id").single();
  if (error) redirect("/painel?erro=excluir-corrida");

  revalidatePath("/painel");
  revalidatePath("/corridas");
  redirect("/painel?corrida-excluida=1");
}

export async function createCategory(formData: FormData) {
  const { supabase } = await requireOrganizer();
  const parsed = categorySchema.safeParse({
    raceId: formString(formData, "raceId"),
    name: formString(formData, "name"),
    priceCents: moneyToCents(formString(formData, "price")),
    capacity: formString(formData, "capacity"),
  });
  if (!parsed.success) redirect(`/painel/corridas/${formString(formData, "raceId")}?erro=validacao`);

  const { error } = await supabase.from("race_categories").insert({
    race_id: parsed.data.raceId,
    name: parsed.data.name,
    price_cents: parsed.data.priceCents,
    capacity: parsed.data.capacity,
  });
  if (error) redirect(`/painel/corridas/${parsed.data.raceId}?erro=salvar`);
  revalidatePath(`/painel/corridas/${parsed.data.raceId}`);
}

export async function updateCategory(formData: FormData) {
  const { supabase } = await requireOrganizer();
  const raceId = formString(formData, "raceId");
  const parsed = categoryUpdateSchema.safeParse({
    categoryId: formString(formData, "categoryId"),
    raceId,
    name: formString(formData, "name"),
    priceCents: moneyToCents(formString(formData, "price")),
    capacity: formString(formData, "capacity"),
  });
  if (!parsed.success) redirect(`/painel/corridas/${raceId}?erro=validacao`);

  const { error } = await supabase
    .from("race_categories")
    .update({
      name: parsed.data.name,
      price_cents: parsed.data.priceCents,
      capacity: parsed.data.capacity,
    })
    .eq("race_id", parsed.data.raceId)
    .eq("id", parsed.data.categoryId);
  if (error) redirect(`/painel/corridas/${parsed.data.raceId}?erro=categoria`);
  revalidatePath(`/painel/corridas/${parsed.data.raceId}`);
}

export async function deleteCategory(formData: FormData) {
  const { supabase } = await requireOrganizer();
  const raceId = formString(formData, "raceId");
  const categoryId = formString(formData, "categoryId");
  if (!z.string().uuid().safeParse(raceId).success || !z.string().uuid().safeParse(categoryId).success) redirect(`/painel/corridas/${raceId}?secao=categories&erro=validacao`);
  const { error } = await supabase.from("race_categories").delete().eq("race_id", raceId).eq("id", categoryId);
  if (error) redirect(`/painel/corridas/${raceId}?secao=categories&erro=category`);
  revalidatePath(`/painel/corridas/${raceId}`);
}

export async function createTeam(formData: FormData) {
  const { supabase } = await requireOrganizer();
  const parsed = teamSchema.safeParse({
    raceId: formString(formData, "raceId"),
    name: formString(formData, "name"),
  });
  if (!parsed.success) redirect(`/painel/corridas/${formString(formData, "raceId")}?erro=validacao`);

  const { error } = await supabase.from("race_teams").insert({
    race_id: parsed.data.raceId,
    name: parsed.data.name,
  });
  if (error) redirect(`/painel/corridas/${parsed.data.raceId}?erro=salvar`);
  revalidatePath(`/painel/corridas/${parsed.data.raceId}`);
}

export async function updateTeam(formData: FormData) {
  const { supabase } = await requireOrganizer();
  const raceId = formString(formData, "raceId");
  const teamId = formString(formData, "teamId");
  const name = formString(formData, "name").trim();
  if (!z.string().uuid().safeParse(raceId).success || !z.string().uuid().safeParse(teamId).success || !z.string().min(1).max(100).safeParse(name).success) {
    redirect(`/painel/corridas/${raceId}?secao=teams&erro=validacao`);
  }
  const { error } = await supabase.from("race_teams").update({ name }).eq("race_id", raceId).eq("id", teamId);
  if (error) redirect(`/painel/corridas/${raceId}?secao=teams&erro=team`);
  revalidatePath(`/painel/corridas/${raceId}`);
}

export async function deleteTeam(formData: FormData) {
  const { supabase } = await requireOrganizer();
  const raceId = formString(formData, "raceId");
  const teamId = formString(formData, "teamId");
  if (!z.string().uuid().safeParse(raceId).success || !z.string().uuid().safeParse(teamId).success) redirect(`/painel/corridas/${raceId}?secao=teams&erro=validacao`);
  const { error } = await supabase.from("race_teams").delete().eq("race_id", raceId).eq("id", teamId);
  if (error) redirect(`/painel/corridas/${raceId}?secao=teams&erro=team`);
  revalidatePath(`/painel/corridas/${raceId}`);
}

export async function createCoupon(formData: FormData) {
  const { supabase } = await requireOrganizer();
  const discountType = formString(formData, "discountType");
  const rawDiscount = formString(formData, "discountValue");
  const parsed = couponSchema.safeParse({
    raceId: formString(formData, "raceId"),
    code: formString(formData, "code"),
    discountType,
    discountValue: discountType === "fixed" ? moneyToCents(rawDiscount) : Number(rawDiscount),
    usageLimit: formString(formData, "usageLimit"),
    teamIds: formStringArray(formData, "teamIds"),
  });
  if (
    !parsed.success ||
    (parsed.data?.discountType === "percentage" && parsed.data.discountValue > 100)
  ) {
    redirect(`/painel/corridas/${formString(formData, "raceId")}?erro=validacao`);
  }

  const { error } = await supabase.rpc("create_race_coupon", {
    p_race_id: parsed.data.raceId,
    p_code: parsed.data.code,
    p_discount_type: parsed.data.discountType,
    p_discount_value: parsed.data.discountValue,
    p_usage_limit: parsed.data.usageLimit === "" ? null : parsed.data.usageLimit ?? null,
    p_team_ids: parsed.data.teamIds,
  });
  if (error) redirect(`/painel/corridas/${parsed.data.raceId}?erro=salvar`);
  revalidatePath(`/painel/corridas/${parsed.data.raceId}`);
}

export async function updateCoupon(formData: FormData) {
  const { supabase } = await requireOrganizer();
  const raceId = formString(formData, "raceId");
  const discountType = formString(formData, "discountType");
  const rawDiscount = formString(formData, "discountValue");
  const parsed = couponSchema.safeParse({
    raceId,
    code: formString(formData, "code"),
    discountType,
    discountValue: discountType === "fixed" ? moneyToCents(rawDiscount) : Number(rawDiscount),
    usageLimit: formString(formData, "usageLimit"),
    teamIds: formStringArray(formData, "teamIds"),
  });
  const couponId = formString(formData, "couponId");
  if (!parsed.success || (parsed.data.discountType === "percentage" && parsed.data.discountValue > 100) || !z.string().uuid().safeParse(couponId).success) {
    redirect(`/painel/corridas/${raceId}?secao=coupons&erro=validacao`);
  }
  const { error } = await supabase.rpc("update_race_coupon", {
    p_coupon_id: couponId,
    p_race_id: parsed.data.raceId,
    p_code: parsed.data.code,
    p_discount_type: parsed.data.discountType,
    p_discount_value: parsed.data.discountValue,
    p_usage_limit: parsed.data.usageLimit === "" ? null : parsed.data.usageLimit ?? null,
    p_team_ids: parsed.data.teamIds,
  });
  if (error) redirect(`/painel/corridas/${raceId}?secao=coupons&erro=coupon`);
  revalidatePath(`/painel/corridas/${raceId}`);
}

export async function deleteCoupon(formData: FormData) {
  const { supabase } = await requireOrganizer();
  const raceId = formString(formData, "raceId");
  const couponId = formString(formData, "couponId");
  if (!z.string().uuid().safeParse(raceId).success || !z.string().uuid().safeParse(couponId).success) redirect(`/painel/corridas/${raceId}?secao=coupons&erro=validacao`);
  const { error } = await supabase.from("race_coupons").delete().eq("race_id", raceId).eq("id", couponId);
  if (error) redirect(`/painel/corridas/${raceId}?secao=coupons&erro=coupon`);
  revalidatePath(`/painel/corridas/${raceId}`);
}

export async function createCourtesyRule(formData: FormData) {
  const { supabase } = await requireOrganizer();
  const parsed = courtesyRuleSchema.safeParse({
    raceId: formString(formData, "raceId"),
    teamId: formString(formData, "teamId"),
    couponId: formString(formData, "couponId"),
    paidEntriesRequired: formString(formData, "paidEntriesRequired"),
    maximumCourtesies: formString(formData, "maximumCourtesies"),
  });
  if (!parsed.success) redirect(`/painel/corridas/${formString(formData, "raceId")}?erro=validacao`);

  const { error } = await supabase.rpc("create_courtesy_rule", {
    p_race_id: parsed.data.raceId,
    p_team_id: parsed.data.teamId,
    p_coupon_id: parsed.data.couponId,
    p_paid_entries_required: parsed.data.paidEntriesRequired,
    p_maximum_courtesies: parsed.data.maximumCourtesies,
  });
  if (error) redirect(`/painel/corridas/${parsed.data.raceId}?erro=regra`);
  revalidatePath(`/painel/corridas/${parsed.data.raceId}`);
}

export async function grantCourtesy(formData: FormData) {
  const { supabase } = await requireOrganizer();
  const raceId = formString(formData, "raceId");
  if (formData.get("privacyConsent") !== "on") {
    redirect(`/painel/corridas/${raceId}?erro=consentimento`);
  }
  const { error } = await supabase.rpc("grant_courtesy", {
    p_rule_id: formString(formData, "ruleId"),
    p_category_id: formString(formData, "categoryId"),
    p_participant_name: formString(formData, "participantName"),
    p_participant_email: formString(formData, "participantEmail"),
    p_privacy_policy_version: getPrivacyPolicyVersion(),
  });
  if (error) redirect(`/painel/corridas/${raceId}?erro=cortesia`);
  revalidatePath(`/painel/corridas/${raceId}`);
}
