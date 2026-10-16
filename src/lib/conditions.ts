import { classOf } from "./form";
import type { Horse, PastRace, Race } from "./types";

export interface ConditionTag {
  text: string;
  tone?: "good" | "bad";
}

/** 前走の日付 ("9/7" や "2026.09.07") を、今回の日付 ("2026-10-14") を手がかりに Date にする */
export function pastDate(date: string | undefined, today: string | undefined): Date | undefined {
  if (!date || !today) return undefined;
  const t = new Date(`${today}T00:00:00`);
  if (isNaN(t.getTime())) return undefined;
  const full = /(\d{4})[./年-](\d{1,2})[./月-](\d{1,2})/.exec(date);
  if (full) return new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3]));
  const md = /(\d{1,2})[/.月](\d{1,2})/.exec(date);
  if (!md) return undefined;
  const d = new Date(t.getFullYear(), Number(md[1]) - 1, Number(md[2]));
  // 今回より後の日付になったら前の年
  if (d > t) d.setFullYear(d.getFullYear() - 1);
  return d;
}

/** 前走からの間隔を「連闘」「中2週」「休み明け (4か月)」のように */
export function intervalOf(last: PastRace | undefined, today: string | undefined): ConditionTag | undefined {
  const d = pastDate(last?.date, today);
  if (!d) return undefined;
  const days = Math.round((new Date(`${today}T00:00:00`).getTime() - d.getTime()) / 86400000);
  if (days <= 0) return undefined;
  if (days <= 8) return { text: "連闘" };
  if (days >= 84) return { text: `休み明け (${Math.floor(days / 30)}か月)`, tone: "bad" };
  return { text: `中${Math.max(1, Math.floor(days / 7) - 1)}週` };
}

/**
 * 前走と比べた今回の条件 (斤量の増減・昇級/降級・距離の延長/短縮・間隔・乗り替わり)。
 * 良い・悪いは一般的な見方での目安 (斤量減・降級は良い、斤量増・昇級・長い休み明けは気になる)。
 */
export function conditionTags(h: Horse, race: Race): ConditionTag[] {
  const last = h.pastRaces[0];
  if (!last) return [{ text: "初出走" }];
  const tags: ConditionTag[] = [];

  if (h.carried && last.carried && h.carried !== last.carried) {
    const diff = Math.round((h.carried - last.carried) * 10) / 10;
    tags.push({ text: `斤量${diff > 0 ? "増" : "減"} (${diff > 0 ? "+" : ""}${diff}kg)`, tone: diff > 0 ? "bad" : "good" });
  }

  const today = classOf(race.raceClass || race.name, race.venue);
  const prev = h.pastRaces.find((r) => r.classLevel !== undefined);
  if (today && prev?.classLevel !== undefined) {
    if (today.level > prev.classLevel + 0.4) tags.push({ text: `昇級戦 (前走${prev.className ?? ""})`, tone: "bad" });
    else if (today.level < prev.classLevel - 0.4) tags.push({ text: `降級戦 (前走${prev.className ?? ""})`, tone: "good" });
  }

  if (race.distance && last.distance && Math.abs(race.distance - last.distance) >= 100) {
    const diff = race.distance - last.distance;
    tags.push({ text: `距離${diff > 0 ? "延長" : "短縮"} (${diff > 0 ? "+" : ""}${diff}m)` });
  }
  if (race.surface && last.surface && race.surface !== last.surface) tags.push({ text: `${last.surface}→${race.surface}` });

  const interval = intervalOf(last, race.date);
  if (interval) tags.push(interval);

  if (h.jockey && last.jockey && h.jockey !== last.jockey) tags.push({ text: `乗り替わり (前走 ${last.jockey})` });
  return tags;
}
