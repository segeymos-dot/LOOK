# LOOK QR codes

## Encoded URL

`https://lookcruise.com/open`

This is the permanent public LOOK entry (`LOOK_PUBLIC_OPEN_URL` / `/open`).

- Production app origin remains `https://lookcruise.com`.
- `/open` currently redirects to the web home; later it can open native apps / stores without changing this QR URL.
- Marketing site `https://lookappworld.com` is separate and is **not** encoded here.
- Staging Vercel URLs must **never** appear in QR codes.

## Created

- Date: **2026-08-23**
- Generator: `scripts/generate-look-qr.mjs` (QR error correction **H**, quiet zone **4** modules)

## Files

| File | Format | Notes |
|------|--------|--------|
| `look-qr.png` | PNG | 2048×2048 px, black on white, quiet zone |
| `look-qr.svg` | SVG | Vector, same payload / ECC |
| `look-qr-logo.png` | PNG | 2048×2048 px + LOOK mark (~18% center) on white island |
| `look-qr-logo.svg` | SVG | Vector + LOOK “L” mark in center |

## PNG sizes

- `look-qr.png`: **2048 × 2048** pixels
- `look-qr-logo.png`: **2048 × 2048** pixels

## Decode verification (automated)

| Version | Decoded URL matches | Result |
|---------|---------------------|--------|
| Plain (`look-qr.png`) | https://lookcruise.com/open | PASS |
| Logo (`look-qr-logo.png`) | https://lookcruise.com/open | PASS |

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
