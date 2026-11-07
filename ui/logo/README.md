# rollin logo

An `r` followed by a lime underscore cursor. The mark copies the one on scottmacleod.co so the two share a family.

| File | Use |
| --- | --- |
| `rollin-wordmark-dark.svg` | "rollin_" for dark backgrounds |
| `rollin-wordmark-light.svg` | "rollin_" for light backgrounds |
| `rollin-icon.svg` | App icon, 1024 canvas, macOS-style margin |
| `rollin-icon-small.svg` | Same icon with a Bold `r` and a thicker cursor, for 16 to 32px |

## Geometry

- Letters: Geist SemiBold, tracking -0.06em, converted to outlines.
- Cursor: `#C5F04A` (`--signal`), 0.46em wide, 0.11em tall, bottom on the baseline, 0.06em after the last letter.
- Icon: `#0B0C0B` squircle (radius 185 on an 824 body), `#EDEFEA` letter.
- Small icon: Geist Bold, cursor 0.19em tall and 0.50em wide, so it survives 16px.

Geist is licensed under the SIL Open Font License 1.1. The SVGs contain only outlines, so no font file ships.

## Raster icons

`apps/desktop/src-tauri/icons` is rendered from these SVGs: the 32px PNG and the 16/24/32 frames of `icon.ico` use the small variant, everything else uses the standard icon. The `.ico` frames are cropped to the squircle body; the `.png` and `.icns` files keep the margin.
