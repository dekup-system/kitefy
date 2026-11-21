# Dependências e licenças

Auditoria executável: `npm run verify:licenses` (falha o CI se encontrar AGPL/SSPL/GPL forte ou
os pacotes proibidos).

Resultado atual: **APROVADO** — 0 pacotes proibidos, 0 licença copyleft forte.

---

## 1. Regra do projeto

| Item | Exigência | Situação |
| --- | --- | --- |
| Núcleo do agente | open-source MIT | `@langchain/langgraph` 1.7.5 — **MIT** ✅ |
| Proibido | Postiz (AGPL-3.0), Mastra `ee/`, SaaS de observabilidade obrigatório | nenhum presente ✅ |
| Copyleft forte | AGPL, SSPL, GPL-2/3, BUSL | nenhum ✅ |
| MPL-2.0 | permitido como dependência (copyleft fraco, arquivo) | `satori`, `@resvg/resvg-js` ✅ |
| Licença não declarada | exige verificação manual | `mercadopago` (ver §4) |

---

## 2. Dependências diretas de runtime

| Pacote | Versão | Licença | Papel |
| --- | --- | --- | --- |
| next | 16.4.6 | MIT | framework |
| react / react-dom | 19.3.1 | MIT | UI |
| @supabase/supabase-js | 2.119.2 | MIT | dados/auth/storage |
| @supabase/ssr | 0.12.7 | MIT | sessão SSR |
| @langchain/langgraph | 1.7.5 | **MIT** | orquestração (núcleo) |
| @langchain/langgraph-checkpoint-postgres | 1.1.4 | MIT | checkpoints |
| @langchain/core | 1.5.0 | MIT | base |
| ai | 7.0.179 | Apache-2.0 | streaming/estruturado |
| @ai-sdk/react · anthropic · google · openai | 4.0.x | Apache-2.0 | providers |
| zod | 4.6.7 | MIT | validação |
| satori | 0.63.2 | **MPL-2.0** | SVG de slides |
| @resvg/resvg-js | 2.6.2 | **MPL-2.0** | SVG → PNG |
| sharp | 0.35.5 | Apache-2.0 | JPEG/sRGB |
| mercadopago | 3.6.2 | **não declarada** (§4) | pagamentos |
| pg | 8.23.1 | MIT | pool Postgres |
| csv-parse | 7.0.3 | MIT | importação |
| tailwindcss | 4.3.5 | MIT | estilo |
| @radix-ui/* | 1.x–2.x | MIT | primitivas a11y |
| class-variance-authority | 0.7.1 | Apache-2.0 | variantes |
| clsx / tailwind-merge | 2.1.1 / 3.7.1 | MIT | composição de classes |
| cmdk | 1.1.1 | MIT | busca Cmd+K |
| lucide-react | 1.77.0 | ISC | ícones |
| sonner | 2.0.8 | MIT | toasts |
| next-themes | 0.4.6 | MIT | tema |
| geist | 1.9.2 | SIL OFL 1.1 | fontes |
| tw-animate-css | 1.4.0 | MIT | animações |
| date-fns | 4.4.0 | MIT | datas |

## 3. Dependências de desenvolvimento

| Pacote | Licença | Papel |
| --- | --- | --- |
| typescript | Apache-2.0 | tipagem |
| vitest / @vitest/coverage-v8 | MIT | testes |
| @electric-sql/pglite | Apache-2.0 | Postgres em WASM (testes sem Docker) |
| @electric-sql/pglite-pgvector | Apache-2.0 | pgvector 0.8.7 no harness |
| tsx | MIT | scripts |
| eslint / eslint-config-next | MIT | lint |
| @tailwindcss/postcss / typography | MIT | build de CSS |
| dotenv | BSD-2-Clause | carga de env em scripts |

---

## 4. Exceções documentadas

### 4.1 `mercadopago@3.6.2` — campo `license` ausente no `package.json`

- **Situação**: o pacote oficial do Mercado Pago não declara `license` no `package.json`, então
  qualquer varredura automática o classifica como “não declarado”.
- **Risco**: baixo — é o SDK oficial exigido pelo spec, distribuído pelo próprio adquirente.
- **Ação antes do go-live**: confirmar a licença no repositório
  `github.com/mercadopago/sdk-nodejs` e arquivar a evidência com o jurídico.
- **Mitigação de acoplamento**: toda a integração está isolada em `src/lib/billing/mercadopago.ts`;
  trocar de SDK exige mudar um arquivo.

### 4.2 `@img/sharp-*` — binários nativos `Apache-2.0 AND LGPL-3.0-or-later`

- **Situação**: o `sharp` traz binários de plataforma (`libvips`) sob LGPL-3.0-or-later.
- **Por que é aceitável**: LGPL é copyleft fraco; usamos como módulo separado, sem modificar nem
  distribuir derivado estático do nosso código. Nada do BrandPulse passa a ser LGPL.
- **Regra no script**: o regex `(?<!L)GPL-[23]` reprova GPL-2/3 mas libera LGPL; AGPL/SSPL/BUSL
  continuam reprovados.
- **Alternativa** se o jurídico exigir: substituir `sharp` pela conversão JPEG nativa do
  `@resvg/resvg-js` (perde `mozjpeg`, mantém PNG/JPEG sRGB).

### 4.3 `satori` e `@resvg/resvg-js` — MPL-2.0

- Copyleft fraco **por arquivo**: usamos as bibliotecas sem alterar seus arquivos.
- Nenhuma obrigação de abrir o código do BrandPulse; basta preservar avisos de licença na
  distribuição de binários — o `package-lock.json` já registra origem e versão.

---

## 5. O que **não** entrou (e por quê)

| Candidato | Motivo da recusa |
| --- | --- |
| Postiz | AGPL-3.0 (proibido pelo spec) |
| Mastra | módulos `ee/` proprietários no core do agente |
| Langfuse/Helicone obrigatórios | SaaS proprietário como dependência rígida |
| `archiver` / `jszip` | evitado: escritor ZIP próprio com `node:zlib` (menos licença para auditar) |
| `pgmq` (pacote npm) | evitado: a fila é usada via SQL da extensão, sem wrapper de terceiros |
| libs de TTS/avatar/lip-sync | proibidas pelo produto |

---

## 6. Como reauditar

```bash
npm run verify:licenses
```

O script percorre dependências diretas **e** transitivas, imprime a tabela, aponta pacotes sem
licença declarada e os quatro requisitos do spec (LangGraph MIT, Next MIT, AI SDK Apache-2.0,
Satori MPL-2.0). Exit code ≠ 0 bloqueia o merge no CI.
