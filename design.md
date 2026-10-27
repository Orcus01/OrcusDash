# Smash Karts–Inspired Game Design

**Project:** OrcusDash  
**Updated:** 20 October 2026  
**Status:** Reference specification. Software changes and verified checks are tracked in [implementation.md](implementation.md). Performance targets and physical-device release gates below are requirements, not claims about shipped quality or the rules of Smash Karts.

## 1. Product vision

A bright, responsive browser kart brawler that is immediately understandable and satisfying on a phone. Players drive, collect a mystery weapon, land a readable hit, and get back into the fight quickly after elimination.

Use Smash Karts as a reference for accessible arena combat, playful proportions, and clear action. Create original characters, arena layouts, branding, UI, and assets.

### Design priorities

1. **Control before spectacle:** driving, aiming, and touch input must feel reliable.
2. **Readable action:** players can distinguish routes, solid obstacles, weapons, and opponents at speed.
3. **Crafted cartoon visuals:** cohesive models, lighting, terrain, and animation instead of a collection of colored boxes.
4. **Fast return to fun:** short loading, clear matchmaking, quick respawns, and easy rematches.
5. **Measured phone performance:** judge the experience on physical devices, not desktop screenshots alone.

### Problems this design must resolve

| Player feedback | Required design response |
| --- | --- |
| Karts pass through or overlap blocks | Visible obstacle silhouettes match collision geometry; both local movement and server validation respect solid cover. |
| Driving feels too fast and turning feels wide | Lower cruising speed, progressive steering, predictable braking, and tighter low-speed turns. |
| Phone play is not enjoyable | Comfortable persistent controls, simultaneous drive/fire, landscape and portrait layouts, and useful camera framing. |
| Graphics look dated | Purpose-built arena landmarks, expressive drivers, soft grounding, consistent materials, and restrained effects. |
| Sound is annoying | Quiet defaults, no mandatory engine drone, distance attenuation, and limits on overlapping effects. |
| Missing pause, quit, and home experience | Clear navigation with visible resume and quit actions and honest online pause behavior. |

## 2. Core gameplay loop

**Home → choose mode → Quick Play or private room → countdown → drive and collect → fight → respawn → results → rematch or home.**

- Support up to eight players; fill a solo or sparse match with bots when enabled.
- Start a new player near an obvious route and a reachable pickup.
- Teach driving, firing, and drifting through short contextual prompts rather than a blocking tutorial.
- Make the first encounter happen within roughly 5–10 seconds of driving. Tune routes and pickup placement before simply increasing speed.
- Keep cosmetics separate from handling, health, damage, and matchmaking advantage.

## 3. Match modes

| Mode | Win condition | Rules and presentation |
| --- | --- | --- |
| Classic Battle | Most KOs after three minutes | Normal health and damage; show time and personal score. Equal scores produce a tie. |
| Kill Race | First to ten KOs | Three-minute fallback limit; highest score wins at timeout, with ties allowed. Show personal progress and the leader's progress. |
| One-Hit Chaos | Most KOs after three minutes | Any damaging weapon hit eliminates; active shields still block damage. Clearly distinguish this mode before joining. |

- Match public players by mode. Joining a friend's room inherits that room's rules.
- Only the host changes a private room's mode or arena, and only before a match starts.
- Use a three-second countdown, a two-second respawn, and temporary spawn protection as starting values.
- Show spawn protection as a soft shield with a visible expiry cue. It must not obscure the kart.
- Results show winner or tie, KOs, deaths, personal placement, and clear rematch/home actions.

## 4. Driving and combat feel

### Handling targets

These are starting values for playtesting, not fixed balance commitments.

| Property | Starting target |
| --- | --- |
| Normal top speed | About 11.5 m/s, or 41 km/h |
| Boost top speed | About 15 m/s, or 54 km/h |
| Time to normal top speed | About one second on level ground |
| Full-steer turn radius at cruising speed | Roughly 3–4 m; validate with actual trajectories |
| Drift charge | About 0.9 seconds of a sustained turn |
| Mini-turbo duration | About 0.8 seconds |

