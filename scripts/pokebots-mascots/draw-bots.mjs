// Draws the felt bots of the avatar editor's Pokebots mascots as SVG files, one per entry of BOTS.
// Usage: node draw-bots.mjs <workdir>/svg [name...], then ./render.sh <workdir> for the webp files.
// Copy the chosen <workdir>/out/bot-<name>.webp files to packages/ui/src/features/agents/assets/pokebots/
// and list them in packages/ui/src/features/agents/pokebots-mascots.ts.
import { mkdirSync, writeFileSync } from "node:fs";

const out = process.argv[2] ?? "svg";
const only = new Set(process.argv.slice(3));
mkdirSync(out, { recursive: true });

// ---- colour helpers ----
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) =>
  `#${c
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
const light = (c, t) => mix(c, "#ffffff", t);
const dark = (c, t) => mix(c, "#1a1030", t);

// ---- body shapes: path, top of head, eye line, has arms ----
function starPath(cx, cy, ro, ri) {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? ri : ro;
    p.push(`${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${p.join(" L")}Z`;
}
const SHAPES = {
  round: {
    d: "M192 96 C252 96 296 142 296 206 C296 272 252 318 192 318 C132 318 88 272 88 206 C88 142 132 96 192 96Z",
    top: 96,
    eye: 186,
    armY: 232,
    width: 104,
  },
  bean: {
    d: "M192 80 C258 80 294 146 294 212 C294 282 254 320 192 320 C130 320 90 282 90 212 C90 146 126 80 192 80Z",
    top: 80,
    eye: 176,
    armY: 236,
    width: 102,
  },
  pear: {
    d: "M192 96 C230 96 248 128 256 160 C298 186 304 248 290 284 C276 316 236 322 192 322 C148 322 108 316 94 284 C80 248 86 186 128 160 C136 128 154 96 192 96Z",
    top: 96,
    eye: 180,
    armY: 246,
    width: 100,
  },
  square: {
    d: "M162 100 L222 100 C268 100 292 124 292 170 L292 262 C292 300 268 318 230 318 L154 318 C116 318 92 300 92 262 L92 170 C92 124 116 100 162 100Z",
    top: 100,
    eye: 184,
    armY: 236,
    width: 100,
  },
  blob: {
    d: "M192 88 C255 88 296 130 300 195 C304 262 290 320 232 322 C212 323 202 312 192 312 C182 312 172 323 152 322 C94 320 80 262 84 195 C88 130 129 88 192 88Z",
    top: 88,
    eye: 178,
    armY: 238,
    width: 108,
  },
  cloud: {
    d: "M192 82 C230 82 252 104 256 136 C290 136 312 162 306 196 C328 214 326 262 296 280 C292 308 262 324 232 318 C216 330 168 330 152 318 C122 324 92 308 88 280 C58 262 56 214 78 196 C72 162 94 136 128 136 C132 104 154 82 192 82Z",
    top: 82,
    eye: 190,
    armY: 242,
    width: 112,
  },
  star: { d: starPath(192, 214, 132, 74), top: 82, eye: 196, armY: 0, width: 96, star: true },
};

// ---- face ----
function eyes(s, kind = "open") {
  const y = s.eye;
  const xs = [162, 222];
  if (kind === "closed")
    return xs
      .map(
        (x) =>
          `<path d="M${x - 13} ${y + 2} Q${x} ${y + 12} ${x + 13} ${y + 2}" fill="none" stroke="#1d1a2a" stroke-width="5.5" stroke-linecap="round"/>`,
      )
      .join("");
  return xs
    .map(
      (x) => `<ellipse cx="${x}" cy="${y}" rx="13" ry="16" fill="#1d1a2a"/>
<ellipse cx="${x - 4}" cy="${y - 6}" rx="5" ry="5.5" fill="#fff"/>
<circle cx="${x + 5}" cy="${y + 5}" r="2.2" fill="#fff" opacity=".85"/>`,
    )
    .join("");
}
function mouth(s, kind = "smile") {
  const y = s.eye + 28;
  if (kind === "tongue")
    return `<path d="M180 ${y} Q192 ${y + 10} 204 ${y}" fill="none" stroke="#1d1a2a" stroke-width="5" stroke-linecap="round"/><ellipse cx="200" cy="${y + 7}" rx="6" ry="5" fill="#f07a8f"/>`;
  if (kind === "o") return `<ellipse cx="192" cy="${y + 3}" rx="6" ry="7" fill="#1d1a2a"/>`;
  return `<path d="M180 ${y} Q192 ${y + 11} 204 ${y}" fill="none" stroke="#1d1a2a" stroke-width="5" stroke-linecap="round"/>`;
}
const cheeks = (s) =>
  `<g filter="url(#soft)" opacity=".55"><ellipse cx="138" cy="${s.eye + 22}" rx="15" ry="9" fill="#ff8fb0"/><ellipse cx="246" cy="${s.eye + 22}" rx="15" ry="9" fill="#ff8fb0"/></g>`;

// ---- small parts ----
const hands = (c, pts) =>
  pts
    .map(
      ([x, y]) =>
        `<ellipse cx="${x + 2}" cy="${y + 5}" rx="17" ry="15" fill="#1a1030" opacity=".22" filter="url(#soft)"/><circle cx="${x}" cy="${y}" r="17" fill="${dark(c, 0.1)}" filter="url(#fuzz)"/>`,
    )
    .join("");
const felt = (inner, id = "felt2") => `<g filter="url(#${id})">${inner}</g>`;

// ---- accessories: each returns {back, front} SVG ----
const A = {
  chef: (s0, c) => {
    const s = { ...s0, top: s0.top + 16 };
    return {
      front:
        felt(`<rect x="146" y="${s.top - 18}" width="92" height="30" rx="8" fill="#f4f1ea"/>
<circle cx="160" cy="${s.top - 34}" r="24" fill="#fbf9f4"/><circle cx="192" cy="${s.top - 48}" r="28" fill="#fdfcf8"/><circle cx="224" cy="${s.top - 34}" r="24" fill="#fbf9f4"/>
<rect x="146" y="${s.top - 2}" width="92" height="6" rx="3" fill="#e2ddd2"/>`) +
        felt(
          `<g transform="rotate(24 236 276)"><rect x="230" y="200" width="12" height="90" rx="6" fill="#c98a4b"/><ellipse cx="236" cy="196" rx="19" ry="25" fill="#d89a5a"/><ellipse cx="236" cy="196" rx="11" ry="16" fill="#c07f42"/></g>`,
        ) +
        hands(dark(c, 0.12), [[236, 278]]),
    };
  },
  writer: (s, c) => ({
    front:
      felt(`<rect x="146" y="238" width="78" height="64" rx="8" fill="#5d67ee"/><rect x="150" y="242" width="70" height="56" rx="6" fill="#fdfbf5"/>
<g stroke="#c9c4e8" stroke-width="3" stroke-linecap="round"><line x1="160" y1="256" x2="210" y2="256"/><line x1="160" y1="268" x2="210" y2="268"/><line x1="160" y1="280" x2="196" y2="280"/></g>
<rect x="146" y="238" width="8" height="64" rx="3" fill="#4b55d6"/>`) +
      felt(
        `<g transform="rotate(32 246 230)"><path d="M246 160 C266 182 268 222 248 262 C230 222 228 182 246 160Z" fill="#fffaf0"/><path d="M246 168 L248 278" stroke="#d8c9a8" stroke-width="3"/><path d="M247 262 L248 282" stroke="#3a3350" stroke-width="4" stroke-linecap="round"/></g>`,
      ) +
      hands(dark(c, 0.12), [
        [150, 270],
        [246, 262],
      ]),
  }),
  analyst: (s, c) => ({
    front:
      felt(`<rect x="132" y="228" width="120" height="82" rx="10" fill="#fdfbf5" stroke="#e1dccd" stroke-width="4"/>
<rect x="150" y="270" width="18" height="28" rx="4" fill="#5cc79e"/><rect x="176" y="254" width="18" height="44" rx="4" fill="#f5b83d"/><rect x="202" y="240" width="18" height="58" rx="4" fill="#f2706a"/>
<line x1="144" y1="300" x2="236" y2="300" stroke="#bdb6a6" stroke-width="3" stroke-linecap="round"/>`) +
      hands(dark(c, 0.12), [
        [132, 270],
        [252, 270],
      ]),
  }),
  finance: (s, c) => ({
    front:
      felt(`<circle cx="192" cy="266" r="46" fill="#f2b630"/><circle cx="192" cy="266" r="36" fill="#f8cb4f"/><circle cx="192" cy="266" r="36" fill="none" stroke="#e3a623" stroke-width="3" stroke-dasharray="4 5"/>
<text x="192" y="284" text-anchor="middle" font-family="Arial Rounded MT Bold, Helvetica, sans-serif" font-weight="800" font-size="48" fill="#d4951a">$</text>
<ellipse cx="176" cy="246" rx="10" ry="6" fill="#fff" opacity=".5"/>`) +
      hands(dark(c, 0.12), [
        [146, 266],
        [238, 266],
      ]),
  }),
  legal: (s, c) => ({
    face: `<g fill="none" stroke="#1f2a5c" stroke-width="7"><circle cx="162" cy="${s.eye}" r="24"/><circle cx="222" cy="${s.eye}" r="24"/><path d="M186 ${s.eye} Q192 ${s.eye - 6} 198 ${s.eye}"/></g><g fill="#fff" opacity=".18"><circle cx="162" cy="${s.eye}" r="21"/><circle cx="222" cy="${s.eye}" r="21"/></g>`,
    front:
      felt(`<g transform="rotate(-12 192 272)"><rect x="140" y="254" width="104" height="36" fill="#f6ecd3"/><rect x="130" y="250" width="16" height="44" rx="8" fill="#e9dbb8"/><rect x="238" y="250" width="16" height="44" rx="8" fill="#e9dbb8"/>
<rect x="184" y="252" width="14" height="40" fill="#e0525c"/><path d="M186 292 L180 314 L190 306 L196 314 L196 292Z" fill="#c9434d"/></g>`) +
      hands(dark(c, 0.12), [
        [140, 276],
        [244, 266],
      ]),
  }),
  teacher: (s, c) => ({
    front:
      felt(`<path d="M150 ${s.top + 4} Q192 ${s.top - 6} 234 ${s.top + 4} L234 ${s.top - 22} L150 ${s.top - 22}Z" fill="#2b2838"/>
<path d="M192 ${s.top - 52} L270 ${s.top - 30} L192 ${s.top - 8} L114 ${s.top - 30}Z" fill="#363247"/><circle cx="192" cy="${s.top - 30}" r="5" fill="#f5b83d"/>
<path d="M192 ${s.top - 30} Q238 ${s.top - 28} 252 ${s.top - 22} L254 ${s.top + 14}" fill="none" stroke="#f5b83d" stroke-width="4"/><rect x="248" y="${s.top + 10}" width="12" height="22" rx="4" fill="#f5b83d"/>`),
  }),
  scientist: (s0, c) => {
    const s = { ...s0, top: s0.top + 18 };
    return {
      front:
        felt(`<path d="M${192 - s.width + 10} ${s.top + 40} Q192 ${s.top + 14} ${192 + s.width - 10} ${s.top + 40}" fill="none" stroke="#3b3550" stroke-width="10"/>
<circle cx="165" cy="${s.top + 28}" r="22" fill="#9fdcef" stroke="#3b3550" stroke-width="7"/><circle cx="219" cy="${s.top + 28}" r="22" fill="#9fdcef" stroke="#3b3550" stroke-width="7"/>
<ellipse cx="159" cy="${s.top + 22}" rx="7" ry="5" fill="#fff" opacity=".8"/><ellipse cx="213" cy="${s.top + 22}" rx="7" ry="5" fill="#fff" opacity=".8"/>`) +
        felt(`<path d="M182 236 L202 236 L202 254 L230 300 C234 308 228 314 220 314 L164 314 C156 314 150 308 154 300 L182 254Z" fill="#eaf6fb" opacity=".95"/>
<path d="M166 284 L218 284 L230 302 C233 308 228 312 220 312 L164 312 C156 312 151 308 154 302Z" fill="#7ad26a"/><rect x="178" y="228" width="28" height="10" rx="4" fill="#cfe7f1"/>
<circle cx="184" cy="298" r="4" fill="#b4f0a6"/><circle cx="200" cy="292" r="3" fill="#b4f0a6"/>`) +
        hands(dark(c, 0.12), [
          [156, 290],
          [228, 290],
        ]),
    };
  },
  musician: (s, c) => ({
    front:
      felt(`<g transform="rotate(-35 192 262)"><rect x="185" y="160" width="14" height="80" rx="4" fill="#8a5a33"/><rect x="181" y="148" width="22" height="20" rx="5" fill="#6e4426"/>
<circle cx="192" cy="252" r="30" fill="#e3a865"/><circle cx="192" cy="288" r="36" fill="#e3a865"/><circle cx="192" cy="262" r="10" fill="#5a3a22"/><rect x="178" y="296" width="28" height="7" rx="3" fill="#8a5a33"/>
<g stroke="#f6eddc" stroke-width="1.5"><line x1="189" y1="160" x2="189" y2="300"/><line x1="195" y1="160" x2="195" y2="300"/></g></g>`) +
      hands(dark(c, 0.12), [
        [148, 262],
        [226, 290],
      ]),
  }),
  photographer: (s, c) => ({
    front:
      `<path d="M136 ${s.eye + 50} Q150 262 160 258 M248 ${s.eye + 50} Q234 262 224 258" fill="none" stroke="#3a3350" stroke-width="6"/>` +
      felt(`<rect x="146" y="246" width="92" height="62" rx="12" fill="#3a3a48"/><rect x="160" y="236" width="28" height="14" rx="4" fill="#4a4a5a"/>
<circle cx="192" cy="278" r="24" fill="#22222c"/><circle cx="192" cy="278" r="16" fill="#3b5fa8"/><circle cx="186" cy="272" r="5" fill="#cfe0ff" opacity=".8"/>
<circle cx="224" cy="258" r="5" fill="#f2706a"/><rect x="146" y="262" width="92" height="6" fill="#b8a07a"/>`),
  }),
  gardener: (s, c) => ({
    front:
      felt(
        `<ellipse cx="192" cy="${s.top + 6}" rx="${s.width + 22}" ry="22" fill="#e8c57a"/><path d="M140 ${s.top + 6} C140 ${s.top - 46} 244 ${s.top - 46} 244 ${s.top + 6}Z" fill="#f0d189"/>
<path d="M141 ${s.top - 6} Q192 ${s.top + 2} 243 ${s.top - 6} L244 ${s.top + 6} Q192 ${s.top + 14} 140 ${s.top + 6}Z" fill="#e0525c"/>`,
        "straw",
      ) +
      felt(`<path d="M164 254 L222 254 L228 308 L158 308Z" fill="#4fa3b5"/><path d="M222 266 L262 236 L268 244 L228 282Z" fill="#4fa3b5"/><ellipse cx="266" cy="238" rx="9" ry="6" fill="#3d8b9c"/>
<path d="M170 254 Q192 222 214 254" fill="none" stroke="#3d8b9c" stroke-width="7"/><g fill="#9fdcef"><circle cx="276" cy="250" r="3"/><circle cx="282" cy="262" r="3"/><circle cx="274" cy="268" r="2.5"/></g>`) +
      hands(dark(c, 0.12), [
        [160, 282],
        [226, 290],
      ]),
  }),
  astronaut: (s, c) => ({
    back: "",
    front:
      felt(
        `<path d="M120 ${s.eye + 70} Q192 ${s.eye + 98} 264 ${s.eye + 70} L268 ${s.eye + 88} Q192 ${s.eye + 118} 116 ${s.eye + 88}Z" fill="#eef0f6"/><circle cx="160" cy="${s.eye + 92}" r="5" fill="#f2706a"/><circle cx="176" cy="${s.eye + 96}" r="5" fill="#5cc79e"/>`,
      ) +
      `<circle cx="192" cy="${s.eye - 4}" r="108" fill="#d9eeff" fill-opacity=".2" stroke="#f4f8ff" stroke-width="9" stroke-opacity=".95"/><circle cx="192" cy="${s.eye - 4}" r="112" fill="none" stroke="#b9c3d8" stroke-width="3" stroke-opacity=".8"/>
<path d="M120 ${s.eye - 40} A80 80 0 0 1 176 ${s.eye - 88}" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".8"/><circle cx="114" cy="${s.eye - 16}" r="5" fill="#fff" opacity=".8"/>`,
  }),
  detective: (s, c) => ({
    front:
      felt(`<path d="M128 ${s.top + 22} C128 ${s.top - 40} 256 ${s.top - 40} 256 ${s.top + 22}Z" fill="url(#check)"/><path d="M118 ${s.top + 22} Q192 ${s.top + 6} 266 ${s.top + 22} Q192 ${s.top + 34} 118 ${s.top + 22}Z" fill="#7a5638"/>
<circle cx="192" cy="${s.top - 22}" r="7" fill="#7a5638"/>`) +
      felt(`<rect x="152" y="246" width="66" height="70" rx="6" fill="#fdfbf5"/><g stroke="#c4b9a4" stroke-width="3"><line x1="162" y1="268" x2="208" y2="268"/><line x1="162" y1="282" x2="208" y2="282"/><line x1="162" y1="296" x2="194" y2="296"/></g>
<rect x="152" y="246" width="66" height="12" rx="4" fill="#e0525c"/><g transform="rotate(30 236 270)"><rect x="231" y="232" width="10" height="70" rx="3" fill="#f5b83d"/><path d="M231 302 L241 302 L236 314Z" fill="#3a3350"/></g>`) +
      hands(dark(c, 0.12), [
        [150, 284],
        [234, 270],
      ]),
  }),
  builder: (s, c) => ({
    front:
      felt(`<path d="M136 ${s.top + 14} C136 ${s.top - 50} 248 ${s.top - 50} 248 ${s.top + 14}Z" fill="#f2843c"/><rect x="118" y="${s.top + 6}" width="148" height="18" rx="9" fill="#e5732a"/>
<rect x="184" y="${s.top - 36}" width="16" height="44" rx="6" fill="#f69a59"/>`) +
      felt(
        `<g transform="rotate(-30 200 272)"><rect x="194" y="226" width="13" height="90" rx="5" fill="#b77a42"/><rect x="170" y="210" width="62" height="26" rx="6" fill="#8a8f9e"/><rect x="170" y="210" width="62" height="8" rx="4" fill="#a7acb9"/></g>`,
      ) +
      hands(dark(c, 0.12), [
        [152, 268],
        [218, 296],
      ]),
  }),
  doctor: (s, c) => ({
    front:
      felt(`<path d="M132 ${s.top + 58} Q192 ${s.top + 30} 252 ${s.top + 58} L250 ${s.top + 74} Q192 ${s.top + 46} 134 ${s.top + 74}Z" fill="#fdfbf5"/>
<circle cx="192" cy="${s.top + 46}" r="17" fill="#fdfbf5"/><rect x="187" y="${s.top + 35}" width="10" height="22" rx="2" fill="#e0525c"/><rect x="181" y="${s.top + 41}" width="22" height="10" rx="2" fill="#e0525c"/>`) +
      `<path d="M128 ${s.eye + 48} Q132 ${s.eye + 110} 170 ${s.eye + 110} M256 ${s.eye + 48} Q252 ${s.eye + 90} 220 ${s.eye + 96}" fill="none" stroke="#3b3a4a" stroke-width="7" stroke-linecap="round"/>` +
      felt(
        `<path d="M170 ${s.eye + 110} Q186 ${s.eye + 112} 186 ${s.eye + 128}" fill="none" stroke="#3b3a4a" stroke-width="7" stroke-linecap="round"/><circle cx="186" cy="${s.eye + 136}" r="13" fill="#b9bfcc" stroke="#8a90a0" stroke-width="4"/>`,
      ),
  }),
  gamer: (s, c) => ({
    mouth: "tongue",
    front:
      felt(`<path d="M146 258 C160 248 224 248 238 258 C254 270 260 304 246 310 C234 316 226 296 214 292 L170 292 C158 296 150 316 138 310 C124 304 130 270 146 258Z" fill="#3a3a52"/>
<rect x="154" y="266" width="24" height="8" rx="3" fill="#dcdcea"/><rect x="162" y="258" width="8" height="24" rx="3" fill="#dcdcea"/>
<circle cx="218" cy="262" r="6" fill="#f2706a"/><circle cx="230" cy="274" r="6" fill="#5cc79e"/><circle cx="206" cy="274" r="6" fill="#f5b83d"/><circle cx="218" cy="286" r="6" fill="#2f7cf6"/>`) +
      hands(dark(c, 0.12), [
        [134, 292],
        [250, 292],
      ]),
  }),
  traveler: (s, c) => ({
    back: felt(
      `<rect x="${192 - s.width - 18}" y="196" width="48" height="96" rx="16" fill="#9b6b42"/><rect x="${192 + s.width - 30}" y="196" width="48" height="96" rx="16" fill="#9b6b42"/>`,
    ),
    front:
      `<path d="M${192 - s.width + 22} ${s.eye + 40} L${192 - s.width + 34} ${s.eye + 100} M${192 + s.width - 22} ${s.eye + 40} L${192 + s.width - 34} ${s.eye + 100}" stroke="#7a5236" stroke-width="12" stroke-linecap="round"/>` +
      felt(`<path d="M140 252 L172 244 L212 254 L244 246 L244 304 L212 312 L172 302 L140 310Z" fill="#f6ecd3"/><path d="M172 244 L172 302 M212 254 L212 312" stroke="#ddd0ae" stroke-width="3"/>
<path d="M150 296 Q170 270 190 284 T234 260" fill="none" stroke="#e0525c" stroke-width="4" stroke-dasharray="7 6" stroke-linecap="round"/><circle cx="234" cy="260" r="6" fill="#e0525c"/>`) +
      hands(dark(c, 0.12), [
        [138, 282],
        [246, 276],
      ]),
  }),
  sleepy: (s0, c) => {
    const s = { ...s0, top: s0.top + 30 };
    return {
      eyes: "closed",
      front:
        felt(`<path d="M128 ${s.top + 26} C130 ${s.top - 40} 220 ${s.top - 60} 286 ${s.top - 10} C250 ${s.top - 20} 240 ${s.top + 6} 256 ${s.top + 26}Z" fill="url(#stripes)"/>
<rect x="122" y="${s.top + 14}" width="140" height="22" rx="11" fill="#f4f1ea"/><circle cx="290" cy="${s.top - 8}" r="17" fill="#fdfcf8"/>`) +
        felt(
          `<path d="M214 236 A44 44 0 1 0 226 312 A36 36 0 1 1 214 236Z" fill="#f8d36a"/><circle cx="200" cy="290" r="4" fill="#e9b84a"/><circle cx="186" cy="268" r="3" fill="#e9b84a"/>`,
        ) +
        hands(dark(c, 0.12), [
          [154, 286],
          [228, 300],
        ]),
    };
  },
  barista: (s, c) => ({
    front:
      `<g fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity=".85"><path d="M180 232 Q172 220 180 208 Q188 196 180 184"/><path d="M204 232 Q196 220 204 208 Q212 196 204 184"/></g>` +
      felt(`<path d="M154 240 L230 240 L224 304 C222 312 216 316 208 316 L176 316 C168 316 162 312 160 304Z" fill="#fdfbf5"/><path d="M228 254 C254 252 256 290 224 290" fill="none" stroke="#fdfbf5" stroke-width="10"/>
<ellipse cx="192" cy="242" rx="38" ry="7" fill="#8a5a33"/><path d="M192 296 C176 284 178 268 188 268 C192 268 192 272 192 274 C192 272 192 268 196 268 C206 268 208 284 192 296Z" fill="#ef77ad"/>`) +
      hands(dark(c, 0.12), [
        [154, 280],
        [232, 292],
      ]),
  }),
  wizard: (s, c) => ({
    front:
      felt(`<path d="M128 ${s.top + 34} L188 ${s.top - 104} Q198 ${s.top - 118} 212 ${s.top - 100} L256 ${s.top + 34}Z" fill="#3355c7"/>
<ellipse cx="192" cy="${s.top + 34}" rx="${s.width + 20}" ry="18" fill="#2a47ad"/>
<g fill="#f8d14a"><path d="M180 ${s.top - 30} l5 11 12 1 -9 8 3 12 -11 -6 -11 6 3 -12 -9 -8 12 -1Z"/><circle cx="214" cy="${s.top - 60}" r="5"/><circle cx="226" cy="${s.top}" r="6"/><circle cx="160" cy="${s.top + 8}" r="4"/></g>`),
  }),
  data: (s, c) => ({
    front:
      `<circle cx="192" cy="272" r="56" fill="#8ff3ff" opacity=".55" filter="url(#glow)"/>` +
      felt(`<path d="M192 228 L234 250 L192 272 L150 250Z" fill="#c9fbff"/><path d="M150 250 L192 272 L192 318 L150 296Z" fill="#5fd8ea"/><path d="M234 250 L192 272 L192 318 L234 296Z" fill="#3dbfd1"/>
<path d="M150 250 L192 228 L234 250 L234 296 L192 318 L150 296Z M192 272 L192 318 M150 250 L192 272 L234 250" fill="none" stroke="#e8feff" stroke-width="3" stroke-linejoin="round"/>`) +
      hands(dark(c, 0.14), [
        [146, 278],
        [238, 278],
      ]),
  }),
  messenger: (s, c) => ({
    front:
      `<path d="M${192 - s.width + 26} ${s.eye + 36} L238 274" stroke="#7a5236" stroke-width="12" stroke-linecap="round"/>` +
      felt(`<rect x="196" y="272" width="62" height="18" rx="3" fill="#fdfbf5" transform="rotate(-10 226 280)"/><path d="M196 272 L226 288 L256 266" fill="none" stroke="#d6d0c2" stroke-width="3" transform="rotate(-10 226 280)"/>
<rect x="190" y="282" width="76" height="44" rx="10" fill="#a8744a"/><path d="M190 286 Q228 312 266 286 L266 296 Q228 318 190 296Z" fill="#8f603a"/><circle cx="228" cy="304" r="5" fill="#f5b83d"/>`) +
      hands(dark(c, 0.12), [[176, 292]]),
  }),
  planner: (s, c) => ({
    front:
      felt(`<rect x="142" y="232" width="100" height="88" rx="10" fill="#b98352"/><rect x="152" y="246" width="80" height="68" rx="5" fill="#fdfbf5"/><rect x="172" y="224" width="40" height="16" rx="5" fill="#8a8f9e"/>
<g stroke="#5cc79e" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M160 262 l5 5 9 -10"/><path d="M160 282 l5 5 9 -10"/></g>
<rect x="160" y="296" width="12" height="12" rx="3" fill="none" stroke="#c4b9a4" stroke-width="3"/>
<g stroke="#c4b9a4" stroke-width="4" stroke-linecap="round"><line x1="184" y1="262" x2="222" y2="262"/><line x1="184" y1="282" x2="216" y2="282"/><line x1="184" y1="302" x2="220" y2="302"/></g>`) +
      hands(dark(c, 0.12), [
        [142, 286],
        [242, 286],
      ]),
  }),
  security: (s, c) => ({
    front:
      felt(`<path d="M192 226 L246 244 C246 290 228 314 192 328 C156 314 138 290 138 244Z" fill="#f5b83d"/><path d="M192 238 L234 252 C234 288 220 306 192 316 C164 306 150 288 150 252Z" fill="#1f4fb8"/>
<circle cx="192" cy="268" r="11" fill="#f5b83d"/><path d="M186 274 L198 274 L202 296 L182 296Z" fill="#f5b83d"/>`) +
      hands(dark(c, 0.14), [
        [138, 270],
        [246, 270],
      ]),
  }),
  translator: (s, c) => ({
    mouth: "o",
    front:
      felt(`<path d="M42 ${s.top - 6} h86 a16 16 0 0 1 16 16 v34 a16 16 0 0 1 -16 16 h-44 l-22 18 4 -18 h-24 a16 16 0 0 1 -16 -16 v-34 a16 16 0 0 1 16 -16Z" fill="#fdfbf5"/>
<g fill="#5d67ee"><circle cx="64" cy="${s.top + 27}" r="6"/><circle cx="85" cy="${s.top + 27}" r="6"/><circle cx="106" cy="${s.top + 27}" r="6"/></g>
<path d="M256 ${s.top - 30} h80 a16 16 0 0 1 16 16 v32 a16 16 0 0 1 -16 16 h-22 l4 18 -22 -18 h-40 a16 16 0 0 1 -16 -16 v-32 a16 16 0 0 1 16 -16Z" fill="#f8d14a"/>
<g stroke="#a8781a" stroke-width="5" stroke-linecap="round"><line x1="262" y1="${s.top - 8}" x2="330" y2="${s.top - 8}"/><line x1="262" y1="${s.top + 8}" x2="310" y2="${s.top + 8}"/></g>`),
  }),
};

const BOTS = [
  ["chef", "round", "#f5b83d"],
  ["writer", "bean", "#f2706a"],
  ["analyst", "square", "#2f7cf6"],
  ["finance", "pear", "#5cc79e"],
  ["legal", "round", "#5d67ee"],
  ["teacher", "blob", "#f2843c"],
  ["scientist", "bean", "#3dbfd1"],
  ["musician", "star", "#ef77ad"],
  ["photographer", "cloud", "#6cb6f5"],
  ["gardener", "round", "#8ece34"],
  ["astronaut", "round", "#9b82f0"],
  ["detective", "bean", "#c97a45"],
  ["builder", "square", "#f5b83d"],
  ["doctor", "pear", "#5cc79e"],
  ["gamer", "blob", "#5d67ee"],
  ["traveler", "round", "#f2706a"],
  ["sleepy", "cloud", "#4a5aa8"],
  ["barista", "bean", "#f6a77e"],
  ["wizard", "star", "#9b82f0"],
  ["data", "round", "#3dbfd1"],
  ["messenger", "square", "#6cb6f5"],
  ["planner", "blob", "#ef77ad"],
  ["security", "round", "#2f7cf6"],
  ["translator", "pear", "#8ece34"],
];

function defs(c, seed) {
  return `<defs>
<radialGradient id="body" cx="36%" cy="28%" r="80%"><stop offset="0" stop-color="${light(c, 0.32)}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${dark(c, 0.22)}"/></radialGradient>
<radialGradient id="limb" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="${light(c, 0.12)}"/><stop offset="1" stop-color="${dark(c, 0.26)}"/></radialGradient>
<filter id="fuzz" x="-15%" y="-15%" width="130%" height="130%">
  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed}" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="${seed + 9}" result="g"/>
  <feColorMatrix in="g" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.1 0 0 0 -0.62" result="hi"/>
  <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0.1  0 -1.1 0 0 0.5" result="lo"/>
  <feComposite in="hi" in2="d" operator="in" result="hi2"/><feComposite in="lo" in2="d" operator="in" result="lo2"/>
  <feMerge><feMergeNode in="d"/><feMergeNode in="hi2"/><feMergeNode in="lo2"/></feMerge>
