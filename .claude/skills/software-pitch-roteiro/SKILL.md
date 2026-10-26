---
name: software-pitch-roteiro
description: Lê a documentação de um sistema de software (PRD, escopo, README, protótipo, telas, análise financeira) e escreve um roteiro de pitch de investimento (5-10 min) para ser falado em voz alta, com abertura, problema, mercado, solução, protótipo/MVP, validação, modelo de negócio, roadmap, equipe e fechamento, além de perguntas e respostas previstas pelo método RED. Use when the user asks to "montar um pitch", "criar um roteiro de pitch", "preparar a apresentação para investidor", "transformar esse PRD em pitch", "escrever o discurso do pitch", or build an investor pitch script from existing product documentation. Do not use for designing visual slides/deck design (that is graphic design, not spoken text) or for generating a PRD/scope from scratch — the skill only consumes documentation that already exists and never invents market data, "real" stories, or funding-ask numbers that are not in the source.
license: CC-BY-4.0
metadata:
  author: Gabriel Auzier
  version: 1.0.0
---

# Roteiro de Pitch de Sistema de Software

Transforma a documentação de um produto (PRD, escopo, protótipo, telas, análise financeira, README) em um roteiro de pitch de investimento pronto para ser falado, aplicando a metodologia de Klaff (captura de atenção do sistema límbico) e a estrutura de pitch de startup (abertura, problema, mercado, solução, validação, modelo de negócio, roadmap, equipe, fechamento).

**Regra que atravessa toda a skill: nunca fabrique dado.** Números de mercado (TAM/SAM/SOM), histórias de abertura "reais", valor pedido ao investidor e resultados de validação só entram no roteiro se estiverem na documentação-fonte ou se o usuário os fornecer quando perguntado. Quando a fonte não tem o dado, marque a lacuna explicitamente no roteiro como `[FALTA: ...]` em vez de inventar — ver Passo 5.

Leia `references/metodologia-pitch.md` antes do Passo 3 — ele tem os testes e fórmulas (problema agnóstico/subjetivo/relevante, TAM/SAM/SOM, espelho da proposta de valor, conflito de agência, Hipster/Hacker/Hustler, método RED, gestão de tempo 20/60/20) que orientam como escrever cada seção, não só o que incluir.

## Instructions

### Passo 1: Identificar e ler a documentação-fonte

Se o usuário já apontou os arquivos (ex.: "usa o PRD e o protótipo"), leia-os por completo. Se não apontou, procure na ordem: PRD (`prd*.md`, `PRD*.md`), escopo (`escopo*.md`), README, documentos de análise financeira, arquivos de telas/protótipo (`telas.md`, `*.html` de protótipo). Se houver mais de uma versão do mesmo documento (ex.: v1 e v2), use a mais recente e confirme com o usuário se não estiver óbvio.

Não peça ao usuário para colar o conteúdo se os arquivos já existem no projeto — leia-os diretamente.

### Passo 2: Mapear a documentação para as seções do pitch

Para cada seção abaixo, extraia da documentação o material bruto. Não escreva o texto final ainda — só colete e cite de onde veio (arquivo:seção), para poder rastrear depois.

| Seção do pitch | O que procurar na fonte |
| --- | --- |
| Abertura | Persona real, entrevista, caso de uso concreto ou frase de dor citada literalmente por um usuário/entrevistado |
| Problema | A dor do público-alvo, descrita sem viés de solução (ver teste agnóstico/subjetivo/relevante em `references/metodologia-pitch.md`) |
| Mercado | Qualquer número de tamanho de mercado, público-alvo quantificado, ou TAM/SAM/SOM já calculado |
| Solução e proposta de valor | A frase-resumo da solução (sem adjetivos) e os benefícios por tipo de usuário/persona |
| Protótipo/MVP | Telas, fluxos, funcionalidades do MVP já descritas ou desenhadas |
| Validação | Entrevistas, testes, números de conversão, feedback de usuários reais |
| Modelo de negócio e concorrentes | Como o produto gera receita, e qualquer menção a concorrentes diretos/indiretos |
| Roadmap | Fases futuras, próximos passos, visão de longo prazo |
| Equipe | Quem está no time e suas competências |
| Fechamento | O que está sendo pedido (investimento, parceria, feedback) — só se a fonte disser |

### Passo 3: Escrever o roteiro de fala

Com `references/metodologia-pitch.md` carregado, escreva cada seção como texto corrido em primeira pessoa, pronto para ser falado — não como bullet points de slide. Aplique os testes e formatos da referência a cada seção (o problema passa pelo teste de 3 critérios, a solução vem sem adjetivos, a proposta de valor é o espelho do problema, etc.).

Estruture o roteiro final com estas seções, nesta ordem, e um cabeçalho de tempo-alvo por seção somando o tempo total (padrão 7 minutos; pergunte se o usuário quiser outra duração):

