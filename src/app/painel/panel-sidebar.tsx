"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PanelSidebar() {
  const pathname = usePathname();
  const isRaceListActive = pathname === "/painel" || (pathname.startsWith("/painel/corridas/") && pathname !== "/painel/corridas/nova");

  return (
    <aside className="panel-sidebar">
      <Link className="brand" href="/" aria-label="Let'sRun - início">
        <span>Let&apos;s<span className="brand-dot">Run</span></span>
      </Link>
      <p className="panel-sidebar-label">Área do organizador</p>
      <nav aria-label="Navegação do painel">
        <Link href="/painel" aria-current={isRaceListActive ? "page" : undefined}>
          <span aria-hidden="true">▦</span> Minhas corridas
        </Link>
        <Link href="/painel/recebimentos" aria-current={pathname === "/painel/recebimentos" ? "page" : undefined}>
          <span aria-hidden="true">＄</span> Recebimentos
        </Link>
        <Link href="/painel/corridas/nova" aria-current={pathname === "/painel/corridas/nova" ? "page" : undefined}>
          <span aria-hidden="true">＋</span> Criar corrida
        </Link>
      </nav>
      <p className="panel-help">Organize seus eventos em um só lugar.</p>
    </aside>
  );
}
