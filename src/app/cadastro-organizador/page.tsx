import Link from "next/link";
import { registerOrganizer } from "@/app/actions";
import styles from "./organizer-registration.module.css";

export const instant = false;

export default async function OrganizerRegistrationPage({
  searchParams,
}: PageProps<"/cadastro-organizador">) {
  const query = await searchParams;

  return (
    <main className={styles.screen}>
      <section className={styles.presentation}>
        <span className={styles.presentationBrand}><span aria-hidden="true">↗</span> Let&apos;s<span>Run</span></span>
        <div>
          <p className={styles.presentationEyebrow}>Quem faz acontecer</p>
          <h1>Transforme sua próxima ideia em uma corrida inesquecível.</h1>
          <p>Cadastre sua organização para publicar provas e acompanhar cada inscrição.</p>
        </div>
        <span className={styles.presentationOrnament} aria-hidden="true" />
      </section>
      <section className={styles.formArea}>
        <div className={styles.authCard}>
          <p className="eyebrow">Cadastro de organizador</p>
          <h2>Crie sua conta</h2>
          <p className={styles.description}>Faça parte de uma comunidade que vive a paixão pela corrida.</p>

          {query?.cadastro === "confirmar" && (
            <p className="notice" role="status">
              Enviamos um link de confirmação para seu e-mail. Confirme o endereço para ativar o acesso ao painel.
            </p>
          )}
          {query?.erro && (
            <p className="error-message" role="alert">
              {query.erro === "validacao"
                ? "Confira os dados e aceite a política de privacidade para continuar."
                : query.erro === "provisionamento"
                  ? "Sua conta foi criada, mas não conseguimos ativar a organização. Entre em contato com o suporte."
                  : "Não foi possível concluir o cadastro. Confira os dados ou tente entrar com uma conta existente."}
            </p>
          )}

          <form action={registerOrganizer} className="form-grid">
            <label>Nome da organização<input name="organizationName" type="text" autoComplete="organization" placeholder="Ex.: Nome da organização" minLength={2} maxLength={120} required /></label>
            <label>E-mail<input name="email" type="email" autoComplete="email" placeholder="Ex.: usuario@exemplo.com" maxLength={254} required /></label>
            <label>Senha<input name="password" type="password" autoComplete="new-password" placeholder="Mínimo de 8 caracteres" minLength={8} maxLength={128} required /></label>
            <label className="check-label">
              <input name="privacyConsent" type="checkbox" required />
              <span>Li e concordo com a <Link href="/privacidade">Política de Privacidade</Link>.</span>
            </label>
            <button className={`button button-primary ${styles.submit}`} type="submit">Criar cadastro</button>
          </form>

          <p className={styles.accountLink}>Já tem cadastro? <Link href="/entrar">Entrar</Link></p>
        </div>
      </section>
    </main>
  );
}
