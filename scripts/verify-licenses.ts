/**
 * Auditoria de licenças das dependências.
 *
 * Regra do projeto:
 *  - núcleo do agente DEVE ser MIT (LangGraph.js). Postiz/AGPL e módulos
 *    proprietários (Mastra ee/) são proibidos.
 *  - dependências com licença copyleft forte (AGPL/GPL/SSPL) reprovam a entrega.
 *
 * Uso: npm run verify:licenses
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

interface PackageInfo {
  name: string;
  version: string;
  license: string;
  dev: boolean;
}

const FORBIDDEN_PACKAGES = ["postiz", "@mastra/ee", "mastra-ee"];
// Copyleft FORTE reprova. LGPL é aceitável para binários nativos (sharp/libvips)
// desde que permaneçam módulos separados, sem alteração do nosso código.
const DENY_LICENSE = /AGPL|SSPL|BUSL|Commons-Clause|UNLICENSED|(?<!L)GPL-[23]/i;
const ALLOW_LICENSE = /^(MIT|ISC|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|MPL-2\.0|0BSD|Unlicense|SIL OFL 1\.1|SIL OPEN FONT LICENSE|CC0-1\.0|BlueOak-1\.0\.0|Python-2\.0)$/i;

function readPackageJson(dir: string): Record<string, unknown> | null {
  const file = join(dir, "package.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function walkNodeModules(root: string, dev: boolean, out: PackageInfo[]): void {
  const modulesDir = join(root, "node_modules");
  if (!existsSync(modulesDir)) return;

  for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;

    const fullPath = join(modulesDir, entry.name);

    if (entry.name.startsWith("@")) {
      for (const scoped of readdirSync(fullPath, { withFileTypes: true })) {
        if (!scoped.isDirectory()) continue;
        collect(join(fullPath, scoped.name), dev, out);
      }
      continue;
    }

    collect(fullPath, dev, out);
  }
}

function collect(pkgDir: string, dev: boolean, out: PackageInfo[]): void {
  const pkg = readPackageJson(pkgDir);
  if (!pkg) return;
  const license =
    typeof pkg.license === "string"
      ? pkg.license
      : Array.isArray(pkg.licenses)
        ? (pkg.licenses as { type?: string }[]).map((l) => l.type).filter(Boolean).join(" OR ")
        : "(não declarada)";

  out.push({
    name: String(pkg.name ?? "(sem nome)"),
    version: String(pkg.version ?? "0.0.0"),
    license,
    dev,
  });

  // Dependências aninhadas (npm dedupa a maioria, mas não todas).
  walkNodeModules(pkgDir, dev, out);
}

function main(): void {
  const rootPkg = readPackageJson(process.cwd());
  if (!rootPkg) {
    console.error("package.json não encontrado.");
    process.exitCode = 1;
    return;
  }

  const dependencies = Object.keys((rootPkg.dependencies as Record<string, string>) ?? {});
  const packages: PackageInfo[] = [];

  for (const name of dependencies) {
    const dir = join(process.cwd(), "node_modules", ...name.split("/"));
    const pkg = readPackageJson(dir);
    if (!pkg) {
      console.warn(`! dependência direta não instalada: ${name}`);
      continue;
    }
    const license = typeof pkg.license === "string" ? pkg.license : "(não declarada)";
    packages.push({ name, version: String(pkg.version ?? "?"), license, dev: false });
  }

  // Transitivas: apenas para detectar licenças proibidas.
  const transitive: PackageInfo[] = [];
  walkNodeModules(process.cwd(), false, transitive);

  const forbiddenFound: string[] = [];
  const deniedLicenses: PackageInfo[] = [];
  const unknown: PackageInfo[] = [];

  for (const pkg of [...packages, ...transitive]) {
    if (FORBIDDEN_PACKAGES.some((forbidden) => pkg.name === forbidden || pkg.name.startsWith(`${forbidden}/`))) {
      forbiddenFound.push(`${pkg.name}@${pkg.version}`);
    }
    if (pkg.license === "(não declarada)") {
      if (!unknown.some((u) => u.name === pkg.name)) unknown.push(pkg);
      continue;
    }
    if (DENY_LICENSE.test(pkg.license) && !ALLOW_LICENSE.test(pkg.license)) {
      if (!deniedLicenses.some((d) => d.name === pkg.name)) deniedLicenses.push(pkg);
    }
  }

  console.log("\n=== Dependências diretas (runtime) ===");
  const width = Math.max(...packages.map((p) => p.name.length), 10);
  for (const pkg of packages.sort((a, b) => a.name.localeCompare(b.name))) {
    const ok = ALLOW_LICENSE.test(pkg.license) ? "OK " : DENY_LICENSE.test(pkg.license) ? "!! " : "?  ";
    console.log(`${ok}${pkg.name.padEnd(width)} ${pkg.version.padEnd(10)} ${pkg.license}`);
  }

  console.log("\n=== Suspeitas ===");
  console.log(`Pacotes proibidos encontrados: ${forbiddenFound.length === 0 ? "nenhum" : forbiddenFound.join(", ")}`);
  console.log(`Licenças copyleft fortes: ${deniedLicenses.length === 0 ? "nenhuma" : deniedLicenses.map((p) => `${p.name}@${p.version} (${p.license})`).join(", ")}`);
  console.log(`Licença não declarada: ${unknown.length === 0 ? "nenhuma" : unknown.map((p) => p.name).join(", ")}`);

  // Verificações obrigatórias do spec.
  const required = [
    { name: "@langchain/langgraph", license: "MIT", reason: "núcleo do agente deve ser MIT" },
    { name: "next", license: "MIT", reason: "framework" },
    { name: "ai", license: "Apache-2.0", reason: "streaming" },
    { name: "satori", license: "MPL-2.0", reason: "render (copyleft fraco, permitido como dependência)" },
  ];

  let failed = forbiddenFound.length > 0 || deniedLicenses.length > 0;

  console.log("\n=== Requisitos do spec ===");
  for (const req of required) {
    const found = packages.find((pkg) => pkg.name === req.name);
    if (!found) {
      console.log(`!! ${req.name} ausente (${req.reason})`);
      failed = true;
      continue;
    }
    const match = found.license.toLowerCase() === req.license.toLowerCase();
    console.log(`${match ? "OK" : "!!"} ${req.name}: ${found.license} (esperado ${req.license}) — ${req.reason}`);
    if (!match) failed = true;
  }

  if (unknown.length > 0) {
    console.warn(
      `\nAtenção: ${unknown.length} pacote(s) sem campo license no package.json. Confirme manualmente antes do go-live.`,
    );
  }

  if (failed) {
    console.error("\nREPROVADO: ajuste as licenças antes de entregar.");
    process.exitCode = 1;
    return;
  }

  console.log("\nAPROVADO: licenças compatíveis com a política do projeto.");
}

main();
