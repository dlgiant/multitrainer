// On-device .ics generation (milestone 2, plan section 5 — "no backend").
// Pure string builder: repeating weekly event + alarm, RFC 5545 basics.
const CRLF = "\r\n";
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export interface IcsEvent {
  /** Id estável para o evento (mesma Uid não duplica na agenda do cliente). */
  uid: string;
  title: string;
  description?: string;
  /** Início local "YYYY-MM-DD HH:MM" (evento flutuante: sem fuso). */
  start: string;
  durationMin: number;
  /** Dias da semana JS (0=dom..6=sáb) em que o evento repete. */
  weekdays: number[];
  /** Número de ocorrências (default 12 = ~3 meses). */
  count?: number;
  /** Alarme em minutos antes (default 10; 0 = sem alarme). */
  alarmMin?: number;
}

/** Escapa texto iCalendar e dobra linhas com >74 octetos. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = line;
  while (cur.length > 74) {
    out.push(cur.slice(0, 73));
    cur = " " + cur.slice(73);
  }
  out.push(cur);
  return out.join(CRLF);
}

function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function stamp(local: string): string {
  // "2026-11-18 21:00" -> "20261118T210000"
  const [d, t] = local.split(" ");
  return `${d!.replace(/-/g, "")}T${(t ?? "21:00").replace(":", "")}00`;
}

function plusMinutes(local: string, minutes: number): string {
  const [d, t] = local.split(" ");
  const [y, m, day] = d!.split("-").map(Number);
  const [hh, mm] = (t ?? "21:00").split(":").map(Number);
  const end = new Date(Date.UTC(y!, (m! - 1), day!, hh!, mm!));
  end.setUTCMinutes(end.getUTCMinutes() + minutes);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${end.getUTCFullYear()}-${p(end.getUTCMonth() + 1)}-${p(end.getUTCDate())} ${p(end.getUTCHours())}:${p(end.getUTCMinutes())}`;
}

export function buildIcs(events: IcsEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MultiTrainer//Rotinas//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const ev of events) {
    const alarm = ev.alarmMin ?? 10;
    const byday = [...new Set(ev.weekdays)]
      .filter((d) => d >= 0 && d <= 6)
      .map((d) => DAYS[d]!)
      .sort()
      .join(",");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${esc(ev.uid)}`,
      `DTSTAMP:19700101T000000Z`, // determinístico: a Uid estabiliza reimportações
      `DTSTART:${stamp(ev.start)}`,
      `DTEND:${stamp(plusMinutes(ev.start, ev.durationMin))}`,
      `SUMMARY:${esc(ev.title)}`,
      ...(ev.description ? [`DESCRIPTION:${esc(ev.description)}`] : []),
      byday
        ? `RRULE:FREQ=WEEKLY;BYDAY=${byday};COUNT=${ev.count ?? 12}`
        : `RRULE:FREQ=WEEKLY;COUNT=${ev.count ?? 12}`,
      ...(alarm > 0
        ? ["BEGIN:VALARM", "ACTION:DISPLAY", `TRIGGER:-PT${alarm}M`, `DESCRIPTION:${esc(ev.title)}`, "END:VALARM"]
        : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join(CRLF) + CRLF;
}
