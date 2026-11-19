// PAR-Q+ 2022 — The Physical Activity Readiness Questionnaire for Everyone.
// Formulário oficial completo, sem omissões (parmedx.com — "You must use the
// entire questionnaire and NO changes are permitted"). Perguntas numeradas
// exatamente como no original; texto em PT-BR. O original em inglês está em
// https://www.eparmedx.com/wp-content/uploads/2022/01/ParQPlus2022.pdf
// Copyright © 2022 PAR-Q+ Collaboration (Warburton, Jamnik, Bredin & Gledhill).
import type { ParqResult } from './db';

export interface ParqQuestion {
  id: string;
  text: string;
  /** Chaves que surgem apenas quando a condição anterior é marcada. */
  parent?: string;
}

export interface ParqSection {
  id: string;
  title?: string;
  condition?: string; // pergunta-raiz das páginas 2-3 ("tem artrite…?")
  questions: ParqQuestion[];
}

/** Página 1: 7 questões gerais (chaves g1…g7, na ordem oficial). */
export const PARQ_GENERAL: ParqQuestion[] = [
  { id: 'g1', text: 'Seu médico já disse que você tem uma condição cardíaca OU pressão alta?' },
  { id: 'g2', text: 'Você sente dor no peito em repouso, nas atividades diárias OU ao praticar atividade física?' },
  { id: 'g3', text: 'Você perde o equilíbrio por tontura OU perdeu a consciência nos últimos 12 meses? (Responda NÃO se a tontura foi por hiperventilação, inclusive durante exercício vigoroso.)' },
  { id: 'g4', text: 'Você já recebeu diagnóstico de outra condição médica crônica (além de doença cardíaca ou pressão alta)? Liste a(s) condição(ões).' },
  { id: 'g5', text: 'Você toma medicamentos prescritos para alguma condição médica crônica?' },
  { id: 'g6', text: 'Você tem hoje (ou teve nos últimos 12 meses) algum problema ósseo, articular ou de tecido mole (músculo, ligamento ou tendão) que possa piorar com mais atividade física? (Responda NÃO se o problema é antigo e não limita sua atividade hoje.)' },
  { id: 'g7', text: 'Seu médico já disse que você só deve praticar atividade física com supervisão médica?' },
];

