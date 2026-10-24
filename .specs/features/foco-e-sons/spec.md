# Foco e sons Specification

## Problem Statement

Com listas e quadro, o usuário sabe o que fazer, mas não tem como medir quanto tempo cada tarefa leva nem se manter numa tarefa só. Sem um cronômetro ligado à estimativa, o tempo gasto não fica registrado e os relatórios não têm de onde tirar números. A fonte (pedido do usuário e o print `03-foco.png`) define um cronômetro que desce a partir da estimativa, pausas, intervalos, sons a cada 10 minutos e ao concluir, e a opção de estender quando a estimativa acaba.

## Goals

- [ ] O usuário foca nas tarefas de Hoje de uma lista com um cronômetro que desce a partir da estimativa e registra cada segundo como sessão no servidor.
- [ ] O tempo registrado fica certo mesmo com o relógio do computador errado, sem conexão ou com o app fechado de forma inesperada.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Widget sempre no topo | Feature `widget-desktop`. |
| Relatórios | Feature `relatorios`. |
| Ver o foco de outros membros | Decisão do usuário: o foco é individual. |
| Editar ou lançar tempo à mão | Não aparece na fonte. |
| Fila única com o Hoje de todas as listas | Decisão do usuário: o foco roda no Hoje da lista aberta. |
| Restaurar o foco ao reabrir o app | Decisão do usuário: reabrir mostra a home. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Escopo do foco | O Hoje da lista aberta, com o seletor de lista da tela de foco | Decisão do usuário; igual ao print `03-foco.png` | y |
| Fim da estimativa | A sessão é encerrada no instante em que o tempo gasto alcança a estimativa; toca o som de fim da estimativa; o cronômetro mostra `00:00:00` com `Estender` e `Concluir` | Decisão do usuário (pausa sozinho, com som próprio) | y |
| Estender | Abre uma nova sessão e o cronômetro sobe a partir da estimativa; a estimativa da tarefa não muda | Decisão do usuário | y |
| Tarefa sem estimativa | O cronômetro sobe a partir do tempo já gasto e nunca oferece `Estender` | Decisão do usuário | y |
| Pular | A sessão é encerrada, a tarefa vai para o fim de Hoje e a próxima começa a contar; desabilitado com uma só tarefa pendente | Decisão do usuário | y |
| Durações de intervalo | Atalhos de 5, 10 e 15 min e um campo livre de 1 a 120 min | Decisão do usuário | y |
| Fim do intervalo | Toca o som de fim do intervalo e a tarefa atual fica pausada | Decisão do usuário | y |
| Tarefa em foco excluída, fora de Hoje ou lista arquivada | O foco termina: a sessão é encerrada e a tela de foco volta ao quadro | Decisão do usuário | y |
| Dois dispositivos | Começar o foco com uma sessão aberta em outro dispositivo mostra "Você já está focando em outro dispositivo" e `Assumir`; `Assumir` na mesma tarefa continua a sessão, em outra tarefa encerra a antiga e abre a nova | Decisão do usuário | y |
| Sem conexão | A ação aparece na tela na hora e entra numa fila no dispositivo, com o horário do clique corrigido pela diferença para o relógio do servidor | Decisão do usuário | y |
| Duração da fila offline | Até 24h, sobrevivendo a fechar o app ou recarregar; ações mais antigas são descartadas com aviso | Decisão do usuário | y |
| Ação da fila que não vale mais | O app mostra a ação e pergunta: `Tentar de novo` ou `Descartar` | Decisão do usuário | y |
| Fechar o desktop com a tarefa contando | Diálogo "Há uma tarefa contando." com `Pausar e sair` e `Cancelar` | Decisão do usuário | y |
| Fechar a aba do navegador com a tarefa contando | Alerta padrão do navegador; se o usuário sair, o app pede a pausa no instante do fechamento | Decisão do usuário | y |
| Parada inesperada (queda, travamento) | Ao reabrir, o app mostra quanto tempo ficou contando desde o último sinal e pergunta: `Manter` ou `Cortar no último sinal` | Decisão do usuário | y |
| Intervalo entre sinais e prazo para considerar parada | O app aberto manda um sinal a cada 60 s; uma sessão sem sinal há mais de 120 s é tratada como parada inesperada | Decisão do usuário (60 s / 120 s) | y |
| Reabrir com tarefa pausada | Abre a home; o foco volta só com `Focar agora` | Decisão do usuário | y |
| Sons | 4 sons diferentes gerados por código (Web Audio API), sem arquivos de terceiros: conclusão, progresso, fim da estimativa e fim do intervalo | Decisão do usuário | y |
| Som de progresso | Toca quando o tempo total gasto na tarefa passa por 10, 20, 30… min, com a sessão aberta | Decisão do usuário (tempo total, não a sessão) | y |
| Onde tocam os sons | No navegador e no desktop; concluir pelo check do quadro também toca | Decisão do usuário | y |
| Desligar os sons | Um interruptor por som, salvo em cada dispositivo | Decisão do usuário | y |
| Papel `viewer` | Não foca nem registra tempo | Decisão do usuário | y |
| Relógio que vale | O do servidor: as respostas trazem `server_now` e o cliente calcula a diferença | Fato de projeto: é o que permite o cronômetro e a fila offline ficarem certos com o relógio local errado | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Focar nas tarefas de Hoje ⭐ MVP