- Steering should build progressively rather than snapping to full lock.
- Maintain lateral grip during ordinary driving. Sliding should be deliberate and visually communicated.
- Reverse should be slower and easy to recover from. Low-speed steering must not feel stuck.
- Distinguish braking, coasting, drifting, and boosting with motion and feedback.
- Keep camera speed effects mild so boosts do not create motion sickness or hide opponents.
- Grounded, airborne, landing, and wall contact states need distinct animation responses.

### Weapons

Retain six clearly differentiated pickup types: machine gun, rocket, triple missiles, grenade launcher, mines, and shield.

- Each weapon has a unique mount silhouette, projectile or effect, icon, and short sound.
- Aim assistance selects a plausible nearby target in front of the kart and respects cover.
- A lock indicator communicates assistance without promising a guaranteed hit.
- Show ammo and depletion immediately. Show hit confirmation separately from elimination confirmation.
- Limit muzzle flashes, smoke, and shake so the target remains visible.
- Use consistent color roles: warm colors for danger, cool colors for protection, gold for pickups and rewards.

## 5. Collision and networking

- Treat every prominent block, wall, building, ramp, and solid prop as part of the gameplay collision contract.
- Use a kart-sized chassis collider; a small ground-contact sphere alone is insufficient for the visible body.
- Generate rendering and collision geometry from the same arena definitions.
- Allow ramps, platforms, bridges, and legitimate jumps. Validate height as well as horizontal position.
- Sweep movement between accepted positions so thin obstacles cannot be skipped between updates.
- The server rejects impossible movement and travel through cover, and owns damage, pickups, score, respawn, and results.
- Keep local steering immediate; interpolate remote karts without smoothing them through solid cover.
- Do not add visible decorative obstacles inside drivable routes unless their collision behavior is clear.
- Test head-on impacts, angled impacts, reversing, drifting against walls, boost impacts, corners, and elevated routes.

## 6. Arena direction

### Flagship arena: Classic Courtyard

Polish one arena to the target quality before applying the style across all eight arenas.

- Use a grassy courtyard, a recognizable central jump, four side routes, and distinct corner landmarks.
- Give cover believable construction: beveled stone, painted panels, trim, seams, and clear bases.
- Organize the layout into a central combat space, connected side lanes, and recovery routes.
- Keep the overall arena near the existing 100–110 m footprint initially. Adjust encounter density through usable routes and cover placement.
- Avoid a giant circular road dominating the whole map. Any outer loop must provide tactical movement rather than long empty laps.
- Preserve at least two exits from important combat spaces. Avoid dead ends that trap newly spawned players.
- Place pickups to encourage movement through different routes, not a single mandatory central cluster.
- Place spawns outside immediate enemy fire and away from blocking geometry.

### Visual landmarks

- Center: a distinctive raised feature visible from several approaches.
- Corners: original banners, towers, garden features, or archways with different silhouettes.
- Boundary: a continuous, clearly solid wall or railing with readable entrances only where gameplay permits them.
- Background: lightweight scenery beyond the playable area; it must not resemble accessible cover.
- Trees, flowers, flags, and distant buildings support the composition without cluttering sightlines.

### Other arenas

Boost Park, Downtown, Desert Canyon, Harbor Docks, Jungle Temple, Lava Pit, and Space Station should each have their own palette, navigation landmark, and meaningful route variation. Do not rely on recoloring the same layout to establish identity.

## 7. Art direction

### Visual language

**Playful, chunky, polished, and readable.** Use stylized geometry with deliberate detail placement rather than photoreal textures or uniformly flat primitives.

| Element | Direction |
| --- | --- |
| Karts | Broad painted body, oversized tires, visible suspension response, distinct front and rear, readable weapon mounts. |
| Drivers | Expressive faces and original helmet/character silhouettes that remain recognizable at gameplay distance. |
| Materials | Soft paint highlights, matte rubber, restrained metal accents, subtle terrain variation, consistent texel density. |
| Lighting | Bright daylight, soft grounding, controlled highlights, clear separation between kart and ground. |
| Terrain | Large coherent color areas with subtle texture; no noisy photographic detail or stretched patterns. |
| Effects | Brief impact bursts, compact dust, short boost trails, soft shields, and readable projectiles. |
| UI | Rounded surfaces, crisp icons, strong hierarchy, readable type, restrained gradients, consistent spacing. |

