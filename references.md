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

## v5 — the user's OWN references (18:07 WIB 26 Nov, user order: "Rubah seluruh model pesawat nya, dan jadikan referensi ku")

The user sent 8 photos and rejected v4 ("Pakailah referensi ku. Buat semirip mungkin. Jelek banget ituuuu punyamu"). The v4 jet model was DELETED entirely and rebuilt from scratch; v4's diagonal axis + teal livery are gone.

- **Ref 1 — two FA-50s in formation (three-quarter side view, flying)**: THE jet model. Flat horizontal flight, nose right, plain light grey, long pointed nose, tandem bubble canopy (dark glass), ONE tall swept fin, swept wings with wingtip rails, single-engine tail. Applied in v5 `drawJetTPP`: the jet is drawn horizontally across the frame (fuselage axis y=445, nose x=935, tail x=365), plain grey gradient (bright spine, dark belly), no teal anywhere; canopy is a long dark tandem bubble with a specular streak and a two-seat split line; ONE fin, narrow base, swept, with a small dark tail marking; near wing broad-chord sweeping down-right with a wingtip rail + missile and underwing stores; far wing tucked behind the fuselage; twin nozzles with subtle petal rings + afterburner glow; nav lights red/green/white. Three visual iterations (fin too sail-like → narrowed; wing too needle-like → broadened; panel lines too segmented → removed).
- **Ref 2 — FA-50s parked on the tarmac (side view)**: fuselage proportions, radome (slightly darker nose cone + panel line), landing gear, underwing stores. Applied: radome shading + gear struts + store pylons.
- **Ref 3 — runway from the air**: threshold piano keys, centreline dashes, grass both sides, taxiway. Already in v4 `drawRunway` (kept): piano keys at both ends, centreline, approach lights, PAPI.
- **Ref 4 — airliner on a runway**: runway numbers, threshold, asphalt + grass. (Numbers not drawn — the strip is small in frame; threshold + centreline + grass carry it.)
- **Refs 5–8 — cockpits (aurora night, city night, final approach, Airbus sunset)**: the FPP cockpit was already good and is untouched in v5; these refs confirm its lighting and layout (lit glass screens below, wide windshield, horizon outside). Recorded for a future pass, not applied.
- **v5 terrain fix (user: "mapnya jelek")**: sea-leg props no longer stand on open water — islands are generated BEFORE props and sea props (palms + huts) are placed ON islands only (world.js). Storm shot verified: island with palms + red-roof huts, no trees on the sea.

---

# v6 — user: "Masih jelek banget. Rubah lagi map dan pesawat jet nya" (19:20 WIB 26 Nov) + Sketchfab (19:24 WIB)

User rejected v5. Task brief (parent): ref 1 is PRIMARY — FA-50 proportions:
fuselage NOT too long, WIDE wings, LARGE canopy, TALL fin; terrain GREEN
forested mountains, white clouds, blue sky.

## What was wrong in v5 (measured, not guessed)

- Jet: fuselage 567 px long (nose 935 → tail 368) vs wingspan ~255 px —
  a long dart, not the stubby FA-50 (length/span ~1.39). Near wing a thin
  diagonal slab; canopy only 150 px and flat. v6: fuselage 420 px
  (nose 890, tail 470), near wing BROAD (root chord ~75 px), canopy
  160 px long rising 34 px, fin 136 px tall. Plain grey, no teal.
- Map: distant ridges were blue-grey with snow caps (v3 snow-peaks ref) —
  ref 1 mountains are GREEN and forested, no snow. v6: all three ridges
  green tones (far hazy blue-green, mid green, near rich dark green),
  snow caps removed.
- TPP shot was the beach leg (orange sunset sky). v6: shot 2 moved to
  Alpine Pass (level 4) — blue sky + green mountains = ref 1.
- Traffic planes read as white whales (fat oval fuselage, pure white top).
  v6: slimmer silhouette (w 40*s, h 6*s), greyer gradient.
