# References — Jet Point v3 (studied 26 Nov 2026, before drawing)

User rejected v2: "pesawat jet 3 jelek, map jelek". The cockpit was NOT
complained about — it stays. These references were downloaded and LOOKED at
(Wikimedia Commons, public-domain / freely licensed) to fix the two defects:
the TPP jet and the terrain. What each one taught is listed, then applied in
`game/src/render.js`.

## Jet — what a real jet looks like from behind-above

- **F-16 rear view** — `Rear View of ROCAF F-16A 6718 at Ching Chuang Kang
  AFB 20140719.jpg` (Wikimedia Commons):
  From directly behind, the jet is dominated by the BIG round exhaust nozzle
  (dark hole, metallic petal ring), the tail fin rising TALL above the
  fuselage (thin, swept back), wide flat wings with a slight downward angle,
  wide horizontal stabilisers low down, and a round fuselage tube — bright
  on top where the sun hits, dark underneath. It reads as a machine because
  of the bright-top / dark-belly contrast, not because of outline detail.
- **F-16 hot end** — `Hot end of a F-16 (18583421706).jpg`:
  The nozzle is a ring of metallic petals (alternating light/dark segments,
  heat-stained) around a deep dark centre showing turbine blades. The wings
  from behind are thin slabs with a sharp bright leading edge.
- **Applied (v3 `drawJetTPP`)**: chase view from behind-above; fuselage
  foreshortened (nose far = small, tail near = big); strong top-light
  gradient on fuselage and wings with a dark belly/trailing edge; tall
  swept vertical fin with livery + logo + leading-edge highlight; wide
  horizontal stabilisers; twin dark exhaust nozzles with metallic petal
  rings and an orange glow that grows with throttle; glossy dark canopy
  with a specular streak; winglets standing up at the tips; and a soft
  dark shadow cue on the ground rushing below the jet (a true projected
  shadow sits below the frame in a chase view, so this one is a
  screen-space cue that shrinks and fades with altitude).

## Terrain — what the ground looks like from the air

- **Coastline** — `Aerial View, A coastline of Hailing Island, Yangjiang
  City.jpg`:
  Land is never one flat colour: dense mottled green forest (thousands of
  small light/dark blobs), pale grey-beige rock with dark cracks, white foam
  lace along an IRREGULAR coastline, sea in deep teal-green with fine wave
  noise and lighter/darker patches, offshore rocks ringed with foam.
  Applied: ground is mottled with multi-scale noise (never a flat band);
  the sea/sand boundary wobbles with noise; a white foam band and a darker
  wet-sand band sit at the waterline; the sea carries fine wave speckle and
  a sun-glitter streak.
- **Mountains** — `Mountain peaks covered with snow and ice aerial view.jpg`:
  Snow is not pure white: bright white on sunlit faces, pale BLUE in the
  shadowed gullies; rock outcrops are dark grey-brown and cast long
  shadows; ridgelines are sharp and jagged, never smooth sine curves; the
  whole mass has a strong sun/shadow split.
  Applied: mountain ground is shaded by slope direction (sun-facing light,
  lee-side dark blue-grey); the snowline is jagged (noise); dark rock
  outcrops where the noise is high; distant ridges are drawn as jagged
  silhouettes with a light face and a dark face plus white snow caps.
- **City** — `2010-365-251 The Bronx aerial view (4972664239).jpg` (night):
  A city reads through its STREET GRID: a dense network of lines, dark
  blocks between them, brighter thicker arterials, grids at different
  angles, a river/coast edge. Applied (day version): grey-beige blocks with
  per-block tone variation, darker streets, a few green park blocks, varied
  roof tones — never one flat grey.
- **General (all refs)**: distant ground fades into pale blue-white haze at
  the horizon; clouds are soft white puffs with grey bottoms and cast soft
  dark shadows on the ground. Applied: stronger horizon haze gradient, and
  cloud shadows projected onto the ground.

## Flight-game chase views (from memory of the genre, checked against the refs above)

Microsoft Flight Simulator / Ace Combat 7 / Infinite Flight chase views all
share the same recipe: the aircraft is big in the lower centre, seen from
behind-above with the nose foreshortened; the ground rushes below with
texture that is dense near and hazy far; the horizon sits high and soft;
the aircraft's shadow is visible on the ground. v3 follows that recipe in
canvas 2D — the art direction and shading changed, the engine did not.

## v4 — the user's own references (sent 17:54 WIB 26 Nov, after rejecting v3)

The user sent 8 photos. The two defects they named are real and were fixed
from these, not from memory.

- **Ref 1 — two FA-50s in formation, rear three-quarter** (the key ref):
  Nose far and small, tail near and big; the long side of the fuselage is
  visible with a dark bubble canopy just ahead of the wing root; the near
  wing sweeps toward the viewer, foreshortened, top surface sunlit; the far
  wing extends away, darker; the vertical fin is tall, swept back, at the
  rear; the exhaust nozzle is a dark round hole with a metallic ring at the
  very tail; wingtip rails, nav lights, contrails from the wingtips.
  Applied: TPP camera moved to ~30° off the tail axis (24 m starboard, 42 m
  behind, looking back at the jet) and the jet redrawn on that geometry —
  nose up-right, tail down-left, fuselage with canopy, near wing toward the
  viewer, tall teal fin, twin nozzles with petal rings and afterburner glow.
  The FA-50 is single-engine; our jet keeps twin nozzles (the cockpit's
  EICAS shows two engines) — the silhouette is the same fighter shape.
- **Ref 2 — FA-50 on the tarmac, side view**: long pointed radome, bubble
  canopy, cropped-delta wing, tall swept fin, single dark nozzle, intake
  under the fuselage. Confirms the fuselage/canopy/wing/fin proportions
  used in the v4 TPP redraw.
- **Ref 3 + 4 — runway from the air**: threshold "piano keys" (full-width
  white stripes), centreline dashes, runway number, grass at the sides,
  taxiway. Applied: drawRunway now paints piano keys at BOTH thresholds
  and a centreline along the strip (before, only 5 small dashes).
- **Ref 5–8 — night cockpits (aurora, city lights, final approach, Airbus
  sunset)**: lit instrument panels, overhead panel, runway lights ahead,
  city lights below. NOT applied in v4 — the FPP cockpit was kept as-is
  (the user never complained about it); these are recorded here for a
  future iteration if the user asks for a cockpit pass.
- **The v3 defect, root-caused (not just patched)**: the "buildings above
  clouds" came from TWO independent bugs — project() double-counted pitch
  (its ground points sat FOCAL·sin(pitch) away from where drawGround drew
  the ground) and drawGround rotated the frame by +bank while project()
  and the PFD rotate the world the opposite way. Fixed both, moved the
  ridges into the same rotated frame as the ground, and added a
  horizon-clip (clipBelowHorizon) as a belt-and-braces guarantee: no prop,
  runway or cloud shadow may ever appear above the tilted horizon line.
  Verified in all 4 new screenshots: sky above, ground below, mountains on
  the horizon, nothing floating.
