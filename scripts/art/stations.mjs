/**
 * Station props for each place's yard (see shared/stations.ts), original and
 * CC0, drawn in code. One small prop per station and world:
 *   study (reading, searching) · desk (writing) · works (commands, tests)
 *   gate (the web) · porch (needs you) · bench (your turn, resting)
 */
import path from "node:path";
import { Img, rgba, shade, withAlpha, linear, radial } from "./raster.mjs";

const K = {
  wood: rgba("#6e4326"), woodDark: rgba("#432713"), woodLight: rgba("#9a6a3e"),
  leaf: rgba("#e8d39a"), leafDark: rgba("#b8a061"), straw: rgba("#d8b26a"), strawDark: rgba("#a9803f"),
  brass: rgba("#d9a83a"), brassDark: rgba("#8a6418"), bronze: rgba("#a86b2d"),
  laterite: rgba("#b0563a"), lateriteDark: rgba("#7d3524"), red: rgba("#c8322a"), redDark: rgba("#7e1d17"),
  flame: rgba("#ffc24d"), flameHot: rgba("#fff1b0"), ember: rgba("#ff7a2a"), shadow: rgba("#000000", 0.2),
};
const B = {
  steel: rgba("#c9cfd4"), steelDark: rgba("#6f777e"), rack: rgba("#2b2f36"), rackDark: rgba("#1a1d22"),
  led: rgba("#5eead4"), ledAmber: rgba("#f5b33d"), ledRed: rgba("#ff5a4f"),
  wood: rgba("#8a6a4a"), woodDark: rgba("#5a432c"), book: [rgba("#c0503a"), rgba("#3f7fb0"), rgba("#e0b84a"), rgba("#4f9a5c"), rgba("#8c5aa8")],
  yellow: rgba("#f2c230"), yellowDark: rgba("#b48a14"), blue: rgba("#2e5c9a"), screen: rgba("#9fd3f2"), plastic: rgba("#e9e6df"),
  chairBlue: rgba("#3f6fb0"), chairDark: rgba("#284a7a"), black: rgba("#1c1c1c"), shadow: rgba("#000000", 0.2),
};

// ── Kerala ───────────────────────────────────────────────────────────────────
/** Study: a carved wooden grantha stand holding a bundle of palm-leaf pages, a small brass lamp beside it. */
function kStudy() {
  const img = new Img(62, 60, 3);
  img.ellipse(31, 57, 26, 3, K.shadow);
  img.stroke([[14, 57], [36, 30]], 3.2, K.woodDark);
  img.stroke([[40, 57], [18, 30]], 3.2, K.wood);
  img.fillPoly([[10, 32], [44, 22], [46, 27], [12, 37]], linear(10, 0, 46, 0, [[0, K.woodDark], [1, K.woodLight]]));
  for (let i = 0; i < 5; i++) img.fillPoly([[12, 30 - i * 1.4], [44, 20.5 - i * 1.4], [44.5, 22 - i * 1.4], [12.5, 31.5 - i * 1.4]], i % 2 ? K.leaf : K.leafDark);
  img.stroke([[27, 25], [27, 19]], 1, K.woodDark);
  // lamp
  img.ellipse(54, 56, 6, 1.6, K.brassDark);
  img.rect(53, 44, 2.2, 12, K.brass);
  img.ellipse(54, 44, 5, 1.6, K.brass);
  img.ellipse(54, 39, 2.2, 4, radial(54, 40, 4, [[0, K.flameHot], [1, K.flame]]));
  return img;
}

/** Desk: a woven grass mat (pulpaya) with a palm leaf and an iron stylus (ezhuthani) on it. */
function kDesk() {
  const img = new Img(96, 22, 3);
  img.fillPoly([[4, 15], [92, 15], [86, 5], [10, 5]], linear(0, 5, 0, 15, [[0, K.straw], [1, K.strawDark]]));
  for (let x = 12; x < 88; x += 5) img.stroke([[x, 5.5], [x - 2, 14.5]], 0.9, withAlpha(K.strawDark, 0.8));
  for (const y of [8, 11]) img.stroke([[9, y], [88, y]], 0.7, withAlpha(shade(K.strawDark, -0.2), 0.5));
  img.fillPoly([[60, 9], [82, 7], [82.5, 8.5], [60.5, 10.5]], K.leaf);
  img.stroke([[63, 12], [79, 10.5]], 1.1, rgba("#5a5a5a"));
  img.ellipse(48, 19, 44, 2.4, K.shadow);
  return img;
}

