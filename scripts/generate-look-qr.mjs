/**
 * Generate LOOK QR assets into assets/qr/
 * URL: https://lookcruise.com/open (permanent public entry)
 *
 * Run: node scripts/generate-look-qr.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { Jimp } from "jimp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "assets", "qr");

/** Permanent public LOOK entry — never use staging or lookappworld.com here. */
export const LOOK_QR_URL = "https://lookcruise.com/open";

const PNG_SIZE = 2048; // high-res for print
const MARGIN_MODULES = 4; // quiet zone
const LOGO_PATH = path.join(root, "public", "icons", "icon-512.png");

fs.mkdirSync(outDir, { recursive: true });

async function writePlainPng() {
  const file = path.join(outDir, "look-qr.png");
  await QRCode.toFile(file, LOOK_QR_URL, {
    type: "png",
    width: PNG_SIZE,
    margin: MARGIN_MODULES,
    errorCorrectionLevel: "H",
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  return file;
}

async function writePlainSvg() {
  const file = path.join(outDir, "look-qr.svg");
  const svg = await QRCode.toString(LOOK_QR_URL, {
    type: "svg",
    margin: MARGIN_MODULES,
    errorCorrectionLevel: "H",
    color: { dark: "#000000", light: "#FFFFFF" },
    width: PNG_SIZE,
  });
  fs.writeFileSync(file, svg, "utf8");
  return file;
}

async function writeLogoPng() {
  const file = path.join(outDir, "look-qr-logo.png");
  // Generate to buffer then composite logo (~18% of QR, with white pad)
  const qrBuf = await QRCode.toBuffer(LOOK_QR_URL, {
    type: "png",
    width: PNG_SIZE,
    margin: MARGIN_MODULES,
    errorCorrectionLevel: "H",
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  const qr = await Jimp.read(qrBuf);
  const logo = await Jimp.read(LOGO_PATH);

  const qrW = qr.bitmap.width;
  const logoTarget = Math.round(qrW * 0.18);
  logo.resize({ w: logoTarget, h: logoTarget });

  // White rounded-ish pad behind logo (quiet island)
  const pad = Math.round(logoTarget * 0.18);
  const island = logoTarget + pad * 2;
  const islandImg = new Jimp({ width: island, height: island, color: 0xffffffff });

  const ix = Math.round((qrW - island) / 2);
  const iy = Math.round((qrW - island) / 2);
  const lx = Math.round((qrW - logoTarget) / 2);
  const ly = Math.round((qrW - logoTarget) / 2);

  qr.composite(islandImg, ix, iy);
  qr.composite(logo, lx, ly);

  await qr.write(file);
  return file;
}

async function writeLogoSvg() {
  const file = path.join(outDir, "look-qr-logo.svg");
  // Base SVG QR (viewBox is in module units, typically 0 0 N N)
  let svg = await QRCode.toString(LOOK_QR_URL, {
    type: "svg",
    margin: MARGIN_MODULES,
    errorCorrectionLevel: "H",
    color: { dark: "#000000", light: "#FFFFFF" },
    width: PNG_SIZE,
  });

  const vb = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (!vb) throw new Error("Could not parse QR SVG viewBox");
  const modules = Number(vb[1]);
  const cx = modules / 2;
  const island = modules * 0.2; // ~20% — within ECC H tolerance
  const mark = island * 0.82;
  const ix = cx - island / 2;
  const iy = cx - island / 2;
  const mx = cx - mark / 2;
  const my = cx - mark / 2;
  const fontSize = mark * 0.58;
  const textY = cx + fontSize * 0.35;

  const logoSvg = `
  <!-- LOOK logo island in module units (matches viewBox) -->
  <g id="look-logo">
    <rect x="${ix.toFixed(3)}" y="${iy.toFixed(3)}" width="${island.toFixed(3)}" height="${island.toFixed(3)}" rx="${(island * 0.16).toFixed(3)}" fill="#FFFFFF"/>
    <rect x="${mx.toFixed(3)}" y="${my.toFixed(3)}" width="${mark.toFixed(3)}" height="${mark.toFixed(3)}" rx="${(mark * 0.18).toFixed(3)}" fill="#4F46E5"/>
    <text x="${cx.toFixed(3)}" y="${textY.toFixed(3)}" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize.toFixed(3)}" font-weight="700" fill="#FFFFFF" text-anchor="middle">L</text>
  </g>
`;

  if (!svg.includes("</svg>")) {
    throw new Error("Unexpected SVG from qrcode");
  }
  svg = svg.replace("</svg>", `${logoSvg}</svg>`);
  fs.writeFileSync(file, svg, "utf8");
  return file;
}

async function decodePng(file) {
  const jsQR = (await import("jsqr")).default;
  const img = await Jimp.read(file);
  const { data, width, height } = img.bitmap;
  const code = jsQR(
    new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width,
    height
  );
  return code?.data ?? null;
}

const created = new Date().toISOString().slice(0, 10);

console.log("Generating QR for", LOOK_QR_URL);
await writePlainPng();
await writePlainSvg();
await writeLogoPng();
await writeLogoSvg();

const plainDecoded = await decodePng(path.join(outDir, "look-qr.png"));
const logoDecoded = await decodePng(path.join(outDir, "look-qr-logo.png"));

console.log("Decoded plain:", plainDecoded);
console.log("Decoded logo:", logoDecoded);

const plainOk = plainDecoded === LOOK_QR_URL;
const logoOk = logoDecoded === LOOK_QR_URL;

const readme = `# LOOK QR codes

## Encoded URL

\`${LOOK_QR_URL}\`

This is the permanent public LOOK entry (\`LOOK_PUBLIC_OPEN_URL\` / \`/open\`).

- Production app origin remains \`https://lookcruise.com\`.
- \`/open\` currently redirects to the web home; later it can open native apps / stores without changing this QR URL.
- Marketing site \`https://lookappworld.com\` is separate and is **not** encoded here.
- Staging Vercel URLs must **never** appear in QR codes.

## Created

- Date: **${created}**
- Generator: \`scripts/generate-look-qr.mjs\` (QR error correction **H**, quiet zone **4** modules)

## Files

| File | Format | Notes |
|------|--------|--------|
| \`look-qr.png\` | PNG | ${PNG_SIZE}×${PNG_SIZE} px, black on white, quiet zone |
| \`look-qr.svg\` | SVG | Vector, same payload / ECC |
| \`look-qr-logo.png\` | PNG | ${PNG_SIZE}×${PNG_SIZE} px + LOOK mark (~18% center) on white island |
| \`look-qr-logo.svg\` | SVG | Vector + LOOK “L” mark in center |

## PNG sizes

- \`look-qr.png\`: **${PNG_SIZE} × ${PNG_SIZE}** pixels
- \`look-qr-logo.png\`: **${PNG_SIZE} × ${PNG_SIZE}** pixels

## Decode verification (automated)

| Version | Decoded URL matches | Result |
|---------|---------------------|--------|
| Plain (\`look-qr.png\`) | ${plainDecoded ?? "(failed)"} | ${plainOk ? "PASS" : "FAIL"} |
| Logo (\`look-qr-logo.png\`) | ${logoDecoded ?? "(failed)"} | ${logoOk ? "PASS" : "FAIL"} |

## Device scan testing

| Device | Plain QR | Logo QR | Notes |
|--------|----------|---------|-------|
| iPhone Camera | **PENDING** | **PENDING** | Expect open → lookcruise.com web |
| Android Camera | **PENDING** | **PENDING** | Same |
| Telegram / WhatsApp image | **PENDING** | **PENDING** | Prefer PNG attach |
| Print | **PENDING** | **PENDING** | ≥ 3–4 cm side |

## Usage tips

- Prefer **plain** QR for maximum scan reliability.
- Keep the white quiet zone; do not crop tightly.
`;

fs.writeFileSync(path.join(outDir, "README.md"), readme, "utf8");

if (!plainOk || !logoOk) {
  console.error("QR decode verification failed");
  process.exit(1);
}

console.log("Wrote assets to", outDir);