**User Story**: Como usuário, quero focar numa tarefa por vez com um cronômetro que desce a partir da estimativa, para saber quanto falta e registrar o tempo gasto.

**Why P1**: É o centro do produto e a origem de todo tempo registrado.

**Acceptance Criteria**:

1. WHEN o usuário clica `Focar agora` THEN the trackzyn SHALL abrir a tela de foco com o seletor de lista, o título `Hoje`, os ícones de ajustes, home e recolher, `Est.: <soma>`, a barra `x/y Concluídas`, as tarefas pendentes de Hoje e `+ Adicionar tarefa`. (FOCUS-01)
2. WHEN a tela de foco abre THEN the trackzyn SHALL abrir uma sessão na primeira tarefa pendente de Hoje e mostrar no cartão dela o contorno destacado e o cronômetro `HH:MM:SS` igual à estimativa menos o tempo já gasto. (FOCUS-02)
3. WHILE uma sessão de tarefa está aberta the trackzyn SHALL diminuir o cronômetro 1 segundo a cada segundo, calculado com `started_at` e `server_now`, mostrando o mesmo valor (±1 s) com o relógio do computador 5 minutos adiantado ou atrasado. (FOCUS-03)
4. WHEN o usuário clica `Pausar` THEN the trackzyn SHALL encerrar a sessão, parar o cronômetro no valor em que estava e trocar o botão por `Retomar`. (FOCUS-04)
5. WHEN o usuário clica `Retomar` THEN the trackzyn SHALL abrir uma nova sessão na mesma tarefa e continuar o cronômetro do mesmo valor. (FOCUS-05)
6. WHEN o usuário clica `Pular` THEN the trackzyn SHALL encerrar a sessão, mover a tarefa para o fim de Hoje e abrir uma sessão na próxima tarefa de Hoje. (FOCUS-06)
7. WHILE Hoje tem uma só tarefa pendente the trackzyn SHALL mostrar `Pular` desabilitado. (FOCUS-07)
8. WHEN o usuário clica `Concluir` THEN the trackzyn SHALL encerrar a sessão, mover a tarefa para `Concluídas` com `completed_at` e abrir uma sessão na próxima tarefa de Hoje. (FOCUS-08)
9. WHEN o usuário conclui a última tarefa pendente de Hoje THEN the trackzyn SHALL mostrar `Tudo limpo` na tela de foco e não deixar nenhuma sessão aberta. (FOCUS-09)
10. WHEN o tempo gasto alcança a estimativa com a sessão aberta THEN the trackzyn SHALL encerrar a sessão com `ended_at` no instante exato em que o gasto igualou a estimativa, mostrar `00:00:00` e oferecer `Estender` e `Concluir`. (FOCUS-10)
11. IF o app está fechado quando o tempo gasto alcança a estimativa THEN the trackzyn SHALL registrar a sessão encerrada no instante em que o gasto igualou a estimativa. (FOCUS-11)
12. WHEN o usuário clica `Estender` THEN the trackzyn SHALL abrir uma nova sessão e fazer o cronômetro subir a partir da estimativa (com estimativa de 1h: `01:00:00`, `01:00:01`, …), sem mudar a estimativa da tarefa. (FOCUS-12)
13. WHILE o tempo gasto já passou da estimativa the trackzyn SHALL mostrar o cronômetro subindo, inclusive depois de `Pausar` e `Retomar`. (FOCUS-13)
14. WHILE a tarefa em foco não tem estimativa the trackzyn SHALL fazer o cronômetro subir a partir do tempo já gasto e nunca oferecer `Estender`. (FOCUS-14)
15. WHEN a tarefa em foco é excluída, sai de Hoje ou a lista dela é arquivada THEN the trackzyn SHALL encerrar a sessão no instante da mudança e sair da tela de foco para o quadro. (FOCUS-15)
16. WHEN o usuário clica no ícone de home da tela de foco THEN the trackzyn SHALL voltar ao quadro com a sessão aberta e o cartão em foco destacado, com o tempo correndo. (FOCUS-16)
17. WHILE o usuário tem papel `viewer` the trackzyn SHALL responder 403 `Read-only role` a toda ação de foco. (FOCUS-17)
18. IF uma ação chega quando o estado do foco já mudou, como pausar sem sessão aberta ou concluir uma tarefa já concluída, THEN the trackzyn SHALL responder 409 sem alterar sessão nem `completed_at`. (FOCUS-18)

