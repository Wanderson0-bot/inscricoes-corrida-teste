import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requirePlatformAdmin();
  return (
    <div className="panel-layout">
      <aside className="panel-sidebar">
        <Link className="brand" href="/" aria-label="Let'sRun - início">
          <span>Let&apos;s<span className="brand-dot">Run</span></span>
        </Link>
        <p className="panel-sidebar-label">Administração</p>
        <nav aria-label="Navegação administrativa">
          <Link href="/admin/financeiro" aria-current="page"><span aria-hidden="true">▤</span> Financeiro</Link>
        </nav>
      </aside>
      <div className="panel-main">{children}</div>
    </div>
  );
}