/** Works: a hearth of laterite stones with a fire, a bronze uruli on top. */
function kWorks() {
  const img = new Img(64, 54, 3);
  img.ellipse(32, 51, 28, 3, K.shadow);
  for (const [x, w] of [[10, 14], [40, 14]]) img.fillPoly([[x, 50], [x + w, 50], [x + w - 2, 34], [x + 2, 34]], linear(0, 34, 0, 50, [[0, K.laterite], [1, K.lateriteDark]]));
  img.ellipse(32, 45, 9, 5, radial(32, 46, 9, [[0, K.flameHot], [0.5, K.flame], [1, withAlpha(K.ember, 0)]]));
  for (const dx of [-5, 0, 5]) img.taper([[32 + dx, 47], [32 + dx * 0.6, 40], [32 + dx * 0.2, 35]], 3, 0.5, dx ? K.ember : K.flame);
  img.fillPoly([[8, 22], [56, 22], [50, 34], [14, 34]], linear(8, 0, 56, 0, [[0, shade(K.bronze, -0.35)], [0.4, shade(K.bronze, 0.25)], [1, shade(K.bronze, -0.3)]]));
  img.ellipse(32, 22, 24, 3.4, shade(K.bronze, -0.45));
  img.ellipse(32, 21.5, 22, 2.4, rgba("#e8c27a"));
  for (const x of [6, 58]) img.ellipse(x, 24, 3, 2, shade(K.bronze, -0.2));
  return img;
}

/** Gate: a red pillar post box, a folded newspaper (pathram) on top. */
function kGate() {
  const img = new Img(34, 66, 3);
  img.ellipse(17, 63, 13, 2.6, K.shadow);
  img.rect(7, 18, 20, 44, linear(7, 0, 27, 0, [[0, K.redDark], [0.45, K.red], [1, K.redDark]]));
  img.ellipse(17, 18, 11, 6, K.red);
  img.ellipse(17, 17, 9, 4, shade(K.red, 0.15));
  img.rect(10, 28, 14, 2.4, rgba("#1a1a1a"));
  img.rect(6, 58, 22, 4, K.redDark);
  img.fillPoly([[8, 12], [26, 9], [27, 13], [9, 16]], rgba("#ece6d6"));
  for (const y of [12, 13.5]) img.stroke([[11, y], [24, y - 2.4]], 0.6, rgba("#8a8578"));
  return img;
}

/** Porch: a brass hand-bell hung under a little wooden roof, where a villager asks you. */
function kPorch() {
  const img = new Img(40, 84, 3);
  img.ellipse(20, 81, 14, 2.6, K.shadow);
  img.rect(18, 14, 4, 67, linear(18, 0, 22, 0, [[0, K.woodDark], [1, K.wood]]));
  img.fillPoly([[4, 16], [20, 4], [36, 16], [33, 18], [20, 9], [7, 18]], linear(0, 4, 0, 18, [[0, rgba("#b0482c")], [1, rgba("#7a2c18")]]));
  img.stroke([[20, 18], [20, 26]], 1, K.brassDark);
  img.fillPoly([[14, 38], [26, 38], [24, 28], [16, 28]], linear(14, 0, 26, 0, [[0, K.brassDark], [0.45, rgba("#f2cf7a")], [1, K.brassDark]]));
  img.ellipse(20, 28, 4, 2, K.brass);
  img.ellipse(20, 39.5, 2, 2, K.brassDark);
  return img;
}

/** Bench: a charupadi, the verandah ledge seat with a curved wooden backrest. */
function kBench() {
  const img = new Img(96, 44, 3);
  img.ellipse(48, 41, 44, 3, K.shadow);
  img.rect(6, 26, 84, 6, linear(0, 26, 0, 32, [[0, K.woodLight], [1, K.wood]]));
  img.rect(8, 32, 80, 8, linear(0, 32, 0, 40, [[0, K.laterite], [1, K.lateriteDark]]));
  for (let x = 12; x <= 84; x += 8) img.stroke([[x, 26], [x - 3, 8]], 2, K.woodDark);
  img.taper([[6, 10], [48, 4], [90, 10]], 3.4, 3.4, K.wood);
  return img;
}

// ── Bengaluru ────────────────────────────────────────────────────────────────
/** Study: a small open bookshelf. */
function bStudy() {
  const img = new Img(52, 68, 3);
  img.ellipse(26, 65, 22, 2.6, B.shadow);
  img.rect(4, 6, 44, 59, B.woodDark);
  img.rect(7, 9, 38, 53, shade(B.woodDark, -0.3));
  let k = 0;
  for (const top of [10, 28, 46]) {
    img.rect(6, top + 15, 40, 2.5, B.wood);
    for (let x = 8; x < 43; ) {
      const w = 3 + (k % 3), h = 10 + ((k * 7) % 5);
      img.rect(x, top + 15 - h, w, h, B.book[k % B.book.length]);
      x += w + 0.6;
      k++;
    }
  }
  return img;
}

