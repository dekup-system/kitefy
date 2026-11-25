# Biblioteca Científica Publicitária, Agente Orquestrador & Arquitetura Kitefy v3

**Versão:** `advertising-library-v2`  
**Módulos centrais:**
- [marketing-knowledge.ts](file:///C:/Users/mtres/Documents/brandpulse/src/lib/ai/marketing-knowledge.ts) — Biblioteca científica de 6 pilares + Critério Brasil (ABEP) + vetor NN/g ToV + matriz cruzada
- [graph.ts](file:///C:/Users/mtres/Documents/brandpulse/src/lib/agent/graph.ts) + [nodes.ts](file:///C:/Users/mtres/Documents/brandpulse/src/lib/agent/nodes.ts) — Agente Orquestrador Estratégico (`strategyOrchestratorNode`) no LangGraph.js
- [ibge-demographics.ts](file:///C:/Users/mtres/Documents/brandpulse/src/lib/audience/ibge-demographics.ts) + [persona-generator.ts](file:///C:/Users/mtres/Documents/brandpulse/src/lib/audience/persona-generator.ts) — Dados oficiais do IBGE (Localidades + Censo 2022 + PNAD Contínua) + Personas JTBD/VoC
- [logo-colors.ts](file:///C:/Users/mtres/Documents/brandpulse/src/lib/brand/logo-colors.ts) — Extração automática das cores prevalentes da logomarca em 3 variações harmônicas
- [image-gen.ts](file:///C:/Users/mtres/Documents/brandpulse/src/lib/visual/image-gen.ts) + [templates.ts](file:///C:/Users/mtres/Documents/brandpulse/src/lib/visual/templates.ts) — Motor Visual v3 (4 estilos editoriais + SiliconFlow `FLUX.2-flex` / Google Imagen Fast)

---

## 1. Fluxo de Orquestração Pré-Geração (Custo Extra US\$ 0,00)

Antes de qualquer geração no Estúdio, o nó **`strategyOrchestratorNode`** cruza todos os dados da marca:

```
Peça = Pilar(6 pilares) × Persona(JTBD + VoC + IBGE + ABEP) × DNA da Marca(Kapferer) × ToV(4 Sliders NN/g) × Gancho Cognitivo + Estilo Visual
```

1. **Marketing Digital, DBA & STEPPS:** Ehrenberg-Bass (*Distinctive Brand Assets*), Jonah Berger (*STEPPS* rotacionado por histórico) e Google E-E-A-T / GEO.
2. **Psicologia das Cores & Semiótica Visual:** análise HSL da paleta extraída da logomarca/marca + regra 60-30-10 + contraste WCAG AA >= 4.5:1.
3. **Comunicação Social, Schwartz & ELM:** 5 Níveis de Consciência (*Eugene Schwartz*) + Modelo de Probabilidade de Elaboração (*Petty & Cacioppo — Rota Central vs. Periférica*) + Prisma de Kapferer.
4. **Design & Diagramação Profissional:** NN/g (*F-Pattern, Layer-Cake, Z-Pattern, Front-Loading*), Gestalt e 4 composições visuais distintas selecionáveis no Estúdio (`editorial_classic`, `magazine_split`, `dark_impact`, `swiss_minimal`).
5. **Público-Alvo, Consumo, IBGE & ABEP:** dados reais do IBGE (população e renda per capita estadual), Critério Brasil (classes A a D-E), Jobs-to-be-Done (funcional, emocional e social) e Voz do Cliente (VoC) gerados em **Marcas e Personas** (`/settings/brand`).
6. **Linguagem, Sistema 1/2, Cialdini & Ganchos:** Daniel Kahneman (*Aversão à Perda*, *Sistema 1 → Sistema 2*), *Efeito Zeigarnik*, 7 Princípios éticos de Cialdini, 4 Sliders de Tom de Voz (NN/g) e conformidade CONAR/LGPD.

---

## 2. Regras Comerciais e de Produção Ativas

- **Pacotes oficiais:** **Kitefy Start** (R\$ 49,90 · 120 créditos), **Kitefy Lift** (R\$ 139,90 · 360 créditos) e **Kitefy Flow** (R\$ 299,90 · 1.000 créditos).
- **Proteção de créditos:** débito atômico na geração (`POST /api/studio/start`), com **estorno 100% automático** em caso de erro técnico da IA ou falha de pipeline (sem auditoria humana). Contas com `is_admin: true` possuem créditos ilimitados (`∞`).
- **Provedor de IA recomendado:** SiliconFlow (`DeepSeek-V3` para texto + `FLUX.2-flex` para imagens editoriais sem marca d'água, com teto de 2 imagens no Carrossel Ilustrado).
- **Exportação limpa:** a tela de revisão exibe texto editorial 100% limpo (`buildCleanCopyText`, sem símbolos de Markdown/IA) pronto para copiar e colar.
