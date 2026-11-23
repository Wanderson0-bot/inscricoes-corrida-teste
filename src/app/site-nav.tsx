"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/app/actions";

export default function SiteNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const isOrganizerPanel = pathname.startsWith("/painel");

  function isCurrent(path: string) {
    const matches = path === "/"
      ? pathname === "/"
      : path === "/entrar"
        ? pathname === "/entrar" || pathname === "/cadastro-organizador"
        : pathname === path || pathname.startsWith(`${path}/`);
    return matches ? "page" : undefined;
  }

  if (isOrganizerPanel) {
    return (
      <nav aria-label="Sessão do organizador">
        <form action={signOut}>
          <button className="button button-primary header-cta" type="submit">Sair</button>
        </form>
      </nav>
    );
  }

  return (
    <>
      <nav className="desktop-nav" aria-label="Navegação principal">
        <Link className="nav-organizer" href="/" aria-current={isCurrent("/")}>Início</Link>
        <Link className="nav-organizer" href="/corridas" aria-current={isCurrent("/corridas")}>Corridas</Link>
        <Link className="nav-organizer" href="/entrar" aria-current={isCurrent("/entrar")}>Organizadores</Link>
        <Link className="button button-primary header-cta" href="/corridas">Inscreva-se</Link>
      </nav>
      <div className="mobile-nav">
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-label={menuOpen ? "Fechar menu de navegação" : "Abrir menu de navegação"}
          aria-expanded={menuOpen}
          aria-controls="mobile-primary-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          Menu
        </button>
        <nav id="mobile-primary-nav" className="mobile-nav-panel" aria-label="Navegação principal" hidden={!menuOpen}>
          <Link href="/" aria-current={isCurrent("/")} onClick={() => setMenuOpen(false)}>Início</Link>
          <Link href="/corridas" aria-current={isCurrent("/corridas")} onClick={() => setMenuOpen(false)}>Corridas</Link>
          <Link href="/entrar" aria-current={isCurrent("/entrar")} onClick={() => setMenuOpen(false)}>Organizadores</Link>
          <Link href="/cadastro-organizador" onClick={() => setMenuOpen(false)}>Criar conta de organizador</Link>
        </nav>
      </div>
    </>
  );
}
