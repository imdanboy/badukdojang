# Board UI Theming Plan

## Goal
Replace the default Shudan board appearance with katagui-style photorealistic themes, and provide a theme switcher UI.

## Background
- badukdojang uses `@sabaki/shudan` (SVG/DOM-based Preact Goban component)
- katagui uses JGoBoard (Canvas-based) with wood textures + 3D biconvex stones
- Shudan supports CSS customization via custom properties and class overrides

## Strategy
**Do NOT port JGoBoard rendering logic** (different rendering engine).
**Reuse katagui image assets** (stone PNGs, wood textures) as Shudan CSS background-images.

## Deliverables

### 1. Theme CSS files (3 themes)
Location: `src/themes/`

- `shinkaya.css` — light wood board (shinkaya), 3D stones
- `walnut.css` — dark walnut board, 3D stones with dark shadow
- `classic.css` — flat minimal board, flat stones (fallback)

### 2. Katagui image assets
Copy from `../katagui/katago_gui/static/large/` into `public/themes/`:
- `black43.png`, `white43.png` — 3D stones
- `shadow.png`, `shadow_dark43.png` — stone shadows
- `shinkaya.jpg`, `walnut.jpg` — board textures
- `mono.jpg` — flat board base

### 3. Board.tsx modification
- Accept a `themeName` prop (default: `shinkaya`)
- Pass theme class to `<Goban className={...}>`

### 4. ThemeSelector component
- Toggle buttons in ControlBar area

### 5. Wire up in App.tsx
- Add theme state + handler
- Pass to both Board and ThemeSelector

## Files to modify
| File | Action |
|------|--------|
| `src/components/Board.tsx` | Add `themeName` prop, apply class |
| `src/components/ControlBar.tsx` | Add theme toggle UI |
| `src/App.tsx` | State + wiring |
| `src/main.tsx` | Import theme CSS |
| `public/themes/` | New directory with assets |
| `src/themes/shinkaya.css` | New file |
| `src/themes/walnut.css` | New file |
| `src/themes/classic.css` | New file |

## Verification
1. `bun run dev` — board renders with shinkaya theme
2. Click theme toggle → switches to walnut → board/stones update
3. Switch to classic → flat board appears
4. All 3 board sizes (9, 13, 19) work with each theme