- WP ring sat right-of-centre in TPP (v5). v6: TPP staging flies until
  the ring is within ~15° of heading, 300–900 m out — centred like cover.
- Landing panel covered the runway centre. v6: veil 0.42→0.28, panel
  520→480 px wide.

## Sketchfab research (user 19:24 WIB: sketchfab.com/tags/fighter-jet)

- KAI FA-50 Golden Eagle 3D model exists on Sketchfab by NETRUNNER_pl
  (collection "Aircrafts fighters bombers jets" #0053; 10.2k views,
  37 likes, animated, low-poly, rigged). F-16 models: Lowpoly F16
  Block 70 (SIpriv, CC-BY), Low-Poly F-16 (Caelin), F-16 by Studio Lab.
  FA-50 is the F-16 lineage (T-50 developed by KAI with Lockheed Martin).
- Verified specs (KAI / Wikipedia / ODIN): length 13.14 m, wingspan
  9.45 m (with wingtip missiles), height 4.94 m, crew 2, wing area
  23.69 m², **1 × GE F404-GE-102 afterburning turbofan — SINGLE engine**,
  Mach 1.5, 20 mm cannon, 7 hardpoints.
- **Accuracy fix applied in v6: SINGLE exhaust nozzle.** v1–v5 drew TWIN
  nozzles — wrong for an FA-50/F-16 (one engine, one nozzle). v6: one
  large nozzle (r 14) at the tail centre with a 12-petal ring + afterburner.
- Also applied from the 3D-model study: LERX (leading-edge root extension
  strake ahead of the wing root) and a pitot tube on the nose tip.
- Length/span ratio 1.39: v6 fuselage 420 px vs projected span ~320 px —
  matches.

## v7 — Sketchfab KAI FA-50 Golden Eagle hero render (user's link, 26 Nov 2026)

User sent https://sketchfab.com/tags/fighter-jet (19:24 WIB) and rejected v6:
"Masih jelek, ikuti lagi link referensi yang ku kirim tadi". The hero render
studied was the KAI FA-50 Golden Eagle 3D model by NETRUNNER_pl (10.2k views,
animated, low-poly, rigged) — local copy
`~/workspace/makefun/jet-v7-refs/fa50-sketchfab-hero-1920.jpg`.

