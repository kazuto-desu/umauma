import type { CourseSample } from "./training";
import type { JockeyTendency, Race } from "./types";

// ブラウザに保存する。プライベートモードなどで使えなくても動作は続ける
function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 保存できなくても画面上の操作は続けられる */
  }
}

const CURRENT = "umauma.race";
const SAVED = "umauma.savedRaces";
const JOCKEYS = "umauma.jockeys";

export const loadCurrentRace = (fallback: Race) => read<Race>(CURRENT, fallback);
export const saveCurrentRace = (race: Race) => write(CURRENT, race);

export const loadSavedRaces = () => read<Race[]>(SAVED, []);

/** 一覧に保存する (同じ id があれば上書き)。保存後の一覧と、id 付きのレースを返す */
export function saveRace(race: Race): { list: Race[]; race: Race } {
  const withId = race.id ? race : { ...race, id: crypto.randomUUID() };
  const list = [withId, ...loadSavedRaces().filter((r) => r.id !== withId.id)];
  write(SAVED, list);
  return { list, race: withId };
}

export function deleteSavedRace(id: string): Race[] {
  const list = loadSavedRaces().filter((r) => r.id !== id);
  write(SAVED, list);
  return list;
}

export const loadJockeyNotes = () => read<Record<string, JockeyTendency>>(JOCKEYS, {});
export const saveJockeyNotes = (notes: Record<string, JockeyTendency>) => write(JOCKEYS, notes);

const COURSE_SAMPLES = "umauma.courseSamples";
const MAX_SAMPLES = 5000;

/** 調教コースごとの時計 (追い切りのキー → 時計)。読み込むたびに貯まっていく */
export const loadCourseSamples = () => read<Record<string, CourseSample>>(COURSE_SAMPLES, {});

export function addCourseSamples(add: Record<string, CourseSample>): Record<string, CourseSample> {
  const merged = { ...loadCourseSamples(), ...add };
  // 古いものから捨てて上限に収める (オブジェクトは追加順を保つ)
  const keys = Object.keys(merged);
  const trimmed = Object.fromEntries(keys.slice(Math.max(0, keys.length - MAX_SAMPLES)).map((k) => [k, merged[k]]));
  write(COURSE_SAMPLES, trimmed);
  return trimmed;
}

const PREFIX = "umauma.";

/** この端末に保存しているデータ (レース・騎手メモ・調教コースの時計など) をまとめて書き出す */
export function exportAll(): string {
  const data: Record<string, unknown> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) data[key] = JSON.parse(localStorage.getItem(key) ?? "null");
    }
  } catch {
    /* 読めない分は含めない */
  }
  return JSON.stringify({ app: "umauma", version: 1, exportedAt: new Date().toISOString(), data }, null, 1);
}

/**
 * 書き出したファイルから戻す。保存したレースは、今ある一覧と合わせる (同じレースはファイルの方で上書き)。
 * それ以外 (騎手メモ・調教コースの時計など) も今あるものと合わせる。
 */
export function importAll(json: string): { races: number } {
  const parsed = JSON.parse(json);
  if (parsed?.app !== "umauma" || typeof parsed.data !== "object") throw new Error("うまうま展開予想のバックアップファイルではありません");
  const data = parsed.data as Record<string, unknown>;
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith(PREFIX)) continue;
    if (key === SAVED && Array.isArray(value)) {
      const incoming = value as Race[];
      const ids = new Set(incoming.map((r) => r.id));
      write(SAVED, [...incoming, ...loadSavedRaces().filter((r) => !ids.has(r.id))]);
    } else if ((key === JOCKEYS || key === COURSE_SAMPLES) && value && typeof value === "object") {
      write(key, { ...read<Record<string, unknown>>(key, {}), ...(value as Record<string, unknown>) });
    } else {
      write(key, value);
    }
  }
  return { races: Array.isArray(data[SAVED]) ? (data[SAVED] as Race[]).length : 0 };
}
