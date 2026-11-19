// Seed de demonstração: 5 clientes completos (perfil, objetivo estruturado,
// avaliação, equipamento, lesões estruturadas e treinos) para testar o motor.
// Ids fixos ("demo-*"): rodar de novo apenas atualiza, não duplica.
import { db, uid, type Assessment, type Client, type Equipment, type InjuryRecord, type Workout, type WorkoutItem } from './db';

const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);

type Injury = Omit<InjuryRecord, 'id' | 'clientId' | 'createdAt'>;

interface Persona {
  client: Omit<Client, 'id' | 'createdAt'>;
  assessment: Omit<Assessment, 'id' | 'clientId' | 'createdAt'>;
  equipment: { name: string; weights: number[] }[];
  injuries: Injury[];
  workouts: { name: string; notes?: string; items: Omit<WorkoutItem, 'key'>[] }[];
}

const item = (
  exerciseId: string,
  sets: number,
  reps: number,
  restSec: number,
  extra: Partial<WorkoutItem> = {},
): Omit<WorkoutItem, 'key'> => ({ exerciseId, sets, reps, restSec, ...extra });

const PERSONAS: Record<string, Persona> = {
  'demo-ana': {
    client: {
      name: 'Ana Martins',
      phone: '+55 11 98888-0001',
      address: 'Ap. 72 — Vila Madalena, SP',
      birthDate: '1990-04-12',
      goals: 'Melhorar condicionamento geral sem sobrecarregar a lombar',
      goal: { primary: 'general-fitness', target: 'sair da dor e ganhar disposição' },
      notes: 'Prédio sem elevador, não pode fazer barulho depois das 22h',
    },
    assessment: {
      date: iso(10),
      fitnessLevel: 'iniciante',
      weightKg: 68,
      heightCm: 165,
      bodyFatPct: 31,
      waistCm: 82,
      restingHr: 74,
      bloodPressure: '12/8',
      injuries: 'Hérnia de disco L5-S1 (nota: usar ficha estruturada)',
      notes: 'Boa mobilidade de quadril; flexão lombar limitada',
    },
    equipment: [
      { name: 'Par de halteres 2–12 kg', weights: [2, 4, 6, 8, 10, 12] },
      { name: 'Banco ajustável', weights: [] },
    ],
    injuries: [
      {
        region: 'spine',
        condition: 'lumbar-disc',
        severity: 2,
        status: 'chronic',
        painMoves: ['flexão de tronco sob carga', 'abdominal crunch'],
        notes: 'Fisio liberou treino de força com carga leve; evitar flexão lombar sob carga',
        reviewAt: iso(-45),
      },
    ],
    workouts: [
      {
        name: 'Full body A',
        notes: 'Sem saltos (apartamento). Terça e sexta.',
        items: [
          item('lib-1', 3, 12, 90, { weightKg: 8, targetRir: 3, reason: { id: 'injury-primer', params: { note: 'regra lombar' } } }),
          item('lib-5', 3, 12, 90, { weightKg: 10, targetRir: 3 }),
          item('lib-11', 3, 12, 75, { weightKg: 6, targetRir: 3 }),
          item('lib-17', 3, 12, 75, { weightKg: 8, targetRir: 3 }),
          item('lib-25', 3, 10, 45, { targetRir: 4 }),
        ],
      },
      {
        name: 'Full body B',
        notes: 'Alternar com A. Sem saltos.',
        items: [
          item('lib-2', 3, 10, 90, { weightKg: 6, targetRir: 3 }),
          item('lib-6', 3, 10, 90, { targetRir: 3 }),
          item('lib-9', 3, 8, 75, { targetRir: 3 }),
          item('lib-18', 3, 12, 60, { targetRir: 3 }),
          item('lib-23', 3, 30, 45, { targetRir: 4, durationSec: 30, reps: undefined }),
        ],
      },
    ],
  },

  'demo-bruno': {
    client: {
      name: 'Bruno Costa',
      phone: '+55 11 98888-0002',
      address: 'Casa — Tatuapé, SP',
      birthDate: '1994-09-30',
      goals: 'Hipertrofia: +2 kg de massa magra até março',
      goal: { primary: 'hypertrophy', target: '+2 kg massa magra', targetDate: '2027-03-01' },
      notes: 'Treina há 2 anos; gosta de remada, não gosta de afundo',
    },
    assessment: {
      date: iso(7),
      fitnessLevel: 'intermediario',
      weightKg: 78,
      heightCm: 179,
      bodyFatPct: 18,
      waistCm: 84,
      restingHr: 62,
      bloodPressure: '12/7',
      notes: 'Boa técnica nos básicos; quer foco em peito e costas',
    },
    equipment: [
      { name: 'Halteres 10–25 kg', weights: [10, 12.5, 15, 17.5, 20, 22.5, 25] },
      { name: 'Banco ajustável', weights: [] },
    ],
    injuries: [],
    workouts: [
      {
        name: 'Superior A',
        items: [
          item('lib-11', 4, 10, 120, { weightKg: 22.5, targetRir: 2 }),
          item('lib-17', 4, 10, 105, { weightKg: 20, targetRir: 2, pinned: true }),
          item('lib-12', 3, 10, 90, { weightKg: 15, targetRir: 2 }),
          item('lib-21', 3, 12, 60, { weightKg: 12.5, targetRir: 1 }),
          item('lib-15', 3, 12, 60, { weightKg: 10, targetRir: 1 }),
        ],
      },
      {
        name: 'Inferior A',
        items: [
          item('lib-1', 4, 10, 120, { weightKg: 22.5, targetRir: 2 }),
          item('lib-4', 4, 10, 105, { weightKg: 20, targetRir: 2 }),
          item('lib-3', 3, 10, 90, { weightKg: 15, targetRir: 2 }),
          item('lib-7', 3, 15, 60, { weightKg: 20, targetRir: 1 }),
          item('lib-22', 3, 40, 60, { targetRir: 2, durationSec: 40, reps: undefined }),
        ],
      },
    ],
  },

  'demo-carla': {
    client: {
      name: 'Carla Ribeiro',
      phone: '+55 11 98888-0003',
      address: 'Ap. térreo — Santana, SP',
      birthDate: '1958-01-22',
      goals: 'Mobilidade e força geral; artrose nos dois joelhos',
      goal: { primary: 'mobility-rehab', target: 'subir escada sem dor' },
      notes: '68 anos, mora sozinha; filha acompanha por WhatsApp',
    },
    assessment: {
      date: iso(14),
      fitnessLevel: 'iniciante',
      weightKg: 71,
      heightCm: 158,
      bodyFatPct: 40,
      waistCm: 98,
      restingHr: 70,
      bloodPressure: '13/8',
      injuries: 'Artrose patelofemoral bilateral (usar ficha estruturada)',
      notes: 'Equilíbrio bom em apoio unipodal; senta/levanta com apoio das mãos',
    },
    equipment: [{ name: 'Kit de elásticos (3 tensões)', weights: [] }],
    injuries: [
      {
        region: 'knee',
        condition: 'patellofemoral',
        severity: 1,
        status: 'chronic',
        painMoves: ['agachamento profundo', 'subir escada'],
        notes: 'Sem dor em cadeira isométrica; alongar quadricípite e posterior',
        reviewAt: iso(-30),
      },
    ],
    workouts: [
      {
        name: 'Mobilidade + força (45 min)',
        notes: 'Sem impacto. Segunda e quinta, 10h.',
        items: [
          item('lib-32', 1, 120, 0, { targetRir: 4, durationSec: 120, reps: undefined }),
          item('lib-8', 3, 40, 60, { targetRir: 4, durationSec: 40, reps: undefined }),
          item('lib-18', 3, 12, 60, { targetRir: 3 }),
          item('lib-24', 2, 12, 45, { targetRir: 4 }),
          item('lib-26', 2, 8, 45, { targetRir: 4 }),
        ],
      },
    ],
  },

  'demo-diego': {
    client: {
      name: 'Diego Alves',
      phone: '+55 11 98888-0004',
      address: 'Casa — Santo André, SP',
      birthDate: '1997-06-05',
      goals: 'Força nos básicos; ombro em recuperação',
      goal: { primary: 'strength', target: 'elevação pélvica 100 kg' },
      notes: 'Fisioterapia 2×/semana para o ombro',
    },
    assessment: {
      date: iso(3),
      fitnessLevel: 'intermediario',
      weightKg: 85,
      heightCm: 182,
      bodyFatPct: 20,
      restingHr: 58,
      bloodPressure: '12/8',
      injuries: 'Impacto no ombro direito, agudo desde semana passada',
      notes: 'Sem dor em remada unilateral; dor acima de 90° de elevação',
    },
    equipment: [
      { name: 'Par de halteres 5–20 kg', weights: [5, 7.5, 10, 12.5, 15, 17.5, 20] },
      { name: 'Banco plano', weights: [] },
    ],
    injuries: [
      {
        region: 'shoulder',
        condition: 'shoulder-impingement',
        severity: 2,
        status: 'acute',
        painMoves: ['desenvolvimento acima da cabeça', 'flexão acima de 90°'],
        notes: 'Fisio autorizou treino de pernas e puxada; sem empurrar acima da cabeça até reavaliação',
        reviewAt: iso(-14),
      },
    ],
    workouts: [
      {
        name: 'Inferior (ombro poupado)',
        notes: 'Porta do motor: gerar plano bloqueado até liberação — treino manual.',
        items: [
          item('lib-4', 4, 8, 150, { weightKg: 17.5, targetRir: 2 }),
          item('lib-5', 4, 10, 120, { weightKg: 20, targetRir: 2 }),
          item('lib-7', 3, 15, 60, { weightKg: 17.5, targetRir: 1 }),
          item('lib-24', 2, 40, 45, { targetRir: 2, durationSec: 40, reps: undefined }),
        ],
      },
    ],
  },

  'demo-marina': {
    client: {
      name: 'Marina Lopes',
      phone: '+55 11 98888-0005',
      address: 'Ap. 301 — Pinheiros, SP',
      birthDate: '1988-11-18',
      goals: 'Perda de gordura: −4 kg até o verão, sem acordar os vizinhos',
      goal: { primary: 'fat-loss', target: '−4 kg', targetDate: '2027-01-15' },
      notes: 'Sessões de 50 min antes do trabalho; joelho liberado em agosto',
    },
    assessment: {
      date: iso(21),
      fitnessLevel: 'intermediario',
      weightKg: 64,
      heightCm: 167,
      bodyFatPct: 29,
      waistCm: 78,
      restingHr: 68,
      bloodPressure: '11/7',
      notes: 'Gosta de circuito; dispneia leve no step-up',
    },
    equipment: [
      { name: 'Halteres 4–16 kg', weights: [4, 6, 8, 10, 12, 14, 16] },
      { name: 'Elástico de resistência média', weights: [] },
    ],
    injuries: [
      {
        region: 'knee',
        condition: 'patellofemoral',
        severity: 1,
        status: 'cleared',
        clearedAt: iso(60),
        notes: 'Dor patelofemoral antiga; liberada em agosto, sem queixa desde então',
      },
    ],
    workouts: [
      {
        name: 'Circuito A (50 min)',
        notes: 'Sem saltos (apartamento). Finalizador: corrida estacionária.',
        items: [
          item('lib-6', 3, 10, 60, { weightKg: 8, targetRir: 2 }),
          item('lib-17', 3, 12, 60, { weightKg: 10, targetRir: 2 }),
          item('lib-11', 3, 12, 60, { weightKg: 8, targetRir: 2 }),
          item('lib-5', 3, 15, 60, { weightKg: 12, targetRir: 2 }),
          item('lib-27', 3, 30, 45, { targetRir: 3, durationSec: 30, reps: undefined }),
        ],
      },
    ],
  },
};

