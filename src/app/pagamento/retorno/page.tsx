import Link from "next/link";

export const instant = false;

export default async function PaymentReturnPage({ searchParams }: PageProps<"/pagamento/retorno">) {
  const query = await searchParams;
  const isFreeRegistration = query.status === "gratuita";
  return (
    <main className="container narrow-page">
      <div className="auth-card">
        <p className="eyebrow">Inscrição</p>
        <h1>{isFreeRegistration ? "Inscrição registrada." : "Seu pagamento está sendo processado."}</h1>
        <p className="lede">
          {isFreeRegistration
            ? "O valor da inscrição ficou zerado e não há cobrança Pix."
            : "A inscrição será atualizada após a confirmação da Safe2Pay. Se você já pagou, aguarde alguns instantes."}
        </p>
        <Link className="button button-primary" href="/corridas">Voltar às corridas</Link>
      </div>
    </main>
  );
}