</filter>
<filter id="felt2" x="-15%" y="-15%" width="130%" height="130%">
  <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="${seed + 3}" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="3.5" xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="${seed + 5}" result="g"/>
  <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 -0.9 0 0 0.42" result="lo"/>
  <feComposite in="lo" in2="d" operator="in" result="lo2"/>
  <feMerge><feMergeNode in="d"/><feMergeNode in="lo2"/></feMerge>
</filter>
<filter id="straw" x="-15%" y="-15%" width="130%" height="130%">
  <feTurbulence type="fractalNoise" baseFrequency="0.08 1.2" numOctaves="2" seed="${seed}" result="g"/>
  <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.4  0 0 0 0 0.25  0 0 0 0 0  0 -1.2 0 0 0.55" result="lo"/>
  <feComposite in="lo" in2="SourceGraphic" operator="in" result="lo2"/>
  <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="lo2"/></feMerge>
</filter>
<filter id="soft"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
<pattern id="check" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#a9845c"/><rect width="10" height="20" fill="#8f6c47" opacity=".7"/><rect width="20" height="10" fill="#8f6c47" opacity=".55"/></pattern>
<pattern id="stripes" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="24" height="24" fill="#6f80d8"/><rect width="12" height="24" fill="#c9d1f6"/></pattern>
</defs>`;
}

function bot([name, shapeId, c], i) {
  const s = SHAPES[shapeId];
  const acc = A[name](s, c);
  const limb = "url(#limb)";
  const arms = s.star
    ? ""
    : `<ellipse cx="${192 - s.width - 2}" cy="${s.armY}" rx="24" ry="38" fill="${limb}" transform="rotate(18 ${192 - s.width - 2} ${s.armY})"/>
<ellipse cx="${192 + s.width + 2}" cy="${s.armY}" rx="24" ry="38" fill="${limb}" transform="rotate(-18 ${192 + s.width + 2} ${s.armY})"/>`;
  const feet = s.star
    ? ""
    : `<ellipse cx="156" cy="324" rx="36" ry="20" fill="${limb}"/><ellipse cx="228" cy="324" rx="36" ry="20" fill="${limb}"/>`;
  const body = s.star
    ? `<path d="${s.d}" fill="url(#body)" stroke="url(#body)" stroke-width="44" stroke-linejoin="round"/>`
    : `<path d="${s.d}" fill="url(#body)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="384" height="384" viewBox="0 0 384 384">
${defs(c, 11 + i * 7)}
${acc.back ?? ""}
<g filter="url(#fuzz)">${arms}${feet}${body}</g>
${cheeks(s)}
${acc.face ?? ""}
${eyes(s, acc.eyes)}
${mouth(s, acc.mouth)}
${acc.front ?? ""}
</svg>`;
}

BOTS.forEach((b, i) => {
  if (only.size && !only.has(b[0])) return;
  writeFileSync(`${out}/${b[0]}.svg`, bot(b, i));
});
console.log(BOTS.map((b) => b[0]).join(" "));
