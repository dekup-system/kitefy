/**
 * Cria (ou promove) uma conta de administrador da plataforma.
 *
 * Uso:
 *   npm run admin:create -- kitefy.flow@gmail.com
 *
 * O que faz:
 *  - garante o usuário no Supabase Auth (cria com senha aleatória se não existir);
 *  - grava `app_metadata.is_admin = true` (somente service_role consegue);
 *  - o trigger `handle_new_user` cria o tenant/membership do usuário no cadastro.
 *
 * A senha temporária aparece UMA vez no terminal e não é gravada em arquivo.
 * Troque-a no primeiro login (Minha conta > receber link de senha).
 */
import { randomInt } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";

function temporaryPassword(length = 24): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return value;
}

async function findUserByEmail(
  listUsers: (params: { page: number; perPage: number }) => Promise<{
    data: {
      users: { id: string; email?: string | null; app_metadata?: Record<string, unknown> }[];
    };
    error: { message: string } | null;
  }>,
  email: string,
) {
  const perPage = 200;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await listUsers({ page, perPage });
    if (error) throw new Error(`Falha ao listar usuários: ${error.message}`);

    const found = data.users.find(
      (user) => user.email?.trim().toLowerCase() === email.toLowerCase(),
    );
    if (found) return found;
    if (data.users.length < perPage) return null;
  }

  throw new Error("Muitos usuários para paginar; use o painel do Supabase para localizar o e-mail.");
}

async function main(): Promise<void> {
  const email = (process.argv[2] ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    console.error("Uso: npm run admin:create -- email@dominio.com");
    process.exitCode = 1;
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.");
    process.exitCode = 1;
    return;
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const existing = await findUserByEmail(
    (params) => admin.auth.admin.listUsers(params),
    email,
  );
  let userId: string;
  let created = false;
  let password: string | null = null;

  if (existing) {
    userId = existing.id;
    const { error } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...(existing.app_metadata ?? {}), is_admin: true },
    });
    if (error) throw new Error(`Falha ao promover usuário: ${error.message}`);
  } else {
    password = temporaryPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { is_admin: true },
      user_metadata: { brand_name: "Kitefy Admin" },
    });

    if (error || !data.user) {
      throw new Error(`Falha ao criar usuário: ${error?.message ?? "sem usuário"}`);
    }

    userId = data.user.id;
    created = true;
  }

  console.log("\nAdmin garantido com sucesso.");
  console.log(`  e-mail ....: ${email}`);
  console.log(`  user id ...: ${userId}`);
  console.log(`  situação ..: ${created ? "conta criada agora" : "conta existente promovida"}`);

  if (password) {
    console.log("\nSenha temporária (aparece só uma vez):");
    console.log(`  ${password}`);
    console.log("\nEntre em /login e troque a senha em Minha conta.");
  } else {
    console.log("\nA senha atual foi mantida. Se não souber, use 'Esqueci a senha' em /login.");
  }

  const { data: memberships, error: membershipsError } = await admin
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .limit(1);

  if (membershipsError) {
    console.warn(
      "\nAviso: não foi possível confirmar o tenant do admin " +
        `(${membershipsError.message}). Verifique se as migrations estão aplicadas.`,
    );
  } else if (!memberships || memberships.length === 0) {
    console.warn(
      "\nAviso: usuário sem tenant. O trigger handle_new_user pode não estar instalado; " +
        "rode o setup SQL e crie a conta novamente.",
    );
  } else {
    console.log(`  tenant ....: ${memberships[0]!.tenant_id}`);
  }
}

main().catch((error: unknown) => {
  console.error("\nFalha:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