/** Páginas 2-3: questões de acompanhamento por condição (oficiais, 1-10 a-d). */
export const PARQ_SECTIONS: ParqSection[] = [
  {
    id: 's1',
    condition: '1. Artrite, osteoporose ou problemas de coluna?',
    questions: [
      { id: '1a', text: 'Tem dificuldade de controlar a condição com medicamentos ou outras terapias prescritas? (Responda NÃO se não faz tratamento atualmente.)', parent: 's1' },
      { id: '1b', text: 'Tem dores articulares, fratura recente (ou por osteoporose/câncer), vértebra deslocada (espondilolistese) e/ou espondilólise (fratura no arco ósseo da coluna)?', parent: 's1' },
      { id: '1c', text: 'Recebeu injeções ou tomou corticoides por via oral regularmente por mais de 3 meses?', parent: 's1' },
    ],
  },
  {
    id: 's2',
    condition: '2. Câncer de qualquer tipo, atualmente?',
    questions: [
      { id: '2a', text: 'O diagnóstico inclui algum destes tipos: pulmão/brônquico, mieloma múltiplo, cabeça e/ou pescoço?', parent: 's2' },
      { id: '2b', text: 'Está em tratamento oncológico atualmente (quimio ou radioterapia)?', parent: 's2' },
    ],
  },
  {
    id: 's3',
    condition: '3. Condição cardíaca ou cardiovascular? (Inclui doença arterial coronariana, insuficiência cardíaca, arritmia diagnosticada.)',
    questions: [
      { id: '3a', text: 'Tem dificuldade de controlar a condição com medicamentos ou outras terapias prescritas? (Responda NÃO se não faz tratamento atualmente.)', parent: 's3' },
      { id: '3b', text: 'Tem batimento irregular que exige acompanhamento médico (ex.: fibrilação atrial, contrações ventriculares prematuras)?', parent: 's3' },
      { id: '3c', text: 'Tem insuficiência cardíaca crônica?', parent: 's3' },
      { id: '3d', text: 'Tem doença arterial coronariana diagnosticada e não pratica atividade física regular nos últimos 2 meses?', parent: 's3' },
    ],
  },
  {
    id: 's4',
    condition: '4. Pressão alta atualmente?',
    questions: [
      { id: '4a', text: 'Tem dificuldade de controlar a condição com medicamentos ou outras terapias prescritas? (Responda NÃO se não faz tratamento atualmente.)', parent: 's4' },
      { id: '4b', text: 'Sua pressão arterial de repouso é igual ou maior que 160/90 mmHg, com ou sem medicação? (Responda SIM se não conhece sua pressão de repouso.)', parent: 's4' },
    ],
  },
  {
    id: 's5',
    condition: '5. Condição metabólica? (Inclui diabetes tipo 1, tipo 2 e pré-diabetes.)',
    questions: [
      { id: '5a', text: 'Frequentemente tem dificuldade de controlar a glicemia com alimentação, medicamentos ou outras terapias prescritas?', parent: 's5' },
      { id: '5b', text: 'Frequentemente tem sinais de hipoglicemia após exercício e/ou nas atividades diárias? (Tremores, nervosismo, irritabilidade, sudorese anormal, tontura, confusão, dificuldade de fala, fraqueza ou sonolência.)', parent: 's5' },
      { id: '5c', text: 'Tem sinais de complicações do diabetes, como doença cardíaca/vascular e/ou complicações nos olhos, rins OU sensibilidade nos pés?', parent: 's5' },
      { id: '5d', text: 'Tem outra condição metabólica (ex.: diabetes gestacional atual, doença renal crônica, problemas hepáticos)?', parent: 's5' },
      { id: '5e', text: 'Planeja fazer em breve um exercício de intensidade alta (vigorosa), incomum para você?', parent: 's5' },
    ],
  },
  {
    id: 's6',
    condition: '6. Problemas de saúde mental ou dificuldades de aprendizado? (Inclui Alzheimer, demência, depressão, ansiedade, transtorno alimentar, transtorno psicótico, deficiência intelectual, síndrome de Down.)',
    questions: [
      { id: '6a', text: 'Tem dificuldade de controlar a condição com medicamentos ou outras terapias prescritas? (Responda NÃO se não faz tratamento atualmente.)', parent: 's6' },
      { id: '6b', text: 'Tem síndrome de Down E problemas de coluna que afetam nervos ou músculos?', parent: 's6' },
    ],
  },
  {
    id: 's7',
    condition: '7. Doença respiratória? (Inclui DPOC, asma, hipertensão pulmonar.)',
    questions: [
      { id: '7a', text: 'Tem dificuldade de controlar a condição com medicamentos ou outras terapias prescritas? (Responda NÃO se não faz tratamento atualmente.)', parent: 's7' },
      { id: '7b', text: 'Seu médico já disse que seu nível de oxigênio no sangue é baixo em repouso ou no exercício e/ou que você precisa de oxigenoterapia?', parent: 's7' },
      { id: '7c', text: 'Se asmático: sente hoje aperto no peito, chiado, respiração trabalhosa, tosse constante (mais de 2 dias/semana) OU usou medicamento de resgate mais de duas vezes na última semana?', parent: 's7' },
      { id: '7d', text: 'Seu médico já mencionou pressão alta nos vasos sanguíneos dos pulmões?', parent: 's7' },
    ],
  },
  {
    id: 's8',
    condition: '8. Lesão da medula espinhal? (Inclui tetraplegia e paraplegia.)',
    questions: [
      { id: '8a', text: 'Tem dificuldade de controlar a condição com medicamentos ou outras terapias prescritas? (Responda NÃO se não faz tratamento atualmente.)', parent: 's8' },
      { id: '8b', text: 'Costuma ter pressão baixa de repouso significativa a ponto de causar tontura, sensação de cabeça leve e/ou desmaio?', parent: 's8' },
      { id: '8c', text: 'Seu médico indicou que você tem picos súbitos de pressão alta (disreflexia autonômica)?', parent: 's8' },
    ],
  },
  {
    id: 's9',
    condition: '9. AVC (derrame)? Inclui ataque isquêmico transitório (AIT) ou evento cerebrovascular.',
    questions: [
      { id: '9a', text: 'Tem dificuldade de controlar a condição com medicamentos ou outras terapias prescritas? (Responda NÃO se não faz tratamento atualmente.)', parent: 's9' },
      { id: '9b', text: 'Tem alguma limitação de marcha ou mobilidade?', parent: 's9' },
      { id: '9c', text: 'Teve um AVC ou comprometimento de nervos/músculos nos últimos 6 meses?', parent: 's9' },
    ],
  },
  {
    id: 's10',
    condition: '10. Outra condição médica não listada acima, ou duas ou mais condições médicas?',
    questions: [
      { id: '10a', text: 'Teve desmaio, apagão ou perda de consciência por traumatismo craniano nos últimos 12 meses OU concussão diagnosticada nos últimos 12 meses?', parent: 's10' },
      { id: '10b', text: 'Tem uma condição médica não listada (ex.: epilepsia, condições neurológicas, problemas renais)?', parent: 's10' },
      { id: '10c', text: 'Vive atualmente com duas ou mais condições médicas?', parent: 's10' },
    ],
  },
];

/** Aderência à atividade física (plan section 1, PAR-Q+): qualquer SIM na página 1
 *  liga o portão de segurança do motor — geração só após liberação com data. */
export function parqPositive(parq?: ParqResult): boolean {
  if (!parq) return false;
  return PARQ_GENERAL.some((q) => parq.answers[q.id] === 'yes');
}

/** Alguma condição de acompanhamento (páginas 2-3) com SIM. */
export function parqFollowUpPositive(parq?: ParqResult): boolean {
  if (!parq) return false;
  return PARQ_SECTIONS.some((s) => s.questions.some((q) => parq.answers[q.id] === 'yes'));
}