### Palette roles

| Role | Starting colors |
| --- | --- |
| Navigation surfaces | Grass `#58BC6B`, road `#385675`, stone `#B7C6CE` |
| Player accents | Coral `#F56577`, blue `#54A9F7`, violet `#9A7BE8`, gold `#FFD34D` |
| UI surfaces and text | Navy `#142D4D`, pale text `#F1F7FF`, muted text `#BBD4E8` |
| Actions and status | Play `#A9ED49`, shield `#65DCFF`, damage `#ED5267` |

Use hue, shape, motion, and iconography together. Color alone must not communicate teams, danger, or weapon state.

### Polish requirements

- Karts and major cover need contact shadows at every quality level; inexpensive baked or procedural shadows are acceptable on phones.
- Shadows must follow the supporting surface and fade appropriately during jumps. Avoid floating dark planes.
- Anti-aliasing and suitable render resolution should keep silhouettes and UI crisp.
- Shields should read as translucent energy, not a wire cage.
- Small model details must support the overall silhouette. Avoid detail that adds draw calls without helping recognition.
- A screenshot alone is not approval: check moving footage for shimmer, popping, clipping, unreadable combat, and visual noise.

## 8. Camera

- Default to an elevated arcade chase view that shows the kart, nearby cover, and the next decision point.
- Start around 5.7 m behind and 4.1 m above the kart for landscape; tune framing through playtests.
- Portrait requires its own framing, not simply a cropped landscape camera.
- Use smooth, predictable following. Avoid excessive lag during turns and abrupt zoom changes.
- Keep a close-chase alternative in Settings.
- Resolve camera obstruction against actual world geometry. Near walls, keep both the kart and the intended route understandable.
- Make shake brief, distance-aware, and optional. Keep field-of-view changes modest.

## 9. Mobile interaction

### Controls

- Persistent left joystick with a comfortable resting position and a visible thumb target.
- Small dead zone and progressive horizontal steering. Avoid deriving full steering lock from a small change in stick angle.
- Forward or sideways displacement drives; deliberate downward displacement reverses. Explain this behavior with a short first-use hint.
- Large right Fire button and a separate Drift button, spaced so fingers do not collide.
- Drive, steer, fire, and drift must work simultaneously through independent pointer tracking.
- Release, cancellation, focus loss, pause, and orientation changes must clear active input safely.
- Do not require a drag gesture before the player can discover the controls.

### HUD layouts

| Orientation | Layout |
| --- | --- |
| Landscape | Primary play layout; compact health/weapon at upper left, timer centered, small radar at upper right, joystick/fire at lower corners. Hide the persistent full leaderboard. |
| Portrait | Alternate camera framing, compact top HUD, at most three leaderboard rows, and thumb controls below the main action. |

- Minimum interactive target: 48 CSS px for ordinary mobile actions; joystick and Fire should be substantially larger.
- Respect safe areas, browser chrome, and finger occlusion.
- Landscape may be recommended but must not be forced with a large message covering gameplay.
- Never show keyboard-only instructions on a touch device.
- Provide accessible labels for icon buttons and clear pressed/disabled states.

## 10. Home, lobby, pause, and results

### Home

- Lead with the game identity and one prominent Play action.
- Keep player name, kart color, and mode selection close to Play.
- Provide clear secondary actions for creating a private room and joining by code.
- Include an arena gallery with accurate, current previews. Clearly distinguish previewing an arena from choosing it for a room.
- Use an original kart/driver showcase or an attractive live arena composition; avoid making large blocks of marketing text the main visual.
- Ensure Play is easy to reach on a phone without unnecessary scrolling.

### Lobby

- Show room code/share link, players, host, loading readiness, arena, mode, and bot setting.
- Only hosts can edit match settings. Explain disabled actions through labels or state.
- Make Start and Leave unambiguous. Keep loading feedback visible without hiding the room controls.

### Pause and quit

