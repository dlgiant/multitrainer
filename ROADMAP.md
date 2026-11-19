# MultiTrainer — Roadmap / Milestones

Fonte original: `MultiTrainer — Workout Engine Plan.pdf`. Este arquivo é a lista viva de marcos; novos itens entram aqui antes de virar código.

## Status

- [x] **Marco 0** — Ambientação e convenções (Vite+React+Dexie offline-first; motor em TS puro, espelhado entre `~/multi-trainer-workout-engine` e `~/multitrainer/src/engine`, md5-idêntico).
- [x] **Marco 1** — Modelo de dados, catálogo de exercícios, regras (v0.2.0, 37/37 testes).
- [x] **Marco 2** — Progressão (`progressExercise`), sugestões de substituição, alongamentos com reason, ICS.
- [x] **Marco 3 (parcial — generator-first)** — Rascunho de bloco (draft) via `generateProgram` + gates (PAR-Q+ 2022 completo em `src/lib/parq.ts`), preferências do cliente no perfil (dias/min/pular/foco), aba Programa com revisão do rascunho (trocar/fixar/remover/dose) e ativação (ProgramRecord + Workouts).

## Backlog

- [ ] **Marco 3 — restante**
  - Bateria de benchmarks (testes de repetição alimentando `assessments.benchmarks`; `seedLoad`).
  - Visão de reteste e comparação.
  - Campo "meses de treinamento" no perfil/avaliação.
  - Pickers de gostar/não gostar (likes/dislikes) na UI.
  - Rotina de fim de dia sugerida automaticamente após gerar o programa.

- [ ] **Marco 4 — Variações de estrutura de treino** *(novo pedido; não implementar ainda)*
  - **Cardio**: novo bloco `cardio` no motor — exercícios de condicionamento (esteira, bike, remo, corda, escalada), dose em duração/intensidade (Z2, tempo contínuo), respeitando `noJump` (substituir por opções de baixo impacto) e limites de articulação.
  - **Supersets**: agrupar 2 exercícios em par (`superset` group) — antagonistas ou mesmo grupo — com descanso compartilhado; render como A1/A2; afetar estimativa de minutos da sessão.
  - **HIIT**: grupos HIIT (ex.: 30s on/30s off, tabata) como bloco opcional — dose por tempo e rounds; gate por PAR-Q+/condição cardíaca e `noJump` (variantes low-impact: bike, remo).
  - **Preferência de posicionamento**: novo campo em `ClientPrefs` — `cardioPlacement: 'early' | 'late'` (default `'late'`) — o gerador posiciona cardio/HIIT no começo (aquecimento estendido) ou no fim da sessão; supersets seguem a lógica de blocos existente. UI: chips na aba Perfil, repassados ao engine client via `buildEngineClient`.
  - Migração Dexie para `prefs.cardioPlacement` + seed de exercícios cardio/HIIT na biblioteca.

- [ ] **Rascunhos futuros**: blocos predefinidos editáveis, histórico de programas, exportação/share.
