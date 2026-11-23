import Link from "next/link";
import { signIn } from "@/app/actions";
import styles from "./sign-in.module.css";

export const instant = false;

export default async function SignInPage({ searchParams }: PageProps<"/entrar">) {
  const query = await searchParams;
  return (
    <main className={styles.screen}>
      <section className={styles.presentation} aria-label="Bem-vindo à área do organizador">
        <span className={styles.presentationBrand}><span aria-hidden="true">↗</span> Let&apos;s<span>Run</span></span>
        <div>
          <p className={styles.presentationEyebrow}>Área do organizador</p>
          <h1>Cada corrida começa com um novo desafio.</h1>
          <p>Gerencie suas atividades e acompanhe sua jornada no universo da corrida.</p>
        </div>
        <span className={styles.presentationOrnament} aria-hidden="true" />
      </section>
      <section className={styles.formArea}>
        <div className={styles.authCard}>
          <p className="eyebrow">Acesso seguro</p>
          <h2>Bem-vindo de volta!</h2>
          <p className={styles.subtitle}>Acesse sua conta para continuar.</p>
          {query?.erro && (
            <p className="error-message" role="alert">
              Não foi possível entrar. Confira seus dados ou fale com o administrador.
            </p>
          )}
          <form action={signIn} className="form-grid">
            <label>E-mail<input name="email" type="email" autoComplete="username" placeholder="Ex.: usuario@exemplo.com" required /></label>
            <label>Senha<input name="password" type="password" autoComplete="current-password" placeholder="Digite sua senha" required /></label>
            <button className={`button button-primary ${styles.submit}`}>Entrar</button>
          </form>
          <p className={styles.accountLink}>Ainda não tem cadastro? <Link href="/cadastro-organizador">Criar conta</Link></p>
        </div>
      </section>
    </main>
  );
}
