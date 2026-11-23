import PanelSidebar from "@/app/painel/panel-sidebar";

export default function OrganizerPanelLayout({ children }: LayoutProps<"/painel">) {
  return (
    <div className="panel-layout">
      <PanelSidebar />
      <div className="panel-main">{children}</div>
    </div>
  );
}