**Independent Test**: Com 2 tarefas em Hoje (uma de 1 min, uma sem estimativa), focar, pausar, retomar, deixar a primeira chegar a `00:00:00`, estender, concluir, e ver a segunda subir a partir de `00:00:00`.

---

### P1: Intervalos ⭐ MVP

**User Story**: Como usuário, quero tirar um intervalo com duração definida para descansar sem perder o lugar na fila.

**Why P1**: Faz parte dos controles pedidos para o widget e a tela de foco.

**Acceptance Criteria**:

1. WHEN o usuário escolhe um intervalo de 5, 10 ou 15 min, ou digita de 1 a 120 min, THEN the trackzyn SHALL encerrar a sessão da tarefa, abrir uma sessão de intervalo com essa duração e mostrar a contagem regressiva do intervalo. (BREAK-01)
2. IF a duração digitada é menor que 1 ou maior que 120 min THEN the trackzyn SHALL responder 422 e não abrir o intervalo. (BREAK-02)
3. WHEN a contagem do intervalo chega a zero THEN the trackzyn SHALL encerrar a sessão de intervalo com exatamente a duração escolhida, tocar o som de fim do intervalo e deixar a tarefa atual pausada. (BREAK-03)
4. WHEN o usuário clica `Encerrar intervalo` antes do fim THEN the trackzyn SHALL encerrar a sessão de intervalo com o tempo que passou e deixar a tarefa atual pausada. (BREAK-04)
5. IF o app está fechado quando o intervalo chega ao fim THEN the trackzyn SHALL registrar o intervalo com exatamente a duração escolhida. (BREAK-05)

**Independent Test**: Tirar um intervalo de 1 min, esperar o fim, ouvir o som e ver a tarefa pausada; tirar outro e encerrar com 20 s.

---

### P1: Sons ⭐ MVP

**User Story**: Como usuário, quero ouvir quando concluo uma tarefa, a cada 10 minutos de trabalho, quando a estimativa acaba e quando o intervalo termina, para acompanhar o tempo sem olhar a tela.

**Why P1**: Pedido explícito da fonte.

**Acceptance Criteria**:

1. WHEN uma tarefa é concluída pela tela de foco, pelo widget ou pelo check do quadro THEN the trackzyn SHALL tocar o som de conclusão uma vez. (SOUND-01)
2. WHILE uma sessão de tarefa está aberta, WHEN o tempo total gasto na tarefa passa por um múltiplo de 10 min, the trackzyn SHALL tocar o som de progresso uma vez. (SOUND-02)
3. WHEN o tempo gasto alcança a estimativa THEN the trackzyn SHALL tocar o som de fim da estimativa uma vez. (SOUND-03)
4. WHEN um intervalo chega ao fim THEN the trackzyn SHALL tocar o som de fim do intervalo uma vez. (SOUND-04)
5. The trackzyn SHALL gerar os 4 sons por código, cada um com um timbre diferente dos outros 3, sem arquivo de áudio de terceiros. (SOUND-05)
6. WHEN o usuário desliga um dos 4 sons nos ajustes THEN the trackzyn SHALL deixar de tocar só esse som, nesse dispositivo, inclusive depois de reabrir o app. (SOUND-06)
7. The trackzyn SHALL tocar os sons tanto no navegador quanto no desktop. (SOUND-07)

