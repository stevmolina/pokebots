// Draws the server marks: simple felt machines of the Pokebots family (one rounded body, a face, one
// antenna), plus the "All machines" mark with three of them together. Kept plain so they read at 14px.
// Usage: node draw-machines.mjs <workdir>/svg, then PREFIX=server- SIZE=256 ./render.sh <workdir>.
// Copy <workdir>/out/server-*.webp to packages/ui/src/features/servers/assets/machines/.
import { mkdirSync, writeFileSync } from "node:fs";

const out = process.argv[2] ?? "svg";
mkdirSync(out, { recursive: true });

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

/** Gradients and felt filters for one colour; ids carry the colour key so groups can share a file. */
function defs(key, c, seed) {
  return `<radialGradient id="body-${key}" cx="36%" cy="28%" r="80%"><stop offset="0" stop-color="${light(c, 0.32)}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${dark(c, 0.22)}"/></radialGradient>
<radialGradient id="limb-${key}" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="${light(c, 0.12)}"/><stop offset="1" stop-color="${dark(c, 0.26)}"/></radialGradient>
<filter id="fuzz-${key}" x="-15%" y="-15%" width="130%" height="130%">
  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed}" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="8" xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="${seed + 9}" result="g"/>
  <feColorMatrix in="g" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.1 0 0 0 -0.62" result="hi"/>
  <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0.1  0 -1.1 0 0 0.5" result="lo"/>
  <feComposite in="hi" in2="d" operator="in" result="hi2"/><feComposite in="lo" in2="d" operator="in" result="lo2"/>
  <feMerge><feMergeNode in="d"/><feMergeNode in="hi2"/><feMergeNode in="lo2"/></feMerge>
</filter>`;
}

/** One machine on a 384 x 384 canvas: a rounded square body, short feet, an antenna and a face. */
function machine(key) {
  const fuzz = `url(#fuzz-${key})`;
  const limb = `url(#limb-${key})`;
  const eyeY = 196;
  const eyes = [154, 230]
    .map(
      (x) => `<ellipse cx="${x}" cy="${eyeY}" rx="17" ry="21" fill="#1d1a2a"/>
<ellipse cx="${x - 5}" cy="${eyeY - 8}" rx="6.5" ry="7" fill="#fff"/>`,
    )
    .join("");
  return `<g filter="${fuzz}">
<rect x="186" y="52" width="12" height="52" rx="6" fill="${limb}"/>
<circle cx="192" cy="50" r="20" fill="${limb}"/>
<ellipse cx="146" cy="318" rx="38" ry="22" fill="${limb}"/><ellipse cx="238" cy="318" rx="38" ry="22" fill="${limb}"/>
<rect x="64" y="96" width="256" height="222" rx="84" fill="url(#body-${key})"/>
</g>
<g opacity=".5"><ellipse cx="118" cy="${eyeY + 30}" rx="17" ry="10" fill="#ff8fb0"/><ellipse cx="266" cy="${eyeY + 30}" rx="17" ry="10" fill="#ff8fb0"/></g>
${eyes}
<path d="M174 ${eyeY + 34} Q192 ${eyeY + 50} 210 ${eyeY + 34}" fill="none" stroke="#1d1a2a" stroke-width="7" stroke-linecap="round"/>`;
}

const svg = (defsInner, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="384" height="384" viewBox="0 0 384 384"><defs>${defsInner}</defs>${body}</svg>`;

/** No blue machine: blue is the plush of this computer. */
const MACHINES = [
  ["mint", "#5cc79e"],
  ["orange", "#f2843c"],
  ["purple", "#9b82f0"],
  ["pink", "#ef77ad"],
];
const colour = Object.fromEntries(MACHINES);

MACHINES.forEach(([key, c], i) => {
  writeFileSync(`${out}/${key}.svg`, svg(defs(key, c, 11 + i * 7), machine(key)));
});

// All machines: two machines behind, one in front, as a sign for "every server".
const group = [
  ["purple", "translate(-6 6) scale(.6)"],
  ["orange", "translate(160 6) scale(.6)"],
  ["mint", "translate(77 150) scale(.6)"],
];
writeFileSync(
  `${out}/all-machines.svg`,
  svg(
    group.map(([key], i) => defs(key, colour[key], 40 + i * 5)).join(""),
    group.map(([key, t]) => `<g transform="${t}">${machine(key)}</g>`).join(""),
  ),
);
console.log([...MACHINES.map(([k]) => k), "all-machines"].join(" "));
