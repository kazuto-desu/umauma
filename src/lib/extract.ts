import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { frameOf } from "./frame";
import type { Race } from "./types";

const ExtractedSchema = z.object({
  race: z.object({
    name: z.string().nullable(),
    venue: z.string().nullable(),
    surface: z.enum(["芝", "ダ", "障"]).nullable(),
    distance: z.number().nullable(),
  }),
  horses: z.array(
    z.object({
      number: z.number().describe("今回の馬番"),
      frame: z.number().nullable().describe("今回の枠番"),
      name: z.string(),
      pastRaces: z
        .array(
          z.object({
            date: z.string().nullable(),
            venue: z.string().nullable(),
            surface: z.enum(["芝", "ダ", "障"]).nullable(),
            distance: z.number().nullable(),
            fieldSize: z.number().nullable().describe("そのレースの出走頭数"),
            passing: z.array(z.number()).describe("コーナー通過順。例: 3-3-2-1 なら [3,3,2,1]"),
            finish: z.number().nullable().describe("着順"),
          }),
        )
        .describe("新しい順"),
    }),
  ),
});

const PROMPT = `添付は競馬の出馬表・馬柱 (出走馬の過去成績) の画像です。
画像から読み取れる情報を構造化してください。

- horses には今回の出走馬を馬番順にすべて入れてください。
- pastRaces は各馬の過去走を新しい順に。passing はコーナー通過順 (例 "3-3-2-1" → [3,3,2,1])。
- 通過順が読めない過去走 (取消・中止など) は省いてください。
- 頭数は「16頭」「16ト」などの表記から読み取ってください。読めなければ null。
- 推測で値を作らないでください。読めない項目は null にしてください。
- 複数画像がある場合は同じレースの続きとして統合してください。`;

export interface ExtractImage {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  base64: string;
}

export async function extractRaceFromImages(apiKey: string, images: ExtractImage[]): Promise<Race> {
  // 個人利用前提: APIキーはブラウザに保存し、ブラウザから直接 API を呼ぶ
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const stream = client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: betaZodOutputFormat(ExtractedSchema) },
    messages: [
      {
        role: "user",
        content: [
          ...images.map((img) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
          })),
          { type: "text" as const, text: PROMPT },
        ],
      },
    ],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error("画像の読み取りを断られました。別の画像で試してください。");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("出力が長すぎて途中で切れました。画像を分けて読み込んでください。");
  }
  const data = message.parsed_output;
  if (!data) throw new Error("読み取り結果を解析できませんでした。");

  const fieldSize = data.horses.length;
  return {
    name: data.race.name ?? "",
    venue: data.race.venue ?? "",
    surface: data.race.surface ?? "芝",
    distance: data.race.distance ?? 0,
    horses: data.horses
      .map((h) => ({
        number: h.number,
        frame: h.frame ?? frameOf(h.number, fieldSize),
        name: h.name,
        pastRaces: h.pastRaces.map((r) => ({
          date: r.date ?? undefined,
          venue: r.venue ?? undefined,
          surface: r.surface ?? undefined,
          distance: r.distance ?? undefined,
          fieldSize: r.fieldSize ?? undefined,
          passing: r.passing.filter((n) => n > 0),
          finish: r.finish ?? undefined,
        })),
      }))
      .sort((a, b) => a.number - b.number),
  };
}

/** 画像を API に送りやすいサイズ (長辺2000px以下の JPEG) に縮小する */
export async function fileToImage(file: File): Promise<ExtractImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  return { mediaType: "image/jpeg", base64: dataUrl.split(",")[1] };
}
