# MERIDIAN — From Summit to Sea

A cinematic scroll site for a fictional global commodities group.
One continuous shot: first light above the clouds, down the mountain
face, through the white-out, out onto an overcast sea and the one
vessel working it.

Built as a zero-build static site: vanilla Three.js, hand-written
GLSL, procedural everything. No bundler, no framework, no assets
that needed a licence we couldn't print below.

## Run

```
npx -y serve .
```

Then open the printed URL (defaults to <http://localhost:3000>).
That's the whole setup — any static file server works the same
(`python3 -m http.server` included); the site is plain ES modules
behind an import map. WebGL2 required (every current browser).
There is no build step, no install step, no account, no API key.

## The tour

| Scroll | Beat |
|---|---|
| 0% | Dawn above a cloud sea; the wordmark tracks in; birds ride the summit thermal |
| 25% | Down the north face — the mission set in Cormorant italic over sunlit snow |
| 40–55% | Into the deck. Divisions dissolve into fog. At 50%: white-out, one held breath, the altimeter loses signal |
| 57% | Through the cloud base — the horn — open water |
| 75–100% | Low over the swell to a lone bulker at anchor, closing statement, footer like a last shot |

**Sound** is off by default (rubric manners). The `SOUND` toggle or
`M` opens the air: wind, a thin summit whistle, the held breath, a
foghorn on the breakthrough, the sea. Every sound is synthesized in
WebAudio at runtime — filtered noise, detuned saws, slow LFOs. There
are no audio files in this repository.

**The instrument** (right edge) is the signature: a live altimeter
that runs the entire descent, loses signal in the white-out, and
re-acquires as a nautical position fix once you're on the water.

## How it's made

- **One scene, one unbroken camera** — two Catmull-Rom splines (eye
  and gaze) with control points clustered at the seam so the camera
  itself holds its breath. Native document scroll; the camera lerps
  toward the scrollbar, so wheel-spamming can't break the shot.
- **Volumetric cloud deck** — a single fullscreen composite pass
  raymarches a slab of baked 3D fbm+Worley noise against the scene
  depth buffer (the summit genuinely pierces the deck), with a
  3-tap sun march, powder term, and blue-noise jitter.
- **Shared atmosphere** — sky, terrain, ocean, vessel and fog all
  include the same GLSL palette functions, so the fog can never
  mismatch the sky, at any scroll position.
- **Procedural world** — ridged-fbm alpine massif sculpted on the
  CPU at load (with an honest loader), Gerstner ocean whose wave set
  is shared with the JS that floats the vessel, a bulker built from
  boxes and restraint.
- **Adaptive quality** — frame-time EMA drives render scale and
  march steps; DPR-capped; pauses when the tab hides; WebGL loss and
  no-WebGL degrade to a readable fallback.
- **Reduced motion** respected in both CSS and JS: no drift, no
  parallax, no letter animation, becalmed water, instant scroll
  consumption — the journey remains fully navigable.

```
index.html          story DOM — real text, real headings, screen-readable
styles.css          the type system (Jost 100–400 variable + Cormorant Garamond)
src/
  main.js           boot, loader stages, frame loop, adaptive quality
  config.js         world constants, act timing, section windows
  scroll.js         native scroll consumed with weight
  camera-path.js    the one shot
  post.js           3D-noise bake + cloud/fog/grade composite pass
  ui.js             section choreography, ink grading, the instrument
  audio.js          the synthesized mix
  scene/            sky, terrain, ocean, vessel, birds, snow
  shaders/          shared GLSL: noise, atmosphere, height fog
vendor/             three.module.min.js r166 (only dependency)
fonts/              woff2 subsets + OFL licences
```

## Licences

| Asset | Source | Licence |
|---|---|---|
| three.js r166 | npm `three` | MIT — `vendor/THREE-LICENSE.txt` |
| Jost (variable) | Google Fonts | SIL OFL 1.1 — `fonts/OFL-Jost.txt` |
| Cormorant Garamond | Google Fonts | SIL OFL 1.1 — `fonts/OFL-CormorantGaramond.txt` |
| Everything else | generated in this repository (terrain, clouds, ocean, vessel, audio, favicon, OG image) | — |

MERIDIAN is a fictional company created for a benchmark. No real
brand is referenced, imitated, or harmed.
