import { RULES } from '../engine/catalogue';
import { db, type Exercise } from './db';

// [nome, grupo, modo, cues, tags do motor]
type Tags = Pick<
  Exercise,
  | 'pattern'
  | 'muscles'
  | 'complexity'
  | 'loadable'
  | 'equipmentTokens'
  | 'stress'
  | 'constraints'
  | 'regressesTo'
  | 'progressesTo'
  | 'role'
  | 'tempoSecPerRep'
  | 'holdSec'
  | 'perSide'
>;
type Row = [string, string, Exercise['mode'], string?, Tags?];

const st = (load: number, range: number, impact = 0) => ({ load, range, impact });

const LIB: Row[] = [
  // Pernas
  ['Agachamento livre', 'Pernas', 'reps', 'Joelhos alinhados com os pés, peito aberto', { pattern: 'squat', muscles: { primary: ['quads', 'glutes'], secondary: ['core'] }, complexity: 3, loadable: false, stress: { knee: st(3, 3), spine: st(3, 1) }, constraints: { spaceM2: 8 } }],
  ['Agachamento goblet', 'Pernas', 'reps', 'Halter/kettlebell junto ao peito', { pattern: 'squat', muscles: { primary: ['quads', 'glutes'], secondary: ['core'] }, complexity: 2, loadable: true, equipmentTokens: ['db'], stress: { knee: st(2, 3), spine: st(1, 0) } }],
  ['Afundo (lunge)', 'Pernas', 'reps', 'Joelho de trás quase toca o chão', { pattern: 'lunge', muscles: { primary: ['quads', 'glutes'], secondary: ['hamstrings'] }, complexity: 2, loadable: true, equipmentTokens: ['db'], stress: { knee: st(2, 3, 1) }, constraints: { spaceM2: 4 } }],
  ['Agachamento búlgaro', 'Pernas', 'reps', 'Pé de trás apoiado no banco/sofá', { pattern: 'lunge', muscles: { primary: ['quads', 'glutes'], secondary: [] }, complexity: 3, loadable: true, equipmentTokens: ['db', 'bench'], stress: { knee: st(2, 3) }, constraints: { spaceM2: 4 } }],
  ['Levantamento terra romeno', 'Pernas', 'reps', 'Quadril para trás, coluna neutra', { pattern: 'hinge', muscles: { primary: ['hamstrings', 'glutes'], secondary: ['spine-erectors'] }, complexity: 2, loadable: true, equipmentTokens: ['db'], stress: { spine: st(1, 2) } }],
  ['Elevação pélvica', 'Glúteos', 'reps', 'Contrair glúteo no topo 1s', { pattern: 'hinge', muscles: { primary: ['glutes'], secondary: ['hamstrings'] }, complexity: 1, loadable: true, equipmentTokens: ['db', 'bench'], stress: { spine: st(0, 0) } }],
  ['Subida no banco (step-up)', 'Pernas', 'reps', undefined, { pattern: 'lunge', muscles: { primary: ['quads', 'glutes'], secondary: [] }, complexity: 2, loadable: true, equipmentTokens: ['bench', 'db'], stress: { knee: st(2, 2, 1) } }],
  ['Panturrilha em pé', 'Pernas', 'reps', undefined, { pattern: 'squat', muscles: { primary: ['calves'], secondary: [] }, complexity: 1, loadable: true, equipmentTokens: ['db'], stress: {} }],
  ['Cadeira isométrica na parede', 'Pernas', 'tempo', 'Joelhos a 90°', { pattern: 'squat', muscles: { primary: ['quads'], secondary: [] }, complexity: 1, loadable: false, stress: { knee: st(1, 1) }, role: 'primer', tempoSecPerRep: 1, holdSec: 40 }],
  // Peito / empurrar
  ['Flexão de braço', 'Peito', 'reps', 'Corpo em prancha, cotovelos a 45°', { pattern: 'h-push', muscles: { primary: ['pecs'], secondary: ['triceps', 'front-delts'] }, complexity: 1, loadable: false, stress: { shoulder: st(1, 2), wrist: st(1, 2) }, constraints: { floor: true }, regressesTo: 'lib-10' }],
  ['Flexão com joelhos apoiados', 'Peito', 'reps', undefined, { pattern: 'h-push', muscles: { primary: ['pecs'], secondary: ['triceps'] }, complexity: 1, loadable: false, stress: { shoulder: st(1, 1), wrist: st(0, 1) }, constraints: { floor: true }, progressesTo: 'lib-9' }],
  ['Supino com halteres (chão/banco)', 'Peito', 'reps', undefined, { pattern: 'h-push', muscles: { primary: ['pecs'], secondary: ['triceps', 'front-delts'] }, complexity: 2, loadable: true, equipmentTokens: ['db', 'bench'], stress: { shoulder: st(2, 2) } }],
  ['Desenvolvimento com halteres', 'Ombros', 'reps', 'Não arquear a lombar', { pattern: 'v-push', muscles: { primary: ['front-delts'], secondary: ['triceps'] }, complexity: 2, loadable: true, equipmentTokens: ['db'], stress: { shoulder: st(2, 3), spine: st(1, 0) } }],
  ['Elevação lateral', 'Ombros', 'reps', 'Cotovelos levemente flexionados', { pattern: 'v-push', muscles: { primary: ['side-delts'], secondary: [] }, complexity: 1, loadable: true, equipmentTokens: ['db'], stress: { shoulder: st(1, 2) } }],
  ['Tríceps no banco (mergulho)', 'Tríceps', 'reps', undefined, { pattern: 'h-push', muscles: { primary: ['triceps'], secondary: [] }, complexity: 1, loadable: false, stress: { shoulder: st(1, 2) } }],
  ['Tríceps francês com halter', 'Tríceps', 'reps', undefined, { pattern: 'h-push', muscles: { primary: ['triceps'], secondary: [] }, complexity: 1, loadable: true, equipmentTokens: ['db'], stress: { shoulder: st(1, 2), elbow: st(2, 3) } }],
  // Costas / puxar
  ['Remada curvada com halteres', 'Costas', 'reps', 'Puxar com o cotovelo, escápulas juntas', { pattern: 'h-pull', muscles: { primary: ['lats', 'mid-back'], secondary: ['biceps'] }, complexity: 2, loadable: true, equipmentTokens: ['db'], stress: { spine: st(1, 1) } }],
  ['Remada unilateral', 'Costas', 'reps', undefined, { pattern: 'h-pull', muscles: { primary: ['lats', 'mid-back'], secondary: ['biceps'] }, complexity: 1, loadable: true, equipmentTokens: ['db', 'bench'], stress: { shoulder: st(1, 1) } }],
  ['Remada com elástico', 'Costas', 'reps', undefined, { pattern: 'h-pull', muscles: { primary: ['mid-back'], secondary: ['lats'] }, complexity: 1, loadable: false, equipmentTokens: ['band'], stress: { shoulder: st(0, 1) } }],
  ['Puxada na barra fixa', 'Costas', 'reps', undefined, { pattern: 'v-pull', muscles: { primary: ['lats'], secondary: ['biceps'] }, complexity: 3, loadable: false, equipmentTokens: ['barra'], stress: { shoulder: st(2, 2) } }],
  ['Rosca bíceps', 'Bíceps', 'reps', 'Sem balançar o tronco', { pattern: 'h-pull', muscles: { primary: ['biceps'], secondary: [] }, complexity: 1, loadable: true, equipmentTokens: ['db'], stress: { elbow: st(1, 2) } }],
  ['Rosca martelo', 'Bíceps', 'reps', undefined, { pattern: 'h-pull', muscles: { primary: ['biceps'], secondary: [] }, complexity: 1, loadable: true, equipmentTokens: ['db'], stress: { elbow: st(1, 2) } }],
  // Core
  ['Prancha', 'Core', 'tempo', 'Glúteo contraído, não deixar quadril cair', { pattern: 'core', muscles: { primary: ['core'], secondary: [] }, complexity: 1, loadable: false, stress: { spine: st(1, 0), wrist: st(1, 0) }, constraints: { floor: true }, role: 'core', tempoSecPerRep: 1, holdSec: 40, regressesTo: 'lib-23' }],
  ['Prancha lateral', 'Core', 'tempo', undefined, { pattern: 'core', muscles: { primary: ['core'], secondary: [] }, complexity: 1, loadable: false, stress: { spine: st(0, 0) }, constraints: { floor: true }, role: 'core', tempoSecPerRep: 1, holdSec: 30, perSide: true, progressesTo: 'lib-22' }],
  ['Abdominal crunch', 'Core', 'reps', undefined, { pattern: 'core', muscles: { primary: ['core'], secondary: [] }, complexity: 1, loadable: false, stress: { spine: st(0, 3) }, constraints: { floor: true }, role: 'core' }],
  ['Dead bug', 'Core', 'reps', 'Lombar colada no chão', { pattern: 'core', muscles: { primary: ['core'], secondary: [] }, complexity: 1, loadable: false, stress: { spine: st(0, 1) }, constraints: { floor: true }, role: 'core' }],
  ['Bird dog', 'Core', 'reps', undefined, { pattern: 'core', muscles: { primary: ['core'], secondary: ['glutes'] }, complexity: 1, loadable: false, stress: { spine: st(0, 1) }, constraints: { floor: true }, role: 'core', perSide: true }],
  ['Mountain climber', 'Core', 'tempo', undefined, { pattern: 'conditioning', muscles: { primary: ['core'], secondary: [] }, complexity: 1, loadable: false, stress: { knee: st(1, 1, 1), ankle: st(1, 1, 1) }, constraints: { floor: true, noise: true }, role: 'core', tempoSecPerRep: 1 }],
  // Corpo inteiro / cardio
  ['Swing com kettlebell', 'Corpo inteiro', 'reps', 'Movimento vem do quadril', { pattern: 'hinge', muscles: { primary: ['glutes', 'hamstrings'], secondary: ['core'] }, complexity: 2, loadable: true, equipmentTokens: ['kb'], stress: { spine: st(1, 1) } }],
  ['Burpee', 'Cardio', 'reps', undefined, { pattern: 'conditioning', muscles: { primary: ['core'], secondary: [] }, complexity: 3, loadable: false, stress: { knee: st(1, 1, 3), ankle: st(1, 1, 3), wrist: st(1, 1, 1) }, constraints: { jumping: true, noise: true, spaceM2: 4 }, role: 'warmup', tempoSecPerRep: 1 }],
  ['Polichinelo', 'Cardio', 'tempo', undefined, { pattern: 'conditioning', muscles: { primary: ['calves'], secondary: [] }, complexity: 1, loadable: false, stress: { knee: st(1, 1, 1), ankle: st(1, 1, 3) }, constraints: { jumping: true, noise: true }, role: 'warmup', tempoSecPerRep: 1 }],
  ['Pular corda', 'Cardio', 'tempo', undefined, { pattern: 'conditioning', muscles: { primary: ['calves'], secondary: [] }, complexity: 1, loadable: false, stress: { knee: st(1, 1, 3), ankle: st(1, 1, 3) }, constraints: { jumping: true, noise: true, spaceM2: 4 }, role: 'warmup', tempoSecPerRep: 1 }],
  ['Corrida estacionária', 'Cardio', 'tempo', undefined, { pattern: 'conditioning', muscles: { primary: ['calves'], secondary: [] }, complexity: 1, loadable: false, stress: { knee: st(1, 1, 1), ankle: st(1, 1, 1) }, role: 'warmup', tempoSecPerRep: 1 }],
  // TRX (espreguiçadeira / suspensão)
  ['Agachamento assistido no TRX', 'Pernas', 'reps', 'Alças sob as axilas; use o apoio só se precisar', { pattern: 'squat', muscles: { primary: ['quads', 'glutes'], secondary: ['core'] }, complexity: 1, loadable: false, equipmentTokens: ['trx'], stress: { knee: st(1, 1), spine: st(0, 0) }, constraints: { spaceM2: 3 }, regressesTo: 'lib-8', progressesTo: 'lib-0' }],
  ['Afundo assistido no TRX', 'Pernas', 'reps', undefined, { pattern: 'lunge', muscles: { primary: ['quads', 'glutes'], secondary: ['hamstrings'] }, complexity: 1, loadable: false, equipmentTokens: ['trx'], stress: { knee: st(1, 2) }, constraints: { spaceM2: 3 }, perSide: true, regressesTo: 'lib-2' }],
  ['Flexão de pernas no TRX', 'Pernas', 'reps', 'Quadril alto, calcanhares em direção ao glúteo', { pattern: 'hinge', muscles: { primary: ['hamstrings', 'glutes'], secondary: ['core'] }, complexity: 2, loadable: false, equipmentTokens: ['trx'], stress: { knee: st(1, 0), spine: st(0, 1) }, constraints: { floor: true, spaceM2: 3 }, regressesTo: 'lib-5' }],
  ['Supino no TRX', 'Peito', 'reps', 'Quanto mais horizontal o corpo, mais difícil', { pattern: 'h-push', muscles: { primary: ['pecs'], secondary: ['triceps', 'front-delts'] }, complexity: 1, loadable: false, equipmentTokens: ['trx'], stress: { shoulder: st(1, 1) }, constraints: { spaceM2: 3 }, regressesTo: 'lib-10', progressesTo: 'lib-9' }],
  ['Remada no TRX', 'Costas', 'reps', 'Corpo reto, puxe o peito até as alças', { pattern: 'h-pull', muscles: { primary: ['mid-back', 'lats'], secondary: ['biceps', 'rear-delts'] }, complexity: 1, loadable: false, equipmentTokens: ['trx'], stress: { shoulder: st(0, 1) }, constraints: { spaceM2: 3 }, regressesTo: 'lib-18' }],
  ['Elevação Y no TRX', 'Costas', 'reps', undefined, { pattern: 'v-pull', muscles: { primary: ['rear-delts', 'mid-back'], secondary: ['traps'] }, complexity: 1, loadable: false, equipmentTokens: ['trx'], stress: { shoulder: st(0, 1) }, constraints: { spaceM2: 3 }, perSide: true }],
  ['Fallout no TRX', 'Core', 'reps', 'Quadril não cai', { pattern: 'core', muscles: { primary: ['core'], secondary: ['spine-erectors'] }, complexity: 2, loadable: false, equipmentTokens: ['trx'], stress: { spine: st(1, 0), shoulder: st(1, 1) }, constraints: { spaceM2: 3 }, role: 'core', tempoSecPerRep: 4, regressesTo: 'lib-22' }],
  ['Prancha no TRX', 'Core', 'tempo', 'Pés nas alças, corpo em linha reta', { pattern: 'core', muscles: { primary: ['core'], secondary: [] }, complexity: 2, loadable: false, equipmentTokens: ['trx'], stress: { spine: st(1, 0), shoulder: st(1, 0) }, constraints: { floor: true, spaceM2: 3 }, role: 'core', tempoSecPerRep: 1, holdSec: 30, regressesTo: 'lib-22', progressesTo: 'lib-41' }],
  ['Pike no TRX', 'Core', 'reps', 'Quadril bem alto, pés nas alças', { pattern: 'core', muscles: { primary: ['core'], secondary: ['front-delts'] }, complexity: 3, loadable: false, equipmentTokens: ['trx'], stress: { spine: st(1, 1), shoulder: st(1, 2) }, constraints: { floor: true, spaceM2: 3 }, role: 'core', tempoSecPerRep: 4, regressesTo: 'lib-40' }],
  ['Rosca bíceps no TRX', 'Bíceps', 'reps', undefined, { pattern: 'h-pull', muscles: { primary: ['biceps'], secondary: ['forearms'] }, complexity: 1, loadable: false, equipmentTokens: ['trx'], stress: { elbow: st(1, 0) }, constraints: { spaceM2: 3 } }],
  ['Alongamento de dorsal no TRX', 'Mobilidade', 'tempo', 'Segure as alças, quadril para trás', { pattern: 'mobility', muscles: { primary: ['lats'], secondary: ['pecs'] }, complexity: 1, loadable: false, equipmentTokens: ['trx'], stress: { shoulder: st(0, 2), spine: st(0, 1) }, constraints: { spaceM2: 3 }, role: 'stretch', tempoSecPerRep: 1, holdSec: 30, perSide: true }],
  // Mobilidade / alongamentos (repertório do gerador e das rotinas noturnas)
  ['Gato-camelo', 'Mobilidade', 'tempo', 'Movimento lento, uma respiração por ciclo', { pattern: 'mobility', muscles: { primary: ['spine-erectors'], secondary: ['core'] }, complexity: 1, loadable: false, stress: { spine: st(0, 2), wrist: st(1, 0) }, constraints: { floor: true }, role: 'stretch', tempoSecPerRep: 3, holdSec: 5 }],
  ['Postura da criança', 'Mobilidade', 'tempo', 'Respire fundo, solte o quadril para trás', { pattern: 'mobility', muscles: { primary: ['lats'], secondary: ['spine-erectors'] }, complexity: 1, loadable: false, stress: { spine: st(0, 1), knee: st(0, 3), ankle: st(0, 2) }, constraints: { floor: true }, role: 'stretch', tempoSecPerRep: 1, holdSec: 45 }],
  ['Alongamento de isquiotibiais (deitado)', 'Mobilidade', 'tempo', 'Perna estendida, joelho quase travado; use uma toalha/cinta', { pattern: 'mobility', muscles: { primary: ['hamstrings'], secondary: [] }, complexity: 1, loadable: false, stress: { spine: st(0, 1) }, constraints: { floor: true }, role: 'stretch', tempoSecPerRep: 1, holdSec: 30, perSide: true }],
  ['Alongamento de flexores de quadril (ajoelhado)', 'Mobilidade', 'tempo', 'Contrair o glúteo do lado alongado', { pattern: 'mobility', muscles: { primary: ['hip-flexors'], secondary: ['quads'] }, complexity: 1, loadable: false, stress: { knee: st(0, 3), hip: st(0, 2) }, constraints: { floor: true }, role: 'stretch', tempoSecPerRep: 1, holdSec: 40, perSide: true }],
  ['Figura 4 (glúteo)', 'Mobilidade', 'tempo', 'Tornozelo sobre o joelho oposto, puxe a coxa', { pattern: 'mobility', muscles: { primary: ['glutes'], secondary: ['piriformis'] }, complexity: 1, loadable: false, stress: { spine: st(0, 1), hip: st(0, 2) }, constraints: { floor: true }, role: 'stretch', tempoSecPerRep: 1, holdSec: 40, perSide: true }],
  ['Panturrilha na parede', 'Mobilidade', 'tempo', 'Calcanhar no chão, joelho da frente flexionado', { pattern: 'mobility', muscles: { primary: ['calves'], secondary: [] }, complexity: 1, loadable: false, stress: { ankle: st(0, 2) }, role: 'stretch', tempoSecPerRep: 1, holdSec: 30, perSide: true }],
  ['Peito na porta', 'Mobilidade', 'tempo', 'Antebraço no batente, rotação suave do tronco', { pattern: 'mobility', muscles: { primary: ['pecs'], secondary: ['front-delts'] }, complexity: 1, loadable: false, stress: { shoulder: st(0, 2) }, role: 'stretch', tempoSecPerRep: 1, holdSec: 30, perSide: true }],
  ['Anjo na parede', 'Mobilidade', 'tempo', 'Costas, cabeça e punhos encostados na parede', { pattern: 'mobility', muscles: { primary: ['mid-back', 'rear-delts'], secondary: [] }, complexity: 1, loadable: false, stress: { shoulder: st(0, 2) }, role: 'stretch', tempoSecPerRep: 2, holdSec: 5 }],
  ['Rotação torácica (quadrupedia)', 'Mobilidade', 'tempo', 'Uma mão atrás da cabeça, gire olhando o teto', { pattern: 'mobility', muscles: { primary: ['spine-erectors'], secondary: ['mid-back'] }, complexity: 1, loadable: false, stress: { spine: st(0, 2), wrist: st(1, 0) }, constraints: { floor: true }, role: 'stretch', tempoSecPerRep: 3, holdSec: 5, perSide: true }],
];

