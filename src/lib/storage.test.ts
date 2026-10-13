import { beforeEach, describe, expect, it } from "vitest";
import { exportAll, importAll, loadJockeyNotes, loadSavedRaces, saveJockeyNotes, saveRace } from "./storage";

// テスト用のブラウザ保存領域の代わり
class MemoryStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

const race = (id: string, name: string) => ({ id, name, venue: "川崎", surface: "ダ" as const, distance: 900, horses: [] });

describe("バックアップ", () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  });

  it("書き出したものを別の端末に戻せる", () => {
    saveRace(race("a", "レースA"));
    saveJockeyNotes({ 騎手A: "積極" });
    const file = exportAll();

    (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
    expect(importAll(file)).toEqual({ races: 1 });
    expect(loadSavedRaces().map((r) => r.name)).toEqual(["レースA"]);
    expect(loadJockeyNotes()).toEqual({ 騎手A: "積極" });
  });

  it("戻すときは今あるデータと合わせる (同じレースはファイルの内容で上書き)", () => {
    saveRace(race("a", "レースA"));
    const file = exportAll();
    saveRace(race("b", "レースB"));
    saveRace(race("a", "レースA (書き換え後)"));
    saveJockeyNotes({ 騎手B: "控える" });

    importAll(file);
    expect(loadSavedRaces().map((r) => r.name).sort()).toEqual(["レースA", "レースB"]);
    expect(loadJockeyNotes()).toEqual({ 騎手B: "控える" });
  });

  it("違うファイルは受け付けない", () => {
    expect(() => importAll('{"hello":1}')).toThrow("バックアップファイルではありません");
  });
});
