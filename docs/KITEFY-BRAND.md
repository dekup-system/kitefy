# Kitefy — identidade aplicada

Registro de como o manual cromático foi aplicado, **com as medições que justificam cada desvio**.
Nada aqui é opinião: todo número de contraste foi calculado com `src/lib/visual/tokens.ts`
(`contrastRatio` / `parseColor`) e pode ser reproduzido com `npx tsx scripts/inspect-brand.ts`.

---

## 1. Ativos recebidos

| Arquivo | Uso | Dimensão | Verificação |
| --- | --- | --- | --- |
| `public/brand/kitefy-logomarca-principal.png` | header, seções claras | 2184×882 | alpha 81,4% transparente; cores dominantes `#181331` e `#FE3E00` |
| `public/brand/kitefy-icone-site.png` | favicon, avatar, container escuro | 512×512 | alpha 75,6% transparente; mesmas cores |
| `src/app/icon.png` | favicon Next | 512×512 | gerado do ícone |
| `src/app/apple-icon.png` | iOS | 180×180 | gerado do ícone |
| `public/favicon-32.png` | aba do navegador | 32×32 | gerado do ícone |

As cores amostradas nos arquivos confirmam o manual (`#181331` e `#FD3E01`), então os tokens
usam exatamente os hex prescritos — sem reamostragem.

---

## 2. Tokens

Definidos em `src/app/globals.css` e expostos como utilitários Tailwind
(`bg-brand-navy`, `text-brand-signal`, …).

| Token | Valor | Onde usar |
| --- | --- | --- |
| `--brand-navy` | `#181331` | títulos, barra de navegação, seção de prova, rodapé |
| `--brand-navy-soft` | `#3B3752` | parágrafos |
| `--brand-signal` | `#FD3E01` | **somente** CTA, badge de destaque e métrica de crescimento |
| `--brand-signal-hover` | `#E03500` | hover do CTA |
| `--brand-signal-text` | `#C42D00` | *derivado* — texto pequeno laranja (badge) |
| `--brand-signal-tint` | `#FFF0EB` | fundo do badge "Mais escolhido" |
| `--brand-canvas` | `#F8F8FA` | fundo principal |
| `--brand-surface` | `#FFFFFF` | cards e modais |
| `--brand-subtle` | `#F0F0F5` | faixas alternadas |
| `--brand-border` | `#E4E4EC` | borda sutil de 1px (decorativa) |
| `--brand-text-muted` | `#6E6A85` | legendas grandes (≥18,66px semibold) |
| `--brand-text-muted-strong` | `#54506A` | *derivado* — legenda pequena com AAA |
| `--pack-start-tint` / `-border` | `#ECEBF5` / `#D5D3E6` | badge do pacote Start |
| `--pack-flow-tint` / `-text` / `-border` | `#E8F8F1` / `#0F766E` / `#BCEAD5` | badge do pacote Flow |

---

## 3. Proporção 60 / 30 / 10 aplicada

| Faixa | Superfície | Conteúdo |
| --- | --- | --- |
| 60% claro | `#F8F8FA` + `#FFFFFF` | hero, fatos, processo, pacotes, entregáveis, FAQ, CTA final |
| 30% escuro | `#181331` | seção "Por que o método vence" + rodapé |
| 10% laranja | `#FD3E01` | 3 CTAs sólidos, badge do Lift, setas de crescimento, filete da seção de problema |

Nenhuma seção longa usa laranja como fundo; nenhum parágrafo é laranja.

---

## 4. Logomarca

| Contexto | Regra aplicada |
| --- | --- |
| Header (fundo `#F8F8FA`) | lockup padrão, altura 40px (faixa do manual: 36–44) |
| Seção escura e rodapé (`#181331`) | ícone em container arredondado `#F8F8FA` + wordmark em `#FFFFFF` |
| Shell autenticado (tema claro/escuro) | troca por CSS: versão padrão no claro, versão de fundo escuro no escuro |
| Favicon / avatar | ícone 512×512 (derivados 180 e 32) |

Motivo: a faceta esquerda do ícone e a tipografia são `#181331`; sobre fundo `#181331` a versão
padrão desaparece. Por isso nunca há logo padrão sobre escuro.

---

## 5. Pacotes

| Pacote | Badge | Botão |
| --- | --- | --- |
| Kitefy Start | `#ECEBF5` / texto `#181331` / borda `#D5D3E6` | contorno `#181331` |
| Kitefy Lift (destaque) | `#FFF0EB` / texto `#C42D00` + borda `2px #FD3E01` | sólido `#FD3E01`, texto branco |
| Kitefy Flow | `#E8F8F1` / texto `#0F766E` / borda `#BCEAD5` | sólido `#181331`, texto branco |

O card destacado tem `border-2 #FD3E01` e elevação sutil (`0 18px 40px -24px rgba(253,62,1,.45)`);
os demais usam borda neutra e sombra mínima — Von Restorff aplicado por **um** elemento de
contraste, não por três.

---

## 6. Contraste medido (WCAG 2.1)