1. Abertura (~15% do tempo)
2. Problema (~15%)
3. Mercado (~10%)
4. Solução e proposta de valor (~15%)
5. Protótipo/MVP (~10%)
6. Validação (~15%) — a seção mais importante; nunca a encolha para caber tempo
7. Modelo de negócio e concorrentes (~10%)
8. Roadmap (~5%)
9. Equipe (~5%)
10. Fechamento (~5%) — termine sempre pedindo algo concreto, nunca com "era isso"

Se a fonte não tiver material suficiente para uma seção (ex.: nenhuma menção a equipe), não pule a seção — escreva o placeholder `[FALTA: dados de equipe não encontrados na documentação]` no lugar do texto, para o usuário completar.

### Passo 4: Escrever a seção de perguntas e respostas (método RED)

Releia as seções "Riscos", "Pontos em aberto" ou "Questões em aberto" da documentação-fonte (PRDs bem escritos costumam ter isso) e transforme cada risco em uma pergunta provável de investidor. Para cada uma, escreva a resposta em 3 partes conforme `references/metodologia-pitch.md`: Resposta direta, Exemplo detalhado, Descrição de relevância. Gere entre 5 e 8 perguntas — priorize as que atacam o maior risco do negócio, não as mais fáceis de responder.

### Passo 5: Compilar o roteiro final com lacunas visíveis

Monte o documento final com esta ordem: (1) um bloco "Pendências antes do pitch" listando todo `[FALTA: ...]` do roteiro, para o usuário resolver primeiro; (2) o roteiro completo do Passo 3; (3) o Q&A do Passo 4; (4) uma nota de rodapé com a gestão de tempo (checkpoints em minutos, ex. "aos 3min você deve estar entrando no Mercado").

Salve o roteiro em markdown. Pergunte ao usuário onde salvar se não for óbvio pelo projeto (um bom padrão é ao lado da documentação-fonte, com o nome `roteiro-pitch.md`); nunca sobrescreva a documentação-fonte original.

**Antes de entregar, releia o roteiro procurando por três coisas do sistema límbico (ver `references/metodologia-pitch.md`): há movimento/novidade na abertura? o problema soa como uma ameaça relevante, não uma curiosidade? a validação está em destaque, não enterrada?** Ajuste se qualquer resposta for não.

## Examples

### Exemplo 1: Pitch a partir de um PRD completo

Usuário diz: "monta um roteiro de pitch a partir do PRD do MVP e do protótipo"
Ações: (1) lê `prd-mvp.md`, `escopo-mvp.md`, `telas.md`; (2) mapeia problema/personas/proposta de valor/métricas de sucesso das seções correspondentes da PRD; (3) escreve o roteiro de 7 min com timing; (4) puxa a seção "Riscos e mitigação" da PRD para gerar 6 perguntas RED; (5) marca `[FALTA: TAM/SAM/SOM]` porque a PRD não tem tamanho de mercado quantificado, e `[FALTA: valor pedido ao investidor]` porque a PRD não define isso.
Resultado: `roteiro-pitch.md` com 2 pendências claramente sinalizadas no topo, pronto para o usuário completar antes de ensaiar.

### Exemplo 2: Documentação incompleta

Usuário diz: "cria o pitch do meu sistema, só tenho um README simples"
Ações: lê o README; identifica que faltam problema explícito, dados de validação e equipe; em vez de inventar, escreve o roteiro com as seções que têm base (solução, protótipo) e marca as demais como `[FALTA: ...]`, e pergunta ao usuário diretamente pelas 2-3 lacunas mais críticas (problema e validação) antes de fechar o documento, já que sem elas o pitch não tem como funcionar (ver "Dica" de validação em `references/metodologia-pitch.md`).
Resultado: roteiro parcial + perguntas diretas ao usuário, nunca um roteiro "completo" com dados fabricados.

## Troubleshooting

### A documentação não tem nenhuma validação real com usuários

Isso é a lacuna mais grave possível — sinalize com destaque no topo do documento ("sem isso, o pitch é percebido como só uma ideia, não uma oportunidade validada", conforme a referência) em vez de suavizar ou omitir o aviso.

### O usuário pede um pitch mais curto (elevator pitch)

Reduza para as seções Problema, Mercado (resumido) e Solução apenas, com 20-60 segundos de fala; corte equipe, roadmap e Q&A detalhado. Avise que essa versão serve para captar interesse inicial, não para uma reunião de investimento completa.

### Múltiplos documentos-fonte com informações conflitantes (ex.: valor de mercado diferente em dois arquivos)

Não escolha um dos dois silenciosamente. Aponte o conflito ao usuário e peça qual usar antes de escrever a seção afetada.
