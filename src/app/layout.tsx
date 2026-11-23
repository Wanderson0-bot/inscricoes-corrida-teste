import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import SiteNav from "@/app/site-nav";
import CookieConsent from "@/app/cookie-consent";
import "./globals.css";
import "./design-system.css";

export const metadata: Metadata = {
  title: {
    default: "Let'sRun",
    template: "%s | Let'sRun",
  },
  description: "Encontre corridas, faça sua inscrição e prepare-se para a largada.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="site-header">
          <div className="container header-inner">
            <Link className="brand" href="/" aria-label="Let'sRun - início">
              <span>Let&apos;s<span className="brand-dot">Run</span></span>
            </Link>
            <Suspense fallback={(
              <nav aria-label="Main navigation">
                <Link className="nav-organizer" href="/">In&#237;cio</Link>
                <Link className="nav-organizer" href="/entrar">Organizadores</Link>
                <Link className="button button-primary header-cta" href="/corridas">Inscreva-se</Link>
              </nav>
            )}>
              <SiteNav />
            </Suspense>
          </div>
        </header>
        <div className="site-content">{children}</div>
        <footer className="site-footer">
          <div className="container footer-inner">
            <Link className="brand footer-brand" href="/"><span>Let&apos;s<span className="brand-dot">Run</span></span></Link>
            <span>Feito para quem corre e para quem organiza.</span>
            <div className="footer-links">
              <Link href="/corridas">Corridas</Link>
              <Link href="/cadastro-organizador">Organizadores</Link>
              <Link href="/privacidade">Privacidade</Link>
              <Link href="/termos-de-uso">Termos de Uso</Link>
            </div>
          </div>
        </footer>
        <CookieConsent />
      </body>
    </html>
  );
}