What the hero render taught (SHAPE only — NOT its black/white display paint;
our jet stays PLAIN GREY like the user's photos):
- Wing planform: BROAD swept wings, ~40° leading-edge sweep, BLUNT tips
  with wingtip rails — never a needle point. Root chord is ~1/3 of the
  fuselage length; the top surface is clearly visible from above-behind
  and carries a spanwise light-to-dark gradient.
- LERX: a prominent smooth strake running from the wing-root leading edge
  forward along the fuselage to the canopy — not a stub.
- Long bubble canopy, low profile, glossy dark with a bright specular
  streak along the top; two-seat split line.
- ONE tall swept fin (leading edge swept ~35–40°, broad base), single
  exhaust nozzle at the tail centre (FA-50 = one F404 engine).
- Stabilators: small, mostly edge-on from the chase angle — never a second
  big wing.
- The chase camera rolls WITH the aircraft: in the hero render and in
  REF 1 (FA-50s in formation, LEVEL flight) the fuselage axis is always
  HORIZONTAL in the frame. A banked jet in the frame reads as a mistake,
  not as motion — the turn is carried by the world's tilt, never by the jet.

Applied in v7 (`game/src/render.js`): jet rotation removed entirely (level
in frame, always); near wing redrawn broad with a blunt tip chord + spanwise
shading + trailing-edge band; far wing broadened the same way; LERX
lengthened to the canopy; fin leading edge swept ~21°; near stabilator
shrunk and tucked at the tail; HUD centre marker hidden in TPP view (it sat
on the canopy); traffic occluded by the hero jet skipped (plane + label);
mountain ground lost its snow (ref 1: green forest to the top) and gained
forest speckle; ridge faces carry a vertical crest-to-base gradient; fog
blend over mountain ground 0.32 → 0.2; landing panel moved to the TOP of
the frame (below the HUD bar) so the runway stays visible.

---

# v8 — user: "Untuk kokpit sudah ok, untuk map masih jelek dan 3d pesawat jet nya ancur parahhhh. Perbaiki sekarang" (19:47 WIB 26 Nov)

User verdict on v7: cockpit FPP is OK (do NOT touch it); the MAP is still ugly;
the JET's 3D is terribly broken. v7's jet was a FLAT paper cutout: fuselage a
flat white tube, wing a flat white triangle, far wing a separate blade.

## What was wrong, exactly (parent's diagnosis, verified against the v7 shots)

- Fuselage: a flat polygon with a vertical linear gradient + a straight
  white "spine highlight" stripe — it read as a white pen, not a round tube.
- Far wing: a steep thin sliver, mostly hidden behind the fin — it read as a
  separate blade, not a wing. Root cause: strict perspective from the low
  chase angle foreshortens the far wing's chord to almost nothing.
- Near wing: one flat polygon — no thickness, no underside; the underwing
  stores sat ON the surface and read as dark spots.
- Canopy: a flat black blob (fixed in v8: glass with sky reflection).
- Map: ridges were triangle pairs (flat triangles); ground was mottled noise
  (a mosaic of flat rectangles). Desert leg showed GREEN mountains (off-theme).

## v8 fixes (`game/src/render.js` only — no world/flight-model change)

- JET — volume, not outline: fuselage rebuilt as a CURVED profile (quadratic
  top/bottom edges, belly bulge) with a 5-stop vertical gradient (bright
  spine → dark belly) + a NARROW soft specular band (wide bands stripe) +
  belly shadow + curved panel lines + ambient occlusion at wing/fin roots.
- Canopy: glass — sky-reflection gradient (pale steel blue → deep blue-black),
  horizon-reflection band, strong diagonal specular streak, two-seat split.
- Far wing: SHALLOW (~30°) and BROAD with an EXAGGERATED chord (an
  illustrator's three-quarter view, like ref 1 — strict perspective would
  keep it a sliver); root tucked under the fuselage; chordwise shading;
  wingtip rail + red nav light ON the tip. Far stabilator shrunk to a small
  tip peeking under the tail.
- Near wing: chordwise gradient (bright LE → dark TE) + a DARK UNDERSIDE
  strip below the trailing edge (the thickness cue); stores now HANG below
  the wing on pylons (shaded tanks), not spots on the surface.
- Fin: chordwise gradient (bright LE → dark TE) + rounded tip + darker base
  fillet. Nozzle: afterburner is now a tapered FLAME CONE (bright core →
  orange → transparent), not a floating orange ball.
- MAP — organic terrain: `drawRidge` rewritten as a multi-octave noise
  POLYLINE with per-segment sun/lee shading + crest highlight + forest
  speckle + rock patches (no more triangles). Ground cells 24 → 48 segments;
  mountain theme rebuilt with STRUCTURE: valley-floor farmland rectangles,
  dark forest slopes, rock crests, and a RIVER winding down the valley floor
  (follows the route centreline); mountain fog is greenish and lighter
  (blend 0.2 → 0.16). Ridge colours are theme-aware now (desert = brown/
  orange, sea = slate, beach = warm green) — no more green mountains at dusk.
- Cloud shadows strengthened (alpha 0.13 → 0.20, radius 1.3 → 1.5).
- Camera: a more side-on chase angle (32/30) was tried and REVERTED — it
  pushed the waypoint ring to the frame edge and the jet sprite is drawn in
  fixed screen coordinates anyway, so the camera cannot fix the far wing;
  only the drawing can. Camera stays 24/42 (v4).