| Par | Proporção | Nível |
| --- | --- | --- |
| Títulos `#181331` / canvas `#F8F8FA` | **16,83:1** | AAA |
| Títulos `#181331` / branco | **17,85:1** | AAA |
| Corpo `#3B3752` / canvas | **10,68:1** | AAA |
| Corpo `#3B3752` / branco | **11,33:1** | AAA |
| Corpo `#3B3752` / subtle `#F0F0F5` | **9,97:1** | AAA |
| Branco / navy | **17,85:1** | AAA |
| Badge Start `#181331` / `#ECEBF5` | **15,10:1** | AAA |
| Muted `#6E6A85` / canvas | 4,87:1 | AA (e AAA para texto grande, ≥4,5) |
| Muted forte `#54506A` / canvas | **7,25:1** | AAA |
| Badge Lift `#C42D00` / `#FFF0EB` | 5,08:1 | AA |
| Badge Flow `#0F766E` / `#E8F8F1` | 4,99:1 | AA |
| Branco / `#FD3E01` (CTA) | 3,58:1 | AA **apenas como texto grande** |
| Branco / `#E03500` (hover) | 4,49:1 | AA (limite) |
| `#FD3E01` / navy (setas sobre escuro) | 4,99:1 | AA |
| Borda `#E4E4EC` / canvas | 1,19:1 | decorativa (não é limite de controle) |
| Borda de input `#8F8BA3` / canvas | **3,10:1** | AA (1.4.11) |

### Conclusão honesta sobre "AAA"

A paleta **permite AAA em todo texto de leitura** (títulos, corpo, links, botões navy).
Ela **não permite AAA** em dois pares que o próprio manual fixa:

1. **Branco sobre `#FD3E01` = 3,58:1.** Nenhum ajuste de tom mantendo `#FD3E01` chega a 7:1.
2. **Texto pequeno laranja sobre `#FFF0EB` = 3,22:1 com `#FD3E01`.**

---

## 7. Desvios e por quê

| Desvio | Original | Aplicado | Justificativa |
| --- | --- | --- | --- |
| Texto do badge "Mais escolhido" | `#FD3E01` | `#C42D00` (5,08:1) | em 12px, `#FD3E01` reprova em AA; o laranja permanece na borda, no CTA e no ponto do badge |
| Rótulo de CTA sólido | genérico | 19px / peso 600 | branco sobre `#FD3E01` só é conforme como **texto grande** (≥18,66px semibold). Em 15–16px reprovaria |
| Botões pequenos (header e Flow) | — | navy sólido ou contorno | evita branco-sobre-laranja em tamanho pequeno; laranja fica reservado aos CTAs de conversão |
| Borda de input | `#E4E4EC` | `#8F8BA3` | `#E4E4EC` a 1,19:1 não delimita controle (WCAG 1.4.11 exige 3:1) |
| Legendas pequenas | `#6E6A85` | `#54506A` | `#6E6A85` a 4,87:1 é AA, não AAA; o tom forte chega a 7,25:1 sem mudar a família |
| Páginas públicas | tema do SO | **sempre claras** | o manual é uma identidade clara; em modo escuro do SO os títulos navy desapareciam. A aplicação autenticada mantém claro/escuro |

Nenhum desvio altera a percepção de marca: laranja continua sendo sinal de ação, navy continua
sendo a âncora, e a proporção 60/30/10 é preservada.

---

## 8. Como usar

```tsx
import { KitefyLogo } from "@/components/brand/kitefy-logo";

<KitefyLogo height={40} />                       {/* fundo claro */}
<KitefyLogo variant="onDark" height={36} />       {/* fundo #181331 */}
```

```tsx
// CTA de conversão (laranja, rótulo 19px/600)
<Link href="/login" className="kitefy-cta">Começar agora <ArrowRight /></Link>

// Ação secundária compacta (navy)
<Link href="#pacotes" className="kitefy-cta-compact">Escolher pacote</Link>

// Etiqueta editorial
<p className="kitefy-eyebrow">Pacotes</p>

// Filete de seção (laranja, 2px)
<div className="kitefy-rule" />
```

Pacotes: `src/lib/marketing/packages.ts` (fonte única de preço/créditos, derivada de `PLANS`) +
`src/components/marketing/package-card.tsx`.

---

## 9. QA visual executado

| Verificação | Como | Resultado |
| --- | --- | --- |
| Overflow horizontal em 430px | CDP `Runtime.evaluate` medindo `scrollWidth` e elementos fora do viewport | `docWidth = 430`, 0 infratores |
| Desktop 1440px (página inteira) | screenshot CDP | seções, pacotes, FAQ, CTA e rodapé conferidos |
| Mobile 430px (página inteira, 9.167px) | screenshot CDP com viewport emulado | empilhamento correto, sem corte |
| Modo escuro do SO na LP | screenshot CDP com `prefers-color-scheme: dark` | página permanece clara (marca preservada) |
| Build / tipos / lint | `npm run build`, `tsc --noEmit`, `eslint .` | 0 erros |

Capturas em `artifacts/shots/` (`cdp-mobile.png`, `dark2-top.png`, `landing-full.png`,
`pricing.png`).
