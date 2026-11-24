# MultiTrainer — Roadmap / Milestones

Fonte original: `MultiTrainer — Workout Engine Plan.pdf`. Este arquivo é a lista viva de marcos; novos itens entram aqui antes de virar código.

## Status

- [x] **Marco 0** — Ambientação e convenções (Vite+React+Dexie offline-first; motor em TS puro, espelhado entre `~/multi-trainer-workout-engine` e `~/multitrainer/src/engine`, md5-idêntico).
- [x] **Marco 1** — Modelo de dados, catálogo de exercícios, regras (v0.2.0, 37/37 testes).
- [x] **Marco 2** — Progressão (`progressExercise`), sugestões de substituição, alongamentos com reason, ICS.
- [x] **Marco 3 (parcial — generator-first)** — Rascunho de bloco (draft) via `generateProgram` + gates (PAR-Q+ 2022 completo em `src/lib/parq.ts`), preferências do cliente no perfil (dias/min/pular/foco), aba Programa com revisão do rascunho (trocar/fixar/remover/dose) e ativação (ProgramRecord + Workouts).
- [x] **Catálogo — conjunto de mobilidade ampliado** — 9 novos itens `mobility` cobrindo todas as BodyRegions (adductors via butterfly/frog, quads, dorsiflexão de tornozelo knee-to-wall, tríceps/cotovelo, punho, sleeper stretch, 90/90) + `crocodile-breathing` estreando o papel `breathing`; consome via `suggestStretches` (rotina da noite) e o objetivo `mobility-rehab`. Testes: cobertura de região no catálogo + escolhas/exclusões por regra de lesão.

## Backlog

- [x] **Marco 3 — restante** *(75/75 testes no motor; app em `multitrainer@d19d803`)*
  - **Bateria de benchmarks**: engine ganhou `batteryFor(client, catalogue)` (testes loadable, equipamento do cliente, cap de complexidade por nível, passa nos filtros de lesão; ordem determinística por papel/padrão) e `tests/benchmarks.test.ts` cobrindo `e1rm`/`pctForReps`/`roundDownToOwned`/`seedLoad` (direto, ratio `RATIO`, calibração sem teste). App: `lib/benchmarks.ts` (BATTERY) + `assessments.benchmarks.repTests` → `engineAdapter` → `ClientModel.benchmarks` → `seedLoad`.
  - **Visão de reteste e comparação**: engine ganhou `compareBenchmarks(before, after)` (delta de e1rm por teste, testes novos, delta de dor por região, improved/declined). App: série de e1rm por teste ao longo das avaliações em `ProfileTab` + histórico de avaliações.
  - **Meses de treinamento**: campo no perfil/avaliação (`monthsTraining` em `db.ts`, `ProfileTab`, `engineAdapter`).
  - **Pickers de gostar/não gostar**: `ProfileTab` com listas de likes/dislikes alimentando `prefs` (motor usa em `softScore`).
  - **Rotina de fim de dia automática**: engine anexa `Program.eveningRoutine` (via `suggestStretches` com os músculos treinados da semana 1) ao gerar o programa em modo bloco; no app, `suggestEveningRoutine` cria a rotina ao ativar o programa (`ProgramTab`).

- [ ] **Marco 4 — Variações de estrutura de treino** *(novo pedido; não implementar ainda)*
  - **Cardio**: novo bloco `cardio` no motor — exercícios de condicionamento (esteira, bike, remo, corda, escalada), dose em duração/intensidade (Z2, tempo contínuo), respeitando `noJump` (substituir por opções de baixo impacto) e limites de articulação.
  - **Supersets**: agrupar 2 exercícios em par (`superset` group) — antagonistas ou mesmo grupo — com descanso compartilhado; render como A1/A2; afetar estimativa de minutos da sessão.
  - **HIIT**: grupos HIIT (ex.: 30s on/30s off, tabata) como bloco opcional — dose por tempo e rounds; gate por PAR-Q+/condição cardíaca e `noJump` (variantes low-impact: bike, remo).
  - **Preferência de posicionamento**: novo campo em `ClientPrefs` — `cardioPlacement: 'early' | 'late'` (default `'late'`) — o gerador posiciona cardio/HIIT no começo (aquecimento estendido) ou no fim da sessão; supersets seguem a lógica de blocos existente. UI: chips na aba Perfil, repassados ao engine client via `buildEngineClient`.
  - Migração Dexie para `prefs.cardioPlacement` + seed de exercícios cardio/HIIT na biblioteca.

- [x] **Marco 5 — Sequência por objetivo + geração just-in-time (JIT)** *(65/65 testes)*
  - Implementado como planejado: `sequence.ts` (`GOAL_SLOT_PRIORITY`, `orderSlotsForGoal`, `sequenceFor`; mobility-rehab ganha slot `mobility` no início do dia); `generateProgram` itera a sequência nos dois modos; `mode: "jit"` grava só a sequência (`SessionPlan.status: "pending"`, items vazios); `nextSession(client, program, history)` recusa a próxima sessão sem SessionLog da anterior, re-roda gates, aplica `progress(history)` na sessão seguinte e o gate de `readiness` (`READINESS_LOW` → -1 set nos blocos main/core com reason `readiness-low`). Decisões: bloco segue como rascunho para revisão e JIT só na execução; replaneja só a sessão imediata; readiness faz gate. Testes em `tests/jit.test.ts`.
  - **Sequência de tipos de treino por objetivo**: novo módulo `sequence.ts` com `GOAL_SLOT_ORDER` (ordem dos slots dentro do dia por `Goal` — strength: agachamento→irmão→push→pull→core; endurance: conditioning primeiro; mobility-rehab: mobility/core primeiro; etc.) e `sequenceFor(client, weeks)` devolvendo o bloco inteiro como lista ordenada. `generateProgram` passa a iterar essa lista; `slotsForDay` vira o mapa default (compatível).
  - **Próximo treino só após o anterior terminar**: `SessionPlan.status: "pending" | "ready" | "done"`; `generateProgram(client, { mode: "jit" })` grava só a sequência (items vazios). Nova função pura `nextSession(client, program, history)`: pega a 1ª sessão pending, **recusa se a anterior não tem SessionLog**, re-roda `evaluateGates`, aplica `progress(program, history)` na sessão seguinte (load/reps/regress), opcionalmente consome `SessionLog.readiness` (hoje campo morto) com reason `readiness-low`, e preenche a sessão via `buildSession` + `fitToBudget`. Deload passa a ser por nº de sessões concluídas. Modo grupo reutiliza via `buildSession`/`prefer`. ICS não muda (é agenda, não conteúdo).
  - **Testes**: ordem por objetivo e determinismo; nextSession sem histórico devolve sessão 1, sem log da sessão 1 nunca devolve a 2, com log devolve a 2 com mudanças de progressão aplicadas; lesão aguda nova bloqueia via gates; property test de filtros duros.
  - **Questões em aberto**: manter rascunho de bloco para revisão com JIT na execução (recomendado) vs substituir; replanejar só a sessão imediata vs reordenar as restantes (aqui entra o modelo de recuperação muscular); `readiness` gating ou informativo.

- [ ] **Rascunhos futuros**: blocos predefinidos editáveis, histórico de programas, exportação/share.
