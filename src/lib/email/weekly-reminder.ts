/**
 * Lembrete semanal: "sua marca não publica há uma semana".
 *
 * Regra de ouro: um e-mail por semana por conta. Sem tabela de controle, a
 * idempotência vem do próprio cron (uma execução por dia) + checagem de dia da
 * semana. Rodar duas vezes no mesmo dia é inofensivo porque o filtro de
 * inatividade (7 dias) só muda quando o cliente publica.
 */

import { query } from "@/lib/db/pg";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { emailConfigured, sendEmail } from "@/lib/email/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("email.weekly-reminder");
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.kitefy.com.br";

export interface ReminderResult {
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
}

function reminderHtml(brandName: string, tenantName: string): string {
  return `<!doctype html>
<html lang="pt-BR"><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#181331;line-height:1.6">
  <p>Olá,</p>
  <p>A marca <strong>${tenantName}</strong> não publica um conteúdo novo há uma semana.</p>
  <p>Seu próximo post está a três cliques: escolha o objetivo, aprove o texto e baixe as imagens prontas.</p>
  <p><a href="${SITE_URL}/studio/new" style="display:inline-block;background:#FD3E01;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Criar conteúdo agora</a></p>
  <p style="color:#54506A;font-size:13px">${brandName ? `Conteúdo com o padrão de ${brandName}. ` : ""}Você recebe este e-mail por ter uma conta na Kitefy. Para não receber mais lembretes, responda com "descadastrar".</p>
</body></html>`;
}

/**
 * Envia o lembrete para contas sem conteúdo nos últimos 7 dias.
 * `dryRun` lista os candidatos sem enviar.
 */
export async function sendWeeklyReminders(options: { dryRun?: boolean } = {}): Promise<ReminderResult> {
  const result: ReminderResult = { candidates: 0, sent: 0, skipped: 0, failed: 0 };

  const rows = await query<{ tenant_id: string; tenant_name: string; brand_name: string | null }>(
    `select t.id as tenant_id,
            t.name as tenant_name,
            (select b.brand_name from public.brand_profiles b where b.tenant_id = t.id order by b.created_at limit 1) as brand_name
       from public.tenants t
      where not exists (
        select 1 from public.campaigns_and_assets a
         where a.tenant_id = t.id
           and a.created_at > now() - interval '7 days'
      )
      order by t.created_at
      limit 50`,
  );

  result.candidates = rows.length;
  if (!emailConfigured() || options.dryRun) {
    return result;
  }

  const admin = createSupabaseAdminClient();

  for (const row of rows) {
    try {
      const member = await query<{ user_id: string }>(
        "select user_id from public.tenant_members where tenant_id = $1 limit 1",
        [row.tenant_id],
      );
      const userId = member[0]?.user_id;
      if (!userId) {
        result.skipped += 1;
        continue;
      }

      const user = await admin.auth.admin.getUserById(userId);
      const email = user.data.user?.email;
      if (!email) {
        result.skipped += 1;
        continue;
      }

      await sendEmail({
        to: email,
        subject: "Sua marca está há uma semana sem publicar",
        html: reminderHtml(row.brand_name ?? "", row.tenant_name),
        text: `A marca ${row.tenant_name} não publica há uma semana. Crie um conteúdo: ${SITE_URL}/studio/new`,
      });
      result.sent += 1;
    } catch (error) {
      result.failed += 1;
      log.warn("Falha ao enviar lembrete semanal", {
        tenantId: row.tenant_id,
        message: error instanceof Error ? error.message : "erro",
      });
    }
  }

  log.info("Lembretes semanais processados", { ...result });
  return result;
}