/** Popula 5 clientes completos de demonstração. Idempotente (ids fixos). */
export async function seedDemoClients(): Promise<string[]> {
  const ids: string[] = [];
  await db.transaction(
    'rw',
    [db.clients, db.assessments, db.equipment, db.injuries, db.workouts],
    async () => {
      for (const [clientId, p] of Object.entries(PERSONAS)) {
        ids.push(clientId);
        const client: Client = { ...p.client, id: clientId, createdAt: Date.now() - 90 * DAY };
        await db.clients.put(client);

        await db.assessments.put({
          ...p.assessment,
          id: `${clientId}-assessment`,
          clientId,
          createdAt: Date.now() - 90 * DAY,
        });

        // equipamento: reaproveita os "demo-*" e limpa os antigos do cliente
        await db.equipment.where('clientId').equals(clientId).delete();
        for (const eq of p.equipment) {
          const e: Equipment = { id: uid(), clientId, name: eq.name, weights: eq.weights, createdAt: Date.now() };
          await db.equipment.add(e);
        }

        await db.injuries.where('clientId').equals(clientId).delete();
        for (const inj of p.injuries) {
          const rec: InjuryRecord = { ...inj, id: uid(), clientId, createdAt: Date.now() };
          await db.injuries.add(rec);
        }

        // treinos: substitui os treinos "demo" anteriores deste cliente
        const old = await db.workouts.where('clientId').equals(clientId).toArray();
        for (const w of old) if (w.id.startsWith(`${clientId}-`)) await db.workouts.delete(w.id);
        for (const [i, w] of p.workouts.entries()) {
          const workout: Workout = {
            id: `${clientId}-w${i}`,
            clientId,
            name: w.name,
            notes: w.notes,
            items: w.items.map((it) => ({ ...it, key: uid() })),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          await db.workouts.put(workout);
        }
      }
    },
  );
  return ids;
}

export const DEMO_CLIENT_NAMES = Object.values(PERSONAS).map((p) => p.client.name);
