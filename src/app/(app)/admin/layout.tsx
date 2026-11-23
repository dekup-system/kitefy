import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { AdminNav } from "./admin-nav";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminPage } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Administração" };

/**
 * Shell do console administrativo.
 * A checagem acontece no servidor em TODA requisição; quem não tem a flag de
 * admin recebe 404 (não revela que a rota existe).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminPage();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Console administrativo"
        description="Contas, planos, cupons, receita e custo estimado de APIs. Acesso restrito e auditado."
        actions={
          <Badge variant="secondary" className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {session.user.email ?? "admin"}
          </Badge>
        }
      />
      <AdminNav />
      {children}
    </div>
  );
}
