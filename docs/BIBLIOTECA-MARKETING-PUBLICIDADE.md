# Biblioteca de Referências Publicitárias & Motor de Cruzamento Pré-Geração

**Versão:** `advertising-library-v1`  
**Implementação:** `src/lib/ai/marketing-knowledge.ts`  
**Integração:** `src/lib/ai/prompts.ts` + `src/lib/ai/generate.ts`

## Visão Geral

Antes de gerar qualquer peça publicitária no Kitefy (carrossel, roteiro curto, criativo único, artigo GEO ou landing page), o motor de geração cruza automaticamente **6 pilares disciplinares** com o contexto real da marca (paleta de cores cadastrada em `visual_tokens`, ICP, tom de voz, objetivo editorial, produto/serviço e formato escolhido).

O resultado desse cruzamento é uma **Matriz Cruzada Pré-Geração** injetada no prompt de produção, garantindo coerência entre estratégia de marketing, psicologia cromática, nível de consciência do público, diagramação editorial, comportamento de consumo e linguagem persuasiva ética (em total conformidade com CONAR e LGPD).

---

## Os 6 Pilares da Biblioteca

### 1. Marketing Digital, Disponibilidade Mental e E-E-A-T / GEO
- **Fontes de referência:** Ehrenberg-Bass Institute (*How Brands Grow* — Byron Sharp; *Building Distinctive Brand Assets* — Jenni Romaniuk); Google Search Central (*Creating Helpful, Reliable, People-First Content — E-E-A-T*).
- **Princípios aplicados:**
  - **Disponibilidade Mental e Ativos Distintivos (DBA):** reforçar de forma consistente a assinatura visual, a paleta e o vocabulário próprio da marca.
  - **Citabilidade E-E-A-T / GEO:** responder dúvidas reais logo na abertura das seções com critérios práticos e fatos verificáveis.
  - **Retenção de funil:** alinhar abertura (3s iniciais / 125 caracteres da legenda) com o papel exato da peça na jornada.

### 2. Psicologia e Uso Funcional das Cores
- **Fontes de referência:** Ehrenberg-Bass Institute (*Color as a Distinctive Brand Asset*); W3C WCAG 2.1 (*Contrast Ratio*).
- **Princípios aplicados:**
  - **Fluência de Processamento (Processing Fluency):** alto contraste figura-fundo reduz o esforço cognitivo e eleva a percepção subconsciente de confiança.
  - **Contraste WCAG AA (>= 4.5:1) e Regra 60-30-10:** 60% superfície limpa de respiro, 30% cor estrutural da marca, 10% acento exclusivo para foco/CTA.
  - **Leitura cromática automática:** o motor analisa o hex real da marca (`primary`, `accent`, `theme`) em HSL e classifica a temperatura (`fria_confianca`, `quente_energia`, `organica_equilibrio`, `sofisticada_criativa`, `neutra_editorial`) para calibrar direção de arte e tom verbal.

### 3. Comunicação Social aplicada à Publicidade e Propaganda
- **Fontes de referência:** Eugene M. Schwartz (*Breakthrough Advertising* — 5 Níveis de Consciência do Mercado e Sofisticação de Mercado).
- **Princípios aplicados:**
  - **Mapeamento do Nível de Consciência:** o motor identifica automaticamente se a peça fala com público *Inconsciente*, *Consciente do Problema*, *Consciente da Solução* ou *Consciente do Produto* — impedindo o erro clássico de tentar vender produto de cara para quem ainda nem percebeu o problema.
  - **Sofisticação de Mercado:** em nichos saturados, substituir promessas exageradas por mecanismo concreto e critérios objetivos.

### 4. Design e Diagramação Profissional
- **Fontes de referência:** Nielsen Norman Group (NN/g — *Visual Hierarchy*, padrões *F*, *Layer-Cake* e *Z*, *Front-Loading*); Teoria da Gestalt e Estilo Tipográfico Internacional (Grid suíço).
- **Princípios aplicados:**
  - **Leitura escaneável:** *Layer-Cake* e *Continuidade* em carrosséis; padrão *Z* em criativos únicos (leitura em < 2s); padrão *F* e *Layer-Cake* em artigos GEO.
  - **Princípios da Gestalt:** *Proximidade*, *Semelhança*, *Continuidade*, *Fechamento* e *Figura-Fundo* garantindo 1 ideia central por bloco/slide.
  - **Espaço Negativo Ativo (Whitespace):** respiro generoso isolando a mensagem principal e evitando poluição visual.

### 5. Estudo de Público-Alvo e Comportamento de Consumo
- **Fontes de referência:** Jobs-to-be-Done (Clayton Christensen / Bob Moesta); CXL Institute (*Voice of Customer* e psicologia de compra B2B vs. B2C).
- **Princípios aplicados:**
  - **Calibragem automática B2B / B2C / Híbrido:** detectada a partir do ICP e do objetivo da campanha. B2B enfatiza redução de risco, previsibilidade e autoridade técnica; B2C enfatiza alívio imediato, identificação cotidiana e simplicidade.
  - **Jobs-to-be-Done (JTBD):** conectar a oferta ao progresso funcional, emocional e social buscado pelo cliente.

### 6. Linguagem e Persuasão Ética
- **Fontes de referência:** Robert B. Cialdini (*Influence* & *Pre-Suasion* — 7 Princípios da Persuasão); CXL Institute (*Conversion Copywriting*).
- **Princípios aplicados:**
  - **Persuasão ética:** aplica no máximo 2 gatilhos naturais por peça (ex.: *Autoridade* + *Reciprocidade* no B2B; *Afinidade/Unidade* + *Compromisso* no B2C), proibindo escassez fabricada, promessas absolutas ou dados inventados.
  - **Clareza acima de esperteza:** voz ativa em PT-BR natural, especificidade concreta e eliminação de clichês genéricos de IA.

---

## Como o Cruzamento Funciona em Tempo de Execução

1. `buildBrandContextBlock(brand)` em `src/lib/ai/prompts.ts` injeta no bloco estável de sistema a leitura cromática da marca (`analyzeBrandColorPalette`) junto ao ICP, tom de voz e fatos verificáveis.
2. `buildUserPrompt(input)` aciona `buildAdvertisingSynthesisBlock(...)`, que executa `crossReferenceAdvertisingContext(...)` cruzando formato (`assetType`), ângulo (`angleType`), framework (`framework`), objetivo, produto e dados reais da marca (`visual_tokens`, `icp_description`).
3. O modelo só redige o JSON final após receber essa matriz cruzada dos 6 pilares + os guardrails de conformidade CONAR/LGPD.
