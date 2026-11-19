# MultiTrainer

App (PWA) para personal trainers que atendem em domicílio. Feito para o **personal olhar o celular, e o cliente não**.

## Funcionalidades

- **Clientes**: cadastro com contato (link WhatsApp), endereço (link Maps), objetivos e observações.
- **Estado físico**: avaliações com peso, altura, IMC, % gordura, cintura, FC de repouso, pressão, nível e **lesões/restrições** em destaque. Histórico de avaliações.
- **Equipamentos da casa**: o que existe em cada local e as cargas disponíveis (ex.: `2-20/2` = halteres de 2 a 20 kg).
- **Treinos (A, B, C…)**: exercícios com séries, reps ou tempo, carga, descanso, equipamento e observações.
- **Sessão ao vivo** (tela escura, mantém a tela ligada):
  - um botão grande por série; timer de descanso automático com **bipes e vibração** nos últimos 3 s
  - exercícios por tempo (prancha etc.) com contagem regressiva "prepare-se → valendo"
  - cronômetro da sessão, +/-15 s, pausa, pular descanso, adicionar exercício/série na hora
  - **progressão automática**: se o cliente completou tudo na última sessão, sugere a próxima carga *disponível no equipamento dele*
  - gravação de vídeo direto no exercício (câmera traseira)
  - ao finalizar: PSE (1–10), observações e envio de resumo ao cliente (WhatsApp etc.)
- **Vídeos**: galeria por cliente; compartilhar um ou vários com o cliente pela folha de compartilhamento nativa.
- **Histórico** de sessões com volume, duração e frequência semanal.
- **Offline**: dados e vídeos ficam no aparelho (IndexedDB). Backup/restauração em JSON em *Ajustes*.

## Rodar

```bash
npm install
npm run dev        # desenvolvimento
npm run build      # produção → dist/
npm run preview    # servir o build (service worker ativo)
```

Para usar no celular: publique o `dist/` (ex.: `vercel deploy`; o `vercel.json` já tem o rewrite de SPA) e use "Adicionar à Tela de Início". Câmera e service worker exigem HTTPS.

## Stack

React 19 + TypeScript + Vite, Dexie (IndexedDB), React Router. Sem backend.
