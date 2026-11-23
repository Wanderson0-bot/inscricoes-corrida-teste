import { requireOrganizer } from "@/lib/auth";

type ExportType = "inscricoes" | "pagamentos" | "cortesias";

function first<T>(value: T[] | T | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function escapeCsv(value: unknown) {
  const raw = value == null ? "" : String(value);
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvResponse(filename: string, rows: string[][]) {
  const csv = ["\uFEFF" + rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")].join("");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(request: Request) {
  const { supabase } = await requireOrganizer();
  const url = new URL(request.url);
  const raceId = url.searchParams.get("corrida");
  const rawType = url.searchParams.get("tipo");
  const type: ExportType | null =
    rawType === "inscricoes" || rawType === "pagamentos" || rawType === "cortesias"
      ? rawType
      : null;
  if (!raceId || !["inscricoes", "pagamentos", "cortesias"].includes(type ?? "")) {
    return Response.json({ error: "Informe uma corrida e um tipo de exportação válido." }, { status: 400 });
  }

  if (type === "inscricoes") {
    const { data, error } = await supabase
      .from("registrations")
      .select("id, participant_name, participant_email, participant_phone, amount_cents, status, created_at, race_categories(name), race_teams(name), race_coupons(code)")
      .eq("race_id", raceId)
      .order("created_at", { ascending: false });
    if (error) return Response.json({ error: "Não foi possível exportar inscrições." }, { status: 500 });
    const rows = [
      ["Código", "Participante", "E-mail", "Telefone", "Categoria", "Equipe", "Cupom", "Valor (R$)", "Status", "Criada em"],
      ...(data ?? []).map((row) => [
        row.id,
        row.participant_name,
        row.participant_email,
        row.participant_phone,
        first(row.race_categories)?.name ?? "",
        first(row.race_teams)?.name ?? "",
        first(row.race_coupons)?.code ?? "",
        (row.amount_cents / 100).toFixed(2),
        row.status,
        row.created_at,
      ]),
    ];
    return csvResponse("inscricoes.csv", rows);
  }

  if (type === "pagamentos") {
    const { data, error } = await supabase
      .from("payments")
      .select("provider, provider_payment_id, status, amount_cents, status_detail, updated_at, registrations!inner(id, participant_name, participant_email, race_id)")
      .eq("registrations.race_id", raceId)
      .order("updated_at", { ascending: false });
    if (error) return Response.json({ error: "Não foi possível exportar pagamentos." }, { status: 500 });
    const rows = [
      ["Gateway", "Pagamento", "Inscrição", "Participante", "E-mail", "Valor (R$)", "Status", "Detalhe", "Atualizado em"],
      ...(data ?? []).map((row) => {
        const registration = first(row.registrations);
        return [
          row.provider === "pagarme" ? "Pagar.me (histórico)" : "Safe2Pay",
          row.provider_payment_id ?? "",
          registration?.id ?? "",
          registration?.participant_name ?? "",
          registration?.participant_email ?? "",
          (row.amount_cents / 100).toFixed(2),
          row.status,
          row.status_detail ?? "",
          row.updated_at,
        ];
      }),
    ];
    return csvResponse("pagamentos.csv", rows);
  }

  const { data, error } = await supabase
    .from("registrations")
    .select("id, participant_name, participant_email, created_at, race_categories(name), race_teams(name), race_coupons(code)")
    .eq("race_id", raceId)
    .eq("status", "courtesy")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: "Não foi possível exportar cortesias." }, { status: 500 });
  const rows = [
    ["Inscrição", "Participante", "E-mail", "Categoria", "Equipe", "Cupom", "Concedida em"],
    ...(data ?? []).map((row) => [
      row.id,
      row.participant_name,
      row.participant_email,
      first(row.race_categories)?.name ?? "",
      first(row.race_teams)?.name ?? "",
      first(row.race_coupons)?.code ?? "",
      row.created_at,
    ]),
  ];
  return csvResponse("cortesias.csv", rows);
}
