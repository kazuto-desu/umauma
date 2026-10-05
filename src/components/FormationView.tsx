import { useRef } from "react";
import { frameColor } from "../lib/frame";
import { toNotation } from "../lib/predict";
import type { Placement } from "../lib/types";

const UNIT = 34; // 1馬身あたりの px
const LANE_H = 36;
const R = 15;
const PAD_X = 70;
const PAD_TOP = 46;

interface Props {
  label: string; // カード見出し (例: 1コーナー)
  title: string; // 画像内に入れるタイトル
  placements: Placement[];
}

export function FormationView({ label, title, placements }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const maxX = Math.max(0, ...placements.map((p) => p.x));
  const maxLane = Math.max(2, ...placements.map((p) => p.lane));
  const width = Math.max(560, PAD_X * 2 + maxX * UNIT);
  const height = PAD_TOP + (maxLane + 1) * LANE_H + 34;
  const notation = toNotation(placements);

  return (
    <section className="card formation">
      <div className="formation-head">
        <h3>{label}</h3>
        <button onClick={() => svgRef.current && downloadPng(svgRef.current, title)}>画像で保存</button>
      </div>
      <div className="formation-scroll">
        <svg
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fontFamily="'Hiragino Sans','Noto Sans JP',sans-serif"
        >
          <rect width={width} height={height} fill="#3f8f3a" />
          <text x={12} y={22} fill="#fff" fontSize={15} fontWeight="bold">
            {title}
          </text>
          <text x={width - 12} y={22} fill="#fff" fontSize={13} textAnchor="end">
            ← 進行方向
          </text>
          {/* 内ラチ */}
          <line x1={0} x2={width} y1={PAD_TOP - 8} y2={PAD_TOP - 8} stroke="#fff" strokeWidth={4} />
          <text x={8} y={PAD_TOP + 10} fill="#e8f5e3" fontSize={11}>
            内
          </text>
          <text x={8} y={height - 12} fill="#e8f5e3" fontSize={11}>
            外
          </text>
          {placements.map((p) => {
            const c = frameColor(p.frame);
            const cx = PAD_X + p.x * UNIT;
            const cy = PAD_TOP + p.lane * LANE_H + LANE_H / 2;
            return (
              <g key={p.number}>
                <title>{`${p.number} ${p.name}`}</title>
                <circle cx={cx} cy={cy} r={R} fill={c.bg} stroke="#111" strokeWidth={1.5} />
                <text x={cx} y={cy + 5} fill={c.fg} fontSize={15} fontWeight="bold" textAnchor="middle">
                  {p.number}
                </text>
              </g>
            );
          })}
          <text x={width / 2} y={height - 10} fill="#fff" fontSize={14} textAnchor="middle">
            {notation}
          </text>
        </svg>
      </div>
    </section>
  );
}

function downloadPng(svg: SVGSVGElement, title: string) {
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  const scale = 2;
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = svg.width.baseVal.value * scale;
    canvas.height = svg.height.baseVal.value * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${title}.png`;
    a.click();
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
}
