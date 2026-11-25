import Link from "next/link";
import { redirect } from "next/navigation";
import { completeOrganizerRegistration, signOut } from "@/app/actions";
import { getAuthenticatedProfile } from "@/lib/auth";
import styles from "../organizer-registration.module.css";

export const instant = false;

export default async function CompleteOrganizerRegistrationPage({
  searchParams,
}: PageProps<"/cadastro-organizador/concluir">) {
  const { user, profile } = await getAuthenticatedProfile();
  if (profile) {
    redirect(profile.role === "platform_admin" ? "/admin/financeiro" : "/painel");
  }

  const query = await searchParams;
  const savedName = user.user_metadata?.organization_name;
  const organizationName = typeof savedName === "string" && savedName.length <= 120 ? savedName : "";

  return (
    <main className={styles.formArea}>
      <div className={styles.authCard}>
        <h1>Conclua seu cadastro</h1>
        <p className={styles.description}>
          {user.email_confirmed_at
            ? "Informe o nome da sua organização para ativar o acesso ao painel."
            : "Confirme seu endereço de e-mail para continuar o cadastro."}
        </p>
        {query.erro && (
          <p className="error-message" role="alert">
            {query.erro === "validacao"
              ? "Confira o nome da organização e aceite a política de privacidade."
              : "Não foi possível ativar sua organização. Tente novamente."}
          </p>
        )}
        {user.email_confirmed_at && (
          <form action={completeOrganizerRegistration} className="form-grid">
            <label>
              Nome da organização
              <input name="organizationName" autoComplete="organization" defaultValue={organizationName} minLength={2} maxLength={120} required />
            </label>
            <label className="check-label">
              <input name="privacyConsent" type="checkbox" required />
              <span>Li e concordo com a <Link href="/privacidade">Política de Privacidade</Link>.</span>
            </label>
            <button className={`button button-primary ${styles.submit}`} type="submit">Concluir cadastro</button>
          </form>
        )}
        <form action={signOut} className={styles.accountLink}>
          <button className="button" type="submit">Sair</button>
        </form>
      </div>
    </main>
  );
}