export async function seedExercises() {
  if ((await db.exercises.count()) === 0) {
    await db.exercises.bulkAdd(
      LIB.map((row, i) => {
        const [name, muscleGroup, mode, cues, tags] = row;
        return { id: `lib-${i}`, name, muscleGroup, mode, cues, ...(tags ?? {}) } satisfies Exercise;
      }),
    );
    return;
  }
  // Instalação existente: adiciona biblioteca que faltar (ex.: TRX entrou depois).
  const rows = await db.exercises.toArray();
  const namesInDb = new Set(rows.map((r) => r.name));
  const missing = LIB.map((row, i) => ({ row, i })).filter(({ row }) => !namesInDb.has(row[0]!));
  if (missing.length > 0) {
    await db.exercises.bulkAdd(
      missing.map(({ row, i }) => {
        const [name, muscleGroup, mode, cues, tags] = row;
        return { id: `lib-${i}`, name, muscleGroup, mode, cues, ...(tags ?? {}) } satisfies Exercise;
      }),
    );
  }
  // Backfill: exercícios já existentes recebem as tags do motor (idempotente).
  const byName = new Map(LIB.map((row) => [row[0], row[4]] as const));
  for (const r of rows) {
    if (r.pattern) continue;
    const tags = r.custom ? undefined : byName.get(r.name);
    if (tags) await db.exercises.update(r.id, tags as Partial<Exercise>);
  }
}

/** Regras lesão → limite de estresse, editáveis pelo treinador. */
export async function seedRules() {
  if ((await db.rules.count()) > 0) return;
  await db.rules.bulkAdd(RULES.map((r) => ({ ...r, prefer: [...r.prefer] })));
}