/** Desk: a standing hot-desk with a laptop open on it. */
function bDesk() {
  const img = new Img(84, 50, 3);
  img.ellipse(42, 48, 38, 2.6, B.shadow);
  img.rect(6, 20, 72, 5, B.plastic);
  img.rect(6, 25, 72, 2, B.steelDark);
  for (const x of [10, 72]) img.rect(x, 27, 3, 20, B.steelDark);
  img.fillPoly([[30, 19], [54, 19], [52, 4], [32, 4]], B.black);
  img.fillPoly([[32.5, 17], [51.5, 17], [50, 6], [34, 6]], linear(0, 6, 0, 17, [[0, B.screen], [1, shade(B.screen, -0.25)]]));
  img.rect(27, 19, 30, 2, B.steel);
  img.rect(60, 14, 5, 6, rgba("#ffffff"));
  img.rect(65, 15.5, 1.5, 3, rgba("#ffffff"));
  return img;
}

/** Works: a small server rack with blinking lights. */
function bWorks() {
  const img = new Img(46, 76, 3);
  img.ellipse(23, 73, 20, 2.6, B.shadow);
  img.rect(5, 4, 36, 68, linear(5, 0, 41, 0, [[0, B.rackDark], [0.5, B.rack], [1, B.rackDark]]));
  for (let i = 0; i < 7; i++) {
    const y = 8 + i * 9;
    img.rect(8, y, 30, 6.5, shade(B.rack, 0.18));
    img.circle(12, y + 3.2, 1.2, i % 3 === 0 ? B.ledAmber : B.led);
    img.circle(16, y + 3.2, 1.2, B.led);
    for (let x = 22; x < 36; x += 2.5) img.rect(x, y + 1.5, 1.2, 3.5, B.rackDark);
  }
  return img;
}

/** Gate: a yellow STD booth kiosk with a phone, for the web. */
function bGate() {
  const img = new Img(46, 78, 3);
  img.ellipse(23, 75, 20, 2.6, B.shadow);
  img.rect(5, 14, 36, 60, linear(5, 0, 41, 0, [[0, B.yellowDark], [0.5, B.yellow], [1, B.yellowDark]]));
  img.rect(3, 8, 40, 8, B.blue);
  for (let x = 8; x < 40; x += 6) img.rect(x, 10.5, 3.5, 3, rgba("#ffffff"));
  img.rect(10, 22, 26, 22, rgba("#2b2f36"));
  img.rect(14, 28, 8, 12, B.ledRed);
  img.taper([[26, 26], [30, 24], [32, 30]], 2.4, 2.4, B.black);
  img.rect(24, 32, 9, 8, shade(B.plastic, -0.1));
  return img;
}

/** Porch: a reception podium with a call bell, where a villager asks you. */
function bPorch() {
  const img = new Img(40, 56, 3);
  img.ellipse(20, 53, 16, 2.6, B.shadow);
  img.fillPoly([[8, 52], [32, 52], [34, 20], [6, 20]], linear(6, 0, 34, 0, [[0, B.chairDark], [0.5, B.chairBlue], [1, B.chairDark]]));
  img.rect(4, 17, 32, 4, B.plastic);
  img.ellipse(20, 15, 6, 4, linear(14, 0, 26, 0, [[0, rgba("#9aa3a8")], [0.5, rgba("#f0f3f5")], [1, rgba("#9aa3a8")]]));
  img.rect(19, 9, 2, 3, rgba("#9aa3a8"));
  img.ellipse(20, 17, 8, 1.5, rgba("#6f777e"));
  return img;
}

/** Bench: a row of waiting chairs under a token display. */
function bBench() {
  const img = new Img(98, 70, 3);
  img.ellipse(49, 67, 46, 3, B.shadow);
  img.rect(46, 4, 3, 26, B.steelDark);
  img.rect(30, 2, 36, 12, B.black);
  for (let x = 34; x < 62; x += 7) img.rect(x, 5, 5, 6, B.ledRed);
  img.rect(4, 52, 90, 3, B.steelDark);
  for (let i = 0; i < 4; i++) {
    const x = 6 + i * 22;
    img.fillPoly([[x, 34], [x + 18, 34], [x + 17, 49], [x + 1, 49]], B.chairBlue);
    img.rect(x - 1, 48, 20, 4, B.chairDark);
  }
  for (const x of [8, 90]) img.rect(x, 55, 2.5, 12, B.steelDark);
  return img;
}

export function buildStations(worldsDir) {
  const sets = {
    kerala: { study: kStudy, desk: kDesk, works: kWorks, gate: kGate, porch: kPorch, bench: kBench },
    bengaluru: { study: bStudy, desk: bDesk, works: bWorks, gate: bGate, porch: bPorch, bench: bBench },
  };
  for (const [world, set] of Object.entries(sets)) {
    console.log(`Stations (${world}):`);
    for (const [name, draw] of Object.entries(set)) draw().save(path.join(worldsDir, world, "assets", `station_${name}.png`));
  }
}
