<!-- This is the open-source copy of the game (https://github.com/LegoFighter/heart-of-the-light).
     It was built inside a private monorepo; the notes below still say `apps/web`,
     `docs/neues-spiel.md`, `@minigames/kit` and the like where they mean that repository. The
     four kit modules the game uses are in `kit/` here. Nothing in this copy sends anything
     anywhere: there is no tracking. -->

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Heart of the Light

A small glade in dense pixel art (owner, 2026-10-24): a wanderer with a lantern gathers five
lights and carries them into a glowing cave, while the glade lives and breathes round them, by
day and night and in six kinds of weather. `README.md` says what is there. On minigames.world as
a demo since 2026-10-24 (owner: "create a demo entry on minigames.world", then "just upload"),
before its blind play is checked, so not on `/accessible-games` yet. Reply to the owner in the
language of their last message. Rules the owner set that are not obvious from the code:

- **The pictures come from OpenAI's newest image model** (owner: "use magenta and latest image
  model"; on 2026-10-24 that was `gpt-image-2.5-sunburst`, picked over `-flare` side by side), not
  from grok: `tools/art/openai.py` with the prompts beside it, the raw pictures in
  `tools/art/raw` (not checked in). Anything cut out is drawn on flat magenta (#FF00FF) and keyed;
  the model draws no transparent ground. Pictures are original: the owner's reference screenshot
  was only for the style.
- **The palette filter** (owner, 2026-10-24, on a tester's word that the video looked sloppy, a
  "ChatGPT piss filter": "use the color of the assets and create a filter for a color palette"):
  the painting came from the generator with a yellow cast (olive grass, cream for white, half as
  much blue as red). `lib/palette.ts` takes the cast off its 96 colours (white balance, the
  yellows and olives turned towards green, the browns kept, a little cool in the shadows; a colour
  that is cool already passes as it is), lays them under the hours' lights, the lantern and the
  snow, and builds a 32x32x32 cube from them; the shader looks every finished pixel up in it (the
  last step, with a hair of ordered dither), so the whole frame sits in one palette made of the
  painting's own colours. The painting file stays as it is: the mask tooling keys off its colours.
  The dusk's tint was softened and the night's blue deepened with it (`game/sky.ts`).
- **Rain stays cosy** (owner, 2026-10-24: "der Regen ist mir ab und zu zu wild … etwas mehr
  coziness"): rain and storm are softer than they were (`AIR` in `game/weather.ts`: less rain,
  less wind, less dark), a storm is drawn less often and passes in 25–45 s, lightning comes every
  7–19 s and flashes dimmer, the long bright drops only in heavy rain; in rain the cottage's
  windows glow and the chimney smokes more. Every drop lands (owner: "der Regen fällt quasi in
  der Luft auf den Boden"): a landing point per cell, the streak its last pixels above that point,
  slanted by the wind about it, and the splash at the point after what it hits (water, leaves,
  stone, ground); `rainLayer` in `lib/stage.ts`.
- **A tester's second notes** (2026-10-24, "it's all just one single static image?"): the wanderer
  goes behind a crown whose leaves reach below their feet (the shader drops the figure's pixels
  under `leafInFront(p, hero.y)`); grey pixels under the leaf mask (rock, bark) no longer sway;
  frozen water stays ice to look at and takes snow only when the cover is nearly whole; the
  butterflies stay in while snow lies. The note's larger point, separate objects instead of one
  painting, is not done: it is a rebuild of the scene, not a fix.
- **Everything lives** (owner: "Es muss alles leben atmen"): leaves, grass, flowers and the
  cottage garden sway; water runs; smoke rises. **What is solid never sways** (owner: the fallen
  log, the stump, stones; "the house garden is not moving in the wind, which seems odd"): the
  cottage, fences, barrels, rocks, the log and the stump stay still (`STILL` and the colour rules
  in `tools/art/masks.py`). A new thing in the scene gets its kind there.
- **Pure pixels** (owner, 2026-10-24: "make it pure"): one pixel size on screen. The painting is
  one pixel per texel with no bigger fake pixels; everything drawn goes on its 1024x576 grid at
  whole pixels (no smooth scaling, no blur, no sub-pixel places); the canvas is shown at a whole
  number of device pixels per pixel, and the camera stands on whole device pixels: it glides a
  screen pixel at a time (owner, the same day: "mach die kamera doch flüssig"; steps of a whole
  painting pixel stuttered) and aims at the pixel the wanderer is drawn on (`lib/camera.ts`). The
  HUD's words are a layer of their own over it.
- **The wanderer is a cut-out puppet pressed into a pixel sprite** (owner: "construct the
  character from einzelnen stücken und rigge ihn, pack einen pixel filter drauf"): exploded part
  sheets per view, one atlas and rig (`tools/art/parts.py`), posed and filtered in
  `lib/puppet.ts`. After the owner's look at the first version ("weird baby like walking", "the
  outline don't match the general style", "much bigger, does not fit the scaling"): no black
  outline (the silhouette's edge is a darker shade of its own colour, as the painted glade has
  it); 30 pixels tall, below the cottage door; grown-up proportions (`PROPORTION`); a calm walk
  (`SPEED` 42, `CYCLES` 1.9, hardly any rocking). On 2026-10-24 ("kontrast farbe der character
  passt auch nicht"): the sprite's palette is the atlas's toned down and snapped to the glade's
  96 colours (`tone`, `nearest` in `lib/view.ts`), the lantern's yellows kept.
- **Cold shows** (owner, 2026-10-24: "dampf ausatmen bei schnee, dann gefrieren vom wasserfall"):
  as the snow lies (`cover`), the falls freeze from their edges in columns and the pool and
  stream from the shore (`toEdge`, `ice` in `lib/stage.ts`; the middle stays open), the spray and
  the roar go down with it, and the wanderer breathes little clouds (`drawBreath`). The owner
  then asked for the whole list of what would make the glade more real ("alles"): the sun's
  shadow and footprints, snow caps and clumps and the eave's drip, snow giving light back, the
  windows from dusk and the door's light, more smoke when cold, dawn rays and the stream's mist,
  the golden hour's rim, the moon's patches, puddles and wet stones, the deer, the birds, the
  fish, the beetle (all of them there from the start, whatever the hour, with no pin in the
  address: owner, "it should be all active at once, without any url manipulations"), the grass
  giving way, and steps by ground, creaks and ice cracks (`lib/view.ts`,
  `lib/stage.ts`, `lib/sound.ts`; the path is G 128 in `masks.png`). Not done: stars and a moon
  (the picture has no sky), spray on the figure. The rain falls in sheets with uneven streaks
  (owner: "noch ein bisschen gleichförmig"); its slant follows the gusts in time only, since a
  slant that changes from pixel to pixel bends the streaks into arcs. Later that day: the cloak
  is cloth (`Cloth` in `lib/puppet.ts`: it lags the walk, takes the wind, its hem a beat behind,
  a shear in the rig's poses; owner: "mach den umhang animierter und realistischer"); the rain
  strikes rock in a burst and water with a plop and a bead thrown up, the ground with a flat
  dash (owner: "auf wasser und auf kliffen anders animiert"); and the gusts' shine is faint and
  the leaves' rustle only in a gust, since a tester took the bands rolling over the crowns for a
  bug. In snow the wanderer takes the cold and a cap of snow on the hood, the shoulders, the
  satchel and the lantern (owner: "to few snow on the character he must blend into the
  surrounding"; in `lib/stage.ts` where the overlay is laid on). The cap is brighter than the
  ground snow: the same white melts into the snow behind and only shrinks the silhouette, and a
  dark outline above it floats off the hood.
- **Layers under and over the glade** (2026-10-24): besides the overlay and the glow the shader
  takes a *ground* canvas (what presses the snow down: the footprints, alpha the hollow and red
  the lit rim; read only where snow lies, so they are dents, not marks painted over it: owner,
  "i need those foot step in the snow") and a *behind* canvas (the deer; laid under a crown whose
  leaves go on down past the deer's feet, `leafInFront`: owner, "die deers sind vom sorting
  layer nicht korrekt"). A tester's notes the same day: a minute is long (the weather changes
  every 40–90 s now, snow settles in 40 s and melts in 70, and the button's change comes in
  seconds, snow switched off there melting in 8), the figure gets lost in the detail (the ground
  round the silhouette is a step darker; look at the picture in black and white), the wind
  rippled too much while the figure stood still (sway and rustle smaller, the cloak moves), the
  snow lacked depth (three layers of flakes, far small slow dim, near big fast bright). The
  deer is a rig in code, `lib/deer.ts` (owner: "rig das deer damit es wirklich läuft und
  springt"): body rows, legs from hip to hoof as one-pixel lines, neck and head on the shoulder,
  with a stand, a four-beat walk and a bounding gallop; `drawDeer(c, x, y, facing, pose)` draws
  it on any 2D context, so a test can render its frames without a browser.
- **The music is ours.** The owner's reference (a one-hour dulcimer-and-nature video on YouTube,
  `kPIlfKpqyDo`, fetched with the owner's converter `~/privat/yt-mp3-downloader`) set the mood
  only: C and G minor, free time, four or five notes a second, warm and low. None of it is in the
  game; `lib/sound.ts` plays its own dulcimer. Sounds are never aggressive; the owner judges them
  by ear.
- **Agents keep the browser silent:** pictures come from a muted Chromium of its own
  (`tools/shot.mjs`, `tools/frames.mjs`), never the shared Chrome.

- **The glade is objects** (owner, 2026-10-24, after "ich kann auf Büschen laufen und nicht hinter
  Bäume": "regenerier es ohne Flora … rig die Bäume … bau die Szene so auf"; released as 0.2.0 the
  same day): the painting is the ground alone (the first painting edited with every plant taken
  out, so the layout shifted a little and `game/world.ts` and `masks.py` were retraced), and the
  trees, bushes and rocks stand on it as sprites (`public/assets/flora.png`, `flora.json`, cut by
  `tools/art/flora.py` from sheets on magenta; the rocks laid over the rocks painted on the
  meadow). `lib/flora.ts` places them by their feet among the wanderer and the deer: behind the
  wanderer on the `behind` canvas, in front on the `front` canvas (so the overlay holds no plants
  and the figure's box logic stays clean), and rigs a crown in 6-row bands that shift by whole
  pixels, more the higher, with one phase that runs with the wind across the glade (owner: "the
  trees should have more same moving patterns"). The shader lays the breeze over those canvases
  (`breeze`: a gust takes neighbouring plant pixels in a wave and shines) and the snow
  (`plantSnow`: lit leaves and a cap on each crown's top edge). Trunks, bushes and rocks block
  the feet (`TRUNKS`, set from `flora.json`; a rock's block sits a little up in it so the
  wanderer stands hidden behind its top). Trees stand where the first painting had its forest
  (its leaf mask is the zone, from the main checkout's old `masks.png`), the trunks 34 px inside
  its edge, never on stone (owner: "ein Baum auf dem Stein ist schlecht"), the south entrance
  free. `leafInFront` is gone with the painted crowns. Not carried over: leaves dropping from the
  crowns (the crown mask is empty), the golden hour's rim on crowns, the painted chimney smoke
  still in the ground beside the drawn one. The weather button's change goes on from where it
  is when pressed again (owner: a storm showed for a moment between rain and snow).
- **0.3.0, the same evening** (owner: "setz deine Vorschläge um", after "diese Wind-Wellen-Shader
  … macht das Bild unruhig" and a wish for more animals, herds, animals that walk up and leave
  the picture or run through the river): the wind is one slow broad gust every ten to twenty
  seconds (`gust` in the shader and `lib/flora.ts`, the same formula), the crowns' bodies stand
  and only edge leaves let go for a frame in a gust (`breeze`); leaves fall and snow drops from
  a still render of the flora (`plantPixels` in `loadArt`). The animals are `lib/fauna.ts`: a
  herd of four deer (a leader, three at their places, one head always up) that grazes by the
  stream, looks up at 130 px, flees at 88 px together towards the edge away from the wanderer,
  west through the stream (wading at half speed with a splash, `WADE` and `LEFT_BANK` in
  `game/world.ts`, where only animals go) and up the far bank off the picture, and walks back
  from that edge half a minute later; rabbits at three bushes that hide behind their bush; a
  fox along the wood's south edge at dusk and dawn; a heron at the pool at dawn that flies off;
  a squirrel on a trunk; an owl in a conifer at night; ducks on the pool in rain. Animals go
  where `animalWalkable` allows and round trunks and rocks (`step`); the deer has an along-view
  (`drawDeerAlong`) for going up or down the picture. Every animal is an `Actor` with its feet
  on a point, and `View.drawSorted` merges plants and actors by that point. The ground canvas
  carries each object's shadow to the lower right (blue) and the sun's patches under a crown
  (green), read by the shader after the snow; the painted chimney smoke was painted out of the
  ground (a masked edit of the committed `scene.png` scaled up twofold, `tools/art/raw`). The
  raw pictures of 0.2.0 were lost with the worktree they were drawn in: `tools/art/flora.py`
  cannot be rerun without drawing new sheets. `tools/debug-fauna.mjs` prints the herd's state
  from the dev server (`window.hotlView`, dev only).
- **0.3.1** (owner: "paar mehr Nadelpflanzen rauf, keine Pflanzen wegnehmen, alle Steine auf der
  Wiese wegnehmen … und Steine drauf setzen"): `tools/art/more.py` works on `flora.json` as it
  is, since the sheets are gone: 45 conifers more in the old forest's zone (`raw/old-masks.png`,
  from git), the rock objects over the painted rocks dropped, the painted rocks on the meadow
  painted out (a masked edit of `scene.png` at twice the size; the edit repainted the whole
  picture, so only the masked boxes were taken), and twelve rocks set anew on the open meadow,
  off the path, the lights and the way in.
- **0.3.2** (owner: the deer "move position and flicker when turning … maybe they should turn by
  looking up or down"; "von der Pixelfarbe passen die nicht ins Bild"): each deer has a heading
  turned smoothly towards where it goes or looks (about a half turn a second, twice that in
  flight), and the view (side or along) follows the heading with hysteresis, so a turn from east
  to west is seen through the along-view; both views stand on the body's middle, so the sprite
  no longer jumps between them; a stutter at a trunk keeps the legs going a moment instead of
  flickering to standing. Every animal's colour goes through `ink` in `lib/fauna.ts`: muted a
  little and snapped to the painting's 96 colours (`paintDeer` for the deer's inks); yellows
  (eyes, bills) stay.
- **0.3.3** (owner: "die Beine sehen aus wie Stöcker, kannst du die Beine auch riggen?"): a
  deer's leg is two parts (`leg` in `lib/deer.ts`): hip to joint and joint to hoof, the joint a
  little more than halfway down, a pixel out (a front leg's knee forward, a hind leg's hock
  backward), two when the hoof is well up, with one extra pixel at the hip where the thigh
  meets the body; the along-view's legs kink the same way. `node tools/deer-sheet.mjs OUT.png`
  draws the poses eight times enlarged from the dev server (`window.hotlDeer`, dev only).
- **0.3.4** (owner: "give them different timing or randomness … otherwise it looks mechanical,
  also the way they move"): each deer has a temperament drawn once (`pace`, `delay`, `wander`,
  `pauses` in `lib/fauna.ts`): its own speed, stride and turning rate; a reaction delay before
  it looks up or breaks into flight, so the herd looks up and bolts one after another; a slow
  wander to either side of its line; and brief stops on the way when not in flight.
- **0.3.5** (owner: "the character legs look like the stomping or pumping"): in the front and
  back views the legs lifted four pixels straight up in turn and the body bounced four pixels a
  step. Now the swinging leg is foreshortened (a fifth shorter), angled a little across and
  lifted briefly and low (under two pixels), the body sways a pixel to the side and rises under
  a pixel (`poseOf` in `lib/puppet.ts`); the side view's stride is as it was. `node
  tools/hero-sheet.mjs OUT.png` draws the walk cycle of all three views enlarged from the dev
  server (`window.hotlView.puppet`; the time must advance per frame, the puppet re-poses only
  on a new frame of POSE_FPS).
- **0.3.6** (owner: "going beneath an asset … it turns dark and when above it white (when it
  snowed). it should stay same"): the front canvas was laid on at the very end, so a plant in
  front of the wanderer missed the wet darkening and took no ground shadow, while the same plant
  behind them took both. Both canvases are now composited at the same stage (`frontHere`,
  `plantHere` in the shader), the ground's shadow and sun patches skip plant pixels, and the
  overlay stays under a front plant.
- **0.3.7** (owner: "looks like the character is cut in 2"): 0.3.5's front and back walk turned
  the swinging leg four degrees about the hip and shortened it a fifth, which jogged the waist a
  pixel sideways against the torso. No rotation now, a tenth shorter, the body's sway 0.6 px.
  The pale line across the waist that is left is the shirt's hem in the drawing itself.

- **A tree rigged in code** (owner, 2026-10-25: "einen blätterlosen Baum und setz Blätter per Code
  drauf, lass die Äste mit den Blättern bewegen im Wind"): `lib/tree.ts` grows a bare skeleton from
  a seed (roots at the foot, the trunk with its flare and grooved bark, forks thinner and shorter
  outwards, each hung on its parent at a point and an angle; owner: "more majestic and bigger,
  roots"), sets leaves on the outer branches by code (clusters in the colours of the glade's own
  broadleaf sprites, graded as the shader grades them, from the crown's dark depths to the lit
  yellows, the sun's side lighter; owner: "the color more diversive like in heart of the light") and poses it in the glade's own wind (`gust` and the sway of `lib/flora.ts`): a branch
  bends about its base, the thinner and the further out the more, and carries its children and
  leaves; in a gust the twigs tremble and single leaves shift a pixel. `/tree` in the dev app
  (`components/TreeScene.tsx`) shows one such tree and nothing else (ArrowUp/Down wind, R another
  tree, L bare; `?wind=&seed=&bare=1`). **The bare tree is a picture** (owner, the same day: "den
  Stamm generier mit OpenAI Bildern"): one leafless old tree with roots and limbs from
  `gpt-image-2.5-sunburst` on magenta (`tools/art/exp/trunk.txt`, the raw picture in
  `tools/art/raw/trunk.png`, not checked in), keyed, boxed down to 293 px, snapped to the glade's
  96 colours and graded in the browser (`public/assets/trunk.png`); `tools/art/trunk.py`
  (scikit-image in the venv) skeletonises it and writes the tips of its twigs and points along
  its thin branches to `trunk.json`. `paintedTree` grows the code's twigs out of every third tip
  in the tip's direction, sets leaves on them and on the picture's twigs, and the picture sways
  in 6-row bands above the trunk as the glade's crowns do (`bandShift`), the code's twigs and the
  leaves riding on their band. `?grown=1` shows the tree grown wholly in code instead. It is a
  study, not yet in the glade: the flora there are still sprites.

- **Every tree is one of the new kind** (owner, 2026-10-25, after the study: "ersetze alle Bäume
  mit der neuen Baumart, erstelle jeden Baum einen individuellen Stamm"; "das Spiel dann gerne
  lokal mal starten"): the 56 trees of `flora.json` (45 conifers and 11 broadleaf sprites until
  then) each get a painted bare trunk of their own from `public/assets/trunks.png` (14 sheets of
  four from `gpt-image-2.5-sunburst`, prompts `tools/art/exp/trunks/`, raw sheets in
  `tools/art/raw/trunks/`, not checked in; `tools/art/trunks.py` keys, boxes each down to
  100–134 px, snaps it to the 96 colours, finds its foot, trunk width, twig tips and twig points
  into `trunks.json`). `Flora` grows the rig's twigs and leaves on each (`paintedTree`, the twigs
  scaled by the tree's height against the study's 293 px, the sheet's ungraded colours since the
  shader grades), renders it once as it stands still (`renderTree`) and sways that in bands as
  before; the wood takes the crown's shadow (`shadedPicture`). The sprites' trees in `flora.png`
  are not drawn any more; the placements, bushes and rocks stay, the trunk's block comes from
  `trunks.json` (`Flora.trunkWidth`). There are no conifers now: the owl sits in the nearest of
  the new trees to its place (`Owl`), the squirrel's climb reads the rendered height (`Placed.h`).

- **Calmer wind, and none of it at a weather change** (owner, 2026-10-25: "die Baumbewegung
  ruhiger, und beim Wetterwechseln rastet der Wind immer kurz aus"): every wave had a pace that
  followed the wind's strength (`t * (a + b * wind)`), so while the weather blended the phase
  slid through many turns and the wood whipped. Now the strength scales only the amplitude; the
  pace is fixed everywhere (`gust` and the sway in `lib/flora.ts` and `lib/tree.ts`, the shader's
  gust, grass, clouds and fog, `windAt` in `lib/view.ts`). The crowns reach less and breathe
  slower. Keep it so: no `wind` inside a sine's time term.
- **Winter** (owner, the same day: "im Winter sollen die Bäume ihre Blätter verlieren, und kahler
  werden"): each tree is rendered in five steps (`SHARES` in `lib/flora.ts`: all its leaves,
  then fewer by the leaves' own phase, then bare), and the step comes from the snow that lies
  (`stageOf(cover)`; the view sets `flora.cover` each frame), so the trees go bare as the snow
  settles and leaf again as it melts. While the cover grows, leaves come down from every crown
  (`drawLeaves` in `lib/view.ts`, from the green crown pixels), not only the autumn ones.

- **Snow only where it would lie** (owner, 2026-10-25: "die Stämme sollen nicht weiß werden, nur
  oben etwas, sonst wird die Szene orientierungslos beim Zugeschneiten, Hauswand auch nicht"):
  in `plantSnow` a brown pixel (red over green, little saturation, so autumn leaves and berries
  still take snow) gets only the cap where it faces the sky, and a cap needs the sky open above
  to either side too, or the seams between the rig's bands and the trunk's still rows wore a
  "white collar" (owner, the same day); the cottage's walls the same: within the cottage's
  ground (`cottage` in the shader) what is not meadow, path, orange tile or grey stone is wall
  (two plain boxes cut through the roof and the grass as rectangles; owner: "weird"). **No words over the glade** (owner, the same day: "Intro-Dialog
  entfernen, Text unten auch"): the start card and the caption are gone; the lines are still
  spoken through the live region for blind players. In the dev app the first key or press
  begins the game (and opens the audio); the stage carries `data-ready` when the art is loaded
  and `data-started` once begun, and the tools wait for the first and press ArrowDown. **The
  grass** leans less and hardly shines in a gust (owner: "die Wellen auf dem Rasen abschwächen").

- **The deer, brown and bigger** (owner, 2026-10-25: "die Deers sind grün, und gerne etwas
  größer machen"): `ink` in `lib/fauna.ts` snapped a warm colour to the nearest of the painting's
  colours by distance alone, which was an olive; a brown (red clearly over green over blue,
  `brown` in `ink`) now snaps only to a brown of the painting (a first rule, red merely over
  green, still let the olives in: owner, "reindeers green again"). The
  rig in `lib/deer.ts` is drawn anew a third bigger (body 17x8, legs 9, head 4x3, the along-view
  7 wide), not scaled, so every pixel stays whole; a leg that carries stands straight and the
  joint shows only as the hoof lifts. `node tools/deer-sheet.mjs OUT.png` shows the poses.
- **The gust's edge test** (owner, the same day: "weirde Baum-Effekte wenn man die vertikale
  Linie übertritt", the vertical line being the gust rolling over the wood): `breeze` in the
  shader let a leaf go wherever a neighbour was transparent, and the rendered crowns are full of
  gaps between leaf clumps, so a whole crown dissolved as a gust passed. The edge is now where
  the open sky lies one, three and five pixels on, and a leaf lets go half as often.

- **Snow and rain, the owner's round of 2026-10-25 at the end of the day:** grey stone (the
  cliffs, the boulders, the chimney; `grey` in the shader's snow block) takes snow in patches
  and on ledges, not over the whole face ("die Felswände sollen nicht so zugeschneit sein");
  the wanderer cools less and wears a cap of two rows at most ("der Charakter auch nicht so
  weiß"); a cap on a plant or an animal needs the top of a mass at least three wide, so legs,
  necks and twigs stay bare ("jetzt sind die Deers weiß"). **Puddles** ("wenn es regnet sollen
  Pfützen, die reflektieren, entstehen"): they gather on the path and, fewer, in the meadow's
  hollows, grow while it stays wet, and mirror what stands above them about a line every
  fourteen rows (the overlay, then the front and behind canvases, else the sky), rippled
  sideways while the rain falls; the rain's rings stay.
- **0.4.1, the water** (owner, 2026-10-25: "the way the deer cross the river is a bit floaty,
  and ideally there would be some splashy vfx; where the waterfall meets the basin … it feels a
  bit static at the surface"): a wading deer stands *in* the stream: `wadeDepth` in
  `lib/fauna.ts` gives the depth from how far the shore is (the hooves wet at the edge, the legs
  gone to the belly in the middle), eased over a few frames; the deer's pixels under that
  waterline are not drawn (a clip rect round the sprite), the body bobs a pixel as it goes, a
  ragged pale waterline wavers across the legs, the deeper the slower (`drag`). Its `wash`:
  droplets kicked off the legs ahead and to the sides (more and higher in a gallop) that fall
  under gravity back to the waterline they left and lie there as foam flecks drifting with the
  stream (`STREAM_DRIFT`) for a moment, and a bow wave of foam set down along the waterline.
  In the shader the last rows of the falls crash into a froth that boils (`foot` in the falls
  branch), the plunge is a heap of foam that heaves with dark water welling up through it
  (`boil`, `heave`), flecks of foam race outward along the rings and thin out as the water
  calms (`race`, `fleck`), and the stream's mouth carries more foam down from the pool
  (`fromPool`).

- **0.4.2, the trees as the study's** (owner, 2026-10-26: "entfern mal diesen wave shader … die
  Bäume sollen so aussehen wie bei dem einzelnen Baum GIF / Test"): the shader's `breeze` is gone
  (the gust that rolled over the plant canvases as a band, letting edge leaves go and shining),
  and so is the gust's wave on the grass and on the painting's own leaves (masks R: those sway
  at each clump's own phase now); only the chimney's smoke still takes the shader's `gust`. A
  tree of the glade is no longer rendered once and shifted in 6-row bands: `Flora` poses it as
  the study poses its tree (`drawTree`'s drawing, the twigs bending about their bases with
  their leaves, the leaves fluttering one by one in a gust, the picture's bands under them),
  with the band shift scaled by the tree's height against the study's 293 px (`bandShift`), so
  a glade tree moves as much for its size as the study's. 56 trees are some 150,000 leaves, and
  as rects on a canvas that took a hundred milliseconds a frame: each tree is drawn into a
  pixel buffer of its own (`TreeSprite`, the same pixels through the `Pen` of `lib/tree.ts`),
  posed anew POSE_FPS (15) times a second, the trees in turn; out of a gust only when the sway
  or the gust on it has moved a sixteenth, and not while it is more than 40 px outside what the
  camera shows (`View.shows`, set by `Game.tsx` after each frame). All 56 posed at once take
  some 14 ms on this machine, so a frame takes at most a quarter of that.
- **0.4.3, the rain's sound** (owner, 2026-10-26: "ein weicheres Rauschen verwenden für den
  Regen"): the rain was white noise between 600 Hz and 6.5 kHz, a hiss; it is pink noise now
  (the `noise` buffer the falls and the wind use), kept between 350 Hz and 3 kHz and rounded
  off above by a second low filter, at a level a little under the hiss's (`lib/sound.ts`).

Still to do: the blind-play criteria of `docs/neues-spiel.md` checked one by one and their tests
(the hint key, the spoken places and the hum are there), then a line in `HOW` and out of
`NOT_YET` in `apps/web/lib/accessible.ts`; the game's own e2e tests. The cover comes from
`tools/promo/cover.mjs` (copied to `apps/web/public/covers/heart-of-the-light.jpg`).

## On itch.io (owner, 2026-10-24: "spiel anlegen … und dort live stellen")

- A copy of the game as an HTML5 project of the account legofighter: https://legofighter.itch.io/heart-of-the-light (project 5221876, channel `html5`, public). The static export with relative paths (`RELATIVE=1 npm run build`) is pushed there with butler. The page (cover from `tools/promo/itch-cover.mjs`, 630x500 with the name lettered over the glade at golden hour; description; tags; embed 960x540, mobile friendly, fullscreen button; AI disclosure Yes for graphics, sounds, text and code) was set in the owner's Chrome through Claude in Chrome.
- The four-quadrant video (owner, 2026-10-25: "cut a video … four quadrants with different views at the same time … 16:9 and mobile format") is `tools/promo/quad.mjs wide|tall`: four clips (the trees in the wind, the deer taking flight, the falls and the brook, a day from a winter morning through rain to night) rendered frame by frame on Playwright's clock, each with a headline drawn by the page in its pixel font, laid in a 2x2 grid by ffmpeg with the name at the end (a card the browser draws, since this machine's ffmpeg has no text filter); 1920x1080 or 1080x1920, 24 s, files not checked in.
- The promo video for a phone (owner, the same day: "ein Handy-Format … mit einer eher dynamischen Kamera") is rendered by `tools/promo/short.mjs`: 1080x1920, 30 fps, 46 s, frame by frame on Playwright's clock with the camera scripted through `?promo=1` and `window.hotlCamera`; the file is not checked in.

