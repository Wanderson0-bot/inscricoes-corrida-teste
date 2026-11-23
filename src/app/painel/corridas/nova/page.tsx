import Link from "next/link";
import { connection } from "next/server";
import { createRace } from "@/app/actions";
import { requireOrganizer } from "@/lib/auth";

export const instant = false;

export default async function NewRacePage({ searchParams }: PageProps<"/painel/corridas/nova">) {
  await connection();
  await requireOrganizer();
  const query = await searchParams;
  return (
    <main className="container narrow-page">
      <Link className="back-link" href="/painel">← Painel</Link>
      <div className="auth-card">
        <p className="eyebrow">Nova corrida</p>
        <h1>Vamos dar a largada.</h1>
        {query?.erro && <p className="error-message" role="alert">
          {query.erro === "imagem-invalida"
            ? "A imagem precisa ser JPG, PNG ou WebP e ter no máximo 5 MB."
            : "Não foi possível salvar. Confira os campos e tente um endereço (slug) diferente."}
        </p>}
        <form action={createRace} className="form-grid" encType="multipart/form-data">
          <label>Nome da corrida<input name="name" placeholder="Ex.: Nome da corrida" required minLength={2} maxLength={160} /></label>
          <label>Endereço público (slug)<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="nome-da-corrida" /></label>
          <label>Data e horário<input name="startsAt" type="datetime-local" required /></label>
          <label>Local<input name="location" maxLength={240} placeholder="Ex.: Cidade, UF" /></label>
          <label>Imagem de capa (JPG, PNG ou WebP; até 5 MB)<input name="coverImage" type="file" accept="image/jpeg,image/png,image/webp" /></label>
          <label>Descrição<textarea name="description" rows={4} placeholder="Conte o que os participantes precisam saber sobre a corrida." maxLength={4000} /></label>
          <label className="check-label">
            <input name="published" type="checkbox" />
            <span>Publicar a página da corrida</span>
          </label>
          <button className="button button-primary">Criar corrida</button>
        </form>
      </div>
    </main>
  );
}
