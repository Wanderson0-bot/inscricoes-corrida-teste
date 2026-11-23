import { z } from "zod";
import { requireOrganizer } from "@/lib/auth";

function error(message: string, status = 400) { return Response.json({ error: message }, { status }); }
function cents(value: string) {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return Number.NaN;
  return Math.round(Number(value.replace(",", ".")) * 100);
}

export async function POST(request: Request, context: RouteContext<"/api/painel/corridas/[id]/cadastros/[kind]">) {
  const { supabase } = await requireOrganizer();
  const { id: raceId, kind } = await context.params;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return error("Revise os dados do formulário."); }

  if (kind === "category") {
    const parsed = z.object({ name: z.string().trim().min(1).max(100), price: z.string(), capacity: z.coerce.number().int().min(1).max(1_000_000) }).safeParse(body);
    const priceCents = parsed.success ? cents(parsed.data.price) : Number.NaN;
    if (!parsed.success || !Number.isSafeInteger(priceCents) || priceCents < 0 || priceCents > 100_000_000) return error("Informe o nome, preço e quantidade de vagas válidos.");
    const { error: insertError } = await supabase.from("race_categories").insert({ race_id: raceId, name: parsed.data.name, price_cents: priceCents, capacity: parsed.data.capacity });
    if (insertError) return error(insertError.code === "23505" ? "Já existe uma categoria com esse nome." : "Não foi possível adicionar a categoria. Confira as vagas informadas.", 409);
    return Response.json({ saved: true });
  }

  if (kind === "team") {
    const parsed = z.object({ name: z.string().trim().min(1).max(100) }).safeParse(body);
    if (!parsed.success) return error("Informe um nome de equipe válido.");
    const { error: insertError } = await supabase.from("race_teams").insert({ race_id: raceId, name: parsed.data.name });
    if (insertError) return error(insertError.code === "23505" ? "Já existe uma equipe com esse nome." : "Não foi possível adicionar a equipe.", 409);
    return Response.json({ saved: true });
  }

  if (kind === "coupon") {
    const parsed = z.object({
      code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,32}$/),
      discountType: z.enum(["percentage", "fixed"]),
      discountValue: z.string(),
      usageLimit: z.string().optional().default(""),
      teamIds: z.array(z.string().uuid()).default([]),
    }).safeParse(body);
    const discountValue = parsed.success
      ? parsed.data.discountType === "fixed" ? cents(parsed.data.discountValue) : Number(parsed.data.discountValue)
      : Number.NaN;
    const usageLimit = parsed.success && parsed.data.usageLimit ? Number(parsed.data.usageLimit) : null;
    if (!parsed.success || !Number.isInteger(discountValue) || discountValue < 1 || (parsed.data.discountType === "percentage" && discountValue > 100) || (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1))) return error("Revise o código, o desconto e o limite de usos.");
    const { error: couponError } = await supabase.rpc("create_race_coupon", {
      p_race_id: raceId,
      p_code: parsed.data.code,
      p_discount_type: parsed.data.discountType,
      p_discount_value: discountValue,
      p_usage_limit: usageLimit,
      p_team_ids: parsed.data.teamIds,
    });
    if (couponError) return error(couponError.code === "23505" ? "Já existe um cupom com esse código." : "Não foi possível criar o cupom. Confira equipes e limite de uso.", 409);
    return Response.json({ saved: true });
  }
  return error("Tipo de cadastro não reconhecido.", 404);
}
