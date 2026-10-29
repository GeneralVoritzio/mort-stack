---
name: replicate-ui
description: Rebuilds a web page or app 1:1 from a live URL. Captures the original once into a reference set, turns it into a spec and a check list, builds against the spec, and passes only when every measured check is green. Use when asked to copy, clone, mirror, match or make something "1:1" with an existing UI.
---

# Replicate UI

This skill copies a UI by measuring it, not by eyeballing screenshots. You
capture the original **once** and write it down as numbers. After that, every
build iteration compares the copy against those numbers. The original is never
opened again. This is what makes the skill cheap: a check list costs a few
hundred tokens per run, while a screenshot comparison costs thousands and still
misses 4px.

## 0. Settle the scope before capturing

Ask, or read from the request:

1. **What to copy.** Choose one:
   - **Full**: layout, sizes, spacing, type scale, colours and fonts.
   - **Structure**: layout, sizes, spacing, type scale and motion only. Colours,
     fonts, copy, images and icons stay yours, and each of their roles maps to
     one of your tokens.
2. **The licence.** Check the source's licence before you copy anything.
   - Open source with a permissive licence: you may reuse code, with attribution.
   - Source-available licences (ELv2, BSL, SSPL) and anything proprietary: copy
     design facts only (sizes, colours, layout). Never copy a line of their code
     or their class and token names. Rename every token into your own system.
   - Never copy text, illustrations, photos, logos or icon sets unless they are
     yours or their licence allows it. Use placeholders.
3. **Viewports.** The default is desktop 1440×900, tablet 768×1024 and phone
   390×844. Add any width where the layout visibly changes.
4. **States.** List the pages, plus the states that matter: hover, open menus,
   dialogs, empty and dark mode.

## 1. Capture the reference set (once)

Store it **outside the repo**, so neither a licence nor a secret can end up in
git:

```
<reference-root>/<source-name>/<YYYY-MM-DD>/
  shots/            full-page and per-section PNGs, one set per viewport
  measure-<W>.json  computed boxes, type and colours per section (capture.mjs)
  tokens.txt        :root custom properties, light then dark
  SPEC.md           the spec you write in step 2
  README.md         how it was captured, from where, and what is masked
```

Run the capture script against each URL:

```bash
node scripts/capture.mjs <url> <out-dir> [--viewports 1440x900,768x1024,390x844] [--cookie-file f]
```

It scrolls the page in steps to trigger lazy mounting, waits for fonts, and
then writes the shots, `measure-<W>.json` and `tokens.txt`.

### Rules that have cost real time when skipped

- **Use one source of truth per kind of fact.** A signed-in browser tab you
  drive through an extension is authoritative for visuals and hover rules. It
  often can't set an exact viewport, and a backgrounded tab freezes animations
  and never loads video. Use Playwright for exact-width numbers and motion
  timings. Write down which source owns which fact.
- **Playwright hides scrollbars by default.** Any check that measures scrollbar
  width will then pass whatever you build. Launch with
  `ignoreDefaultArgs: ['--hide-scrollbars']` and keep one control element whose
  value you already know.
- **Check pseudo-elements before you fail a border.** Many sites draw hairlines
  as `::before` or `::after`.
- **Mask secrets in the page before any capture.** That means API keys, tokens
  and emails. Say what you masked in the README.
- **Have extension tools return JSON objects, not `k=v;k=v` strings.** Output
  filters can mistake those strings for cookies and drop them.
- **Read semantic tokens from the stylesheet rules.** For example,
  `:root, .light` versus `.dark`. Only fall back to sampling computed colours
  when no tokens exist.
- **Label every font classification with the family name.** A regex for "serif"
  also matches "sans-serif".

## 2. Write the spec

`SPEC.md` is the build brief. Keep it in numbers:

- **System:** breakpoints, container widths, gutters, spacing rhythm, radii,
  shadows.
- **Type roles:** one row per role: size, line-height, weight and tracking at
  each breakpoint, plus the font you'll use in your copy.
- **Colour roles:** one row per role: their value and your token. In structure
  mode, the second column is all you'll use.
- **Sections:** per section, its boxes, grids (columns, gaps, cell sizes) and
  how its layout changes per viewport.
- **Corrections:** every time the spec turns out wrong, record what changed and
  why, with the old and new values. Later rounds read this first.

**A measurement must name its frame.** "x = 9" means nothing on its own: is it
relative to the row, the column, or the page? One repair once chased a
row-relative 9 as if it were column-relative and moved a whole sidebar 7px the
wrong way. Write `x (column) = 17`.

## 3. Turn the spec into checks

Write `checks.json`. Each entry is one fact that can be measured:

```json
{ "id": "D04", "viewport": "desktop", "section": "hero",
  "selector": "[data-section=hero] h1", "metric": "typography",
  "expected": { "fontSize": 64, "lineHeight": 70.8, "fontWeight": 400 },
  "tolerance": "defaults" }
```

- **Give the copy a contract.** Every top-level section must carry a
  `data-section` attribute, in the same order as the original, with the same
  element set at every viewport. Layout changes belong in CSS, not in swapping
  elements. The checks resolve against that contract, so they keep working
  while you restyle.
- **Use the metric families `measure.mjs` runs:** `sectionOrder`, `docHeight`,
  `sectionSizes`, `box`, `style`, `typography`, `grid` and `visible`.
  `templates/checks.example.json` has one of each.
- **Tolerances:** use 0 for counts and order, ±2px for boxes and type, ±8px for
  grid gaps, ±30px for section heights and ±150px for document height. Colours
  must match exactly, with whitespace removed.
- **Checks you can't automate** (feel, motion curves) still go in the list, as
  `"metric": "manual"` with a one-line instruction. The runner reports them as
  MANUAL, never as passing.
- **Never delete a check that was superseded.** Change its metric to `"skip"`
  and add a `reason`, so the history stays readable.

## 4. Build, measure, repeat

```bash
node scripts/measure.mjs http://localhost:5173 checks.json            # report
CHECK=1 node scripts/measure.mjs http://localhost:5173 checks.json    # exit 1 on any FAIL
```

- Build the shell first (tokens, type and the page frame), then shared
  components, then pages. If you build pages first, every component change ends
  up rewriting them.
- Point the runner **at your copy only**. Once the spec exists, the original is
  out of the loop.
- When a check fails, decide which is wrong: the copy, or the spec. If it's the
  spec, fix the spec, add an entry under Corrections, and only then touch code.
- Take 2x renders of both sides at the end for a human to judge. Numbers catch
  sizes. People catch the rest.

For a large app (more than about five pages), run steps 2 to 4 as a
`run-round`. Split the work into one lane for tokens and the shell, one for
components and one for pages, with `measure.mjs` as the gate.

## Done means

- `CHECK=1 measure.mjs` exits 0 at every viewport.
- The MANUAL checks have each been looked at, and the result written down.
- The reference set README says how and when it was captured, and what was
  masked.
- No copied code, copy or assets beyond what the licence allows.