**Independent Test**: Focar uma tarefa de 11 min com o tempo acelerado nos testes, ouvir progresso aos 10 min e fim da estimativa aos 11, concluir pelo quadro e ouvir a conclusão; desligar o som de progresso e conferir que só ele some.

---

### P1: Dispositivos, conexão e fechamento ⭐ MVP

**User Story**: Como usuário, quero que o tempo registrado fique certo quando troco de dispositivo, perco a conexão ou fecho o app.

**Why P1**: Sem isso, o tempo registrado, que é o produto, fica errado.

**Acceptance Criteria**:

1. The trackzyn SHALL manter no máximo uma sessão aberta por usuário, e duas requisições de início simultâneas SHALL deixar exatamente uma aberta. (SYNC-01)
2. WHEN o usuário começa o foco com uma sessão aberta em outro dispositivo THEN the trackzyn SHALL mostrar "Você já está focando em outro dispositivo." com `Assumir` e `Cancelar`, sem abrir sessão. (SYNC-02)
3. WHEN o usuário clica `Assumir` na mesma tarefa da sessão aberta THEN the trackzyn SHALL manter a sessão aberta sem cortá-la e mostrar o foco nesse dispositivo. (SYNC-03)
4. WHEN o usuário clica `Assumir` numa tarefa diferente da sessão aberta THEN the trackzyn SHALL encerrar a sessão antiga e abrir a nova no mesmo instante. (SYNC-04)
5. IF o servidor não responde a uma ação de foco THEN the trackzyn SHALL aplicar a ação na tela, guardá-la no dispositivo com o horário do clique corrigido pela diferença para o servidor e enviá-la quando a conexão voltar. (SYNC-05)
6. IF uma ação guardada tem mais de 24h THEN the trackzyn SHALL descartá-la e mostrar "Uma ação feita sem conexão há mais de 24h foi descartada." (SYNC-06)
7. IF o servidor recusa uma ação guardada ao reconectar THEN the trackzyn SHALL mostrar a ação recusada com `Tentar de novo` e `Descartar`. (SYNC-07)
8. WHEN o app desktop é fechado com uma tarefa contando THEN the trackzyn SHALL mostrar "Há uma tarefa contando." com `Pausar e sair` e `Cancelar`. (SYNC-08)
9. WHEN o usuário fecha a aba do navegador com uma tarefa contando THEN the trackzyn SHALL mostrar o alerta padrão do navegador e, se o usuário sair, pedir a pausa com o horário do fechamento. (SYNC-09)
10. WHILE o app está aberto com uma sessão aberta the trackzyn SHALL enviar um sinal ao servidor a cada 60 s. (SYNC-10)
11. WHEN o app abre e encontra uma sessão aberta sem sinal há mais de 120 s THEN the trackzyn SHALL mostrar quanto tempo ela contou desde o último sinal e oferecer `Manter` e `Cortar no último sinal`. (SYNC-11)
12. WHEN o app reabre com a tarefa pausada THEN the trackzyn SHALL abrir na home, sem restaurar a tela de foco. (SYNC-12)

**Independent Test**: Abrir duas abas como dois dispositivos, focar em uma e tentar na outra; desligar a rede, pausar, religar e conferir o horário gravado; matar o processo com o foco contando e reabrir depois de 3 min.

---

## Edge Cases

