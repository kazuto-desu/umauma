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