- Escape and a visible button open the pause menu.
- Explain that an online match continues while local controls are paused; the kart remains vulnerable.
- Offer Resume, sound/graphics settings, and Quit to Home.
- Quitting disconnects, clears room state and held input, and returns to a usable home screen.

## 11. Audio

- Start effects at a quiet level, around 25%; keep the continuous engine off by default.
- Save volume, mute, and engine preferences.
- Use short, rounded tones or purpose-made audio with gentle attack/release envelopes.
- Attenuate distant weapons and explosions. Do not play every remote action at full volume.
- Limit simultaneous voices and repeated effects so a busy match does not become an uninterrupted wall of noise.
- Prioritize useful cues: pickup, local hit, confirmed KO, protection expiry, countdown, and match ending.
- The game must remain understandable with sound muted.

## 12. Performance and implementation

Retain the existing TypeScript, Three.js, Rapier, Node.js, and WebSocket foundation while improving assets and interaction.

| Area | Proposed acceptance target |
| --- | --- |
| Standard phone preset | Stable 60 FPS where supported; 95th-percentile frame time at or below 25 ms on named test devices. |
| Constrained-device fallback | Stable 30 FPS with consistent input and simulation timing. |
| Local input | Visible response within two displayed frames; measure separately from network latency. |
| Warm-up | Compile expected shaders before a round; avoid first-use weapon stalls. |
| Matchmaking | Clear connecting, joining, loading, failure, and retry states. |
| Thermal behavior | Check a continuous ten-minute match session for frame degradation and crashes. |

- Batch static arena geometry and reuse textures/materials. Instance repeated props and pooled effects.
- Keep dynamic shadows, particles, lights, pixel ratio, and post-processing within measured budgets.
- Preserve contact cues and readable silhouettes when reducing quality.
- Adapt resolution gradually; recover quality cautiously when there is sustained headroom.
- Separate simulation time from rendering quality. A dropped frame must not arbitrarily slow kart movement.
- Record the device, browser, resolution, quality preset, player count, and worst-case combat conditions for every performance claim.
- Touch emulation checks layout and event behavior; it does not establish real-phone performance or comfort.

## 13. Validation and release gates

### Required checks

- Run unit tests, type checking, and the production build.
- Run multiplayer join, map/mode synchronization, combat, respawn, host handoff, pause/resume, and quit flows.
- Drive into representative cover and boundaries across all arenas; include angled and boosted impacts.
- Traverse ramps and elevated routes after every collision change.
- Test simultaneous touch input, cancellation, orientation changes, browser interruption, and reconnect behavior.
- Test muted play, saved audio preferences, and a busy match's sound mix.
- Review portrait and landscape footage on at least one mid-range Android phone and one iPhone, recording their actual models and browsers.

### Quality gate

A build is ready for another player test only when:

1. Solid cover reliably stops visible karts without breaking ramps.
2. Touch controls support a full match without stuck input or accidental full-lock turns.
3. Players can identify the next route, held weapon, threat, and objective at a glance.
4. Target devices meet their frame-time targets during combat, not just in an empty arena.
5. The audio remains comfortable over a full session and can be disabled immediately.
6. Home, joining, pause, quitting, and results have no dead ends.

## 14. Delivery sequence

| Stage | Deliverable | Exit condition |
| --- | --- | --- |
| 1. Feel and reliability | Driving, collision, touch, camera, audio | Physical-device players can complete a match comfortably. |
| 2. Flagship visual slice | Finished Classic Courtyard, kart, driver, pickups, lighting, HUD | Cohesive moving gameplay meets the art direction and device budgets. |
| 3. Combat polish | Weapon readability, impact effects, feedback, mode presentation | Players understand hits, KOs, protection, and win conditions. |
| 4. Extend the style | Remaining arenas, home showcase, consistent previews | Each arena has a distinct identity and passes the same quality checks. |
| 5. Release pass | Network edge cases, accessibility, thermal testing, regression suite | All release gates pass with recorded evidence. |

Do not label a build “next level” based only on screenshots, extra modes, or a desktop frame-rate number. The deciding measure is whether the intended players enjoy a full session on their actual devices.