- IF a tarefa é concluída no quadro enquanto está em foco THEN the trackzyn SHALL encerrar a sessão e seguir como em FOCUS-08.
- WHEN o tempo gasto e a estimativa são iguais no instante em que o foco abre THEN the trackzyn SHALL mostrar `00:00:00` com `Estender` e `Concluir`, sem abrir sessão.
- IF o navegador bloqueia o primeiro som por falta de interação THEN the trackzyn SHALL seguir contando e tocar os sons seguintes depois do primeiro clique do usuário na página.
- WHEN uma sessão atravessa a meia-noite THEN the trackzyn SHALL manter uma sessão só; a divisão por dia é feita só nos relatórios.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FOCUS-01 | P1: Focar nas tarefas de Hoje | Tasks | Implementing |
| FOCUS-02 | P1: Focar nas tarefas de Hoje | Tasks | Implementing |
| FOCUS-03 | P1: Focar nas tarefas de Hoje | Tasks | Implementing |
| FOCUS-04 | P1: Focar nas tarefas de Hoje | Tasks | Implementing |
| FOCUS-05 | P1: Focar nas tarefas de Hoje | Tasks | Implementing |
| FOCUS-06 | P1: Focar nas tarefas de Hoje | Tasks | Implementing |
| FOCUS-07 | P1: Focar nas tarefas de Hoje | Tasks | Implementing |
| FOCUS-08 | P1: Focar nas tarefas de Hoje | Tasks | Implementing |
| FOCUS-09 | P1: Focar nas tarefas de Hoje | Tasks | Implementing |
| FOCUS-10 | P1: Focar nas tarefas de Hoje | Tasks | Implementing |
| FOCUS-11 | P1: Focar nas tarefas de Hoje | Tasks | Implementing |
| FOCUS-12 | P1: Focar nas tarefas de Hoje | Tasks | Implementing |
| FOCUS-13 | P1: Focar nas tarefas de Hoje | Tasks | Implementing |
| FOCUS-14 | P1: Focar nas tarefas de Hoje | Tasks | Implementing |
| FOCUS-15 | P1: Focar nas tarefas de Hoje | Tasks | Implementing |
| FOCUS-16 | P1: Focar nas tarefas de Hoje | Tasks | In Tasks |
| FOCUS-17 | P1: Focar nas tarefas de Hoje | Tasks | Implementing |
| FOCUS-18 | P1: Focar nas tarefas de Hoje | Tasks | Implementing |
| BREAK-01 | P1: Intervalos | Tasks | Implementing |
| BREAK-02 | P1: Intervalos | Tasks | Implementing |
| BREAK-03 | P1: Intervalos | Tasks | Implementing |
| BREAK-04 | P1: Intervalos | Tasks | Implementing |
| BREAK-05 | P1: Intervalos | Tasks | Implementing |
| SOUND-01 | P1: Sons | Tasks | Implementing |
| SOUND-02 | P1: Sons | Tasks | Implementing |
| SOUND-03 | P1: Sons | Tasks | Implementing |
| SOUND-04 | P1: Sons | Tasks | Implementing |
| SOUND-05 | P1: Sons | Tasks | Implementing |
| SOUND-06 | P1: Sons | Tasks | Implementing |
| SOUND-07 | P1: Sons | Tasks | Implementing |
| SYNC-01 | P1: Dispositivos, conexão e fechamento | Tasks | Implementing |
| SYNC-02 | P1: Dispositivos, conexão e fechamento | Tasks | Implementing |
| SYNC-03 | P1: Dispositivos, conexão e fechamento | Tasks | Implementing |
| SYNC-04 | P1: Dispositivos, conexão e fechamento | Tasks | Implementing |
| SYNC-05 | P1: Dispositivos, conexão e fechamento | Tasks | Implementing |
| SYNC-06 | P1: Dispositivos, conexão e fechamento | Tasks | Implementing |
| SYNC-07 | P1: Dispositivos, conexão e fechamento | Tasks | Implementing |
| SYNC-08 | P1: Dispositivos, conexão e fechamento | Tasks | In Tasks |
| SYNC-09 | P1: Dispositivos, conexão e fechamento | Tasks | Implementing |
| SYNC-10 | P1: Dispositivos, conexão e fechamento | Tasks | Implementing |
| SYNC-11 | P1: Dispositivos, conexão e fechamento | Tasks | Implementing |
| SYNC-12 | P1: Dispositivos, conexão e fechamento | Tasks | In Tasks |

**Coverage:** 42 total, 42 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] Uma tarefa focada por 1h com 2 pausas e 1 intervalo registra 1h de sessões de tarefa (±1 s) e o intervalo com a duração exata.
- [ ] Com a rede desligada por 10 min no meio do foco, o tempo gravado depois de reconectar é igual ao de um foco sem queda (±1 s).
