# OrcusDash design implementation

Updated: 20 October 2026. Reference: [design.md](design.md).

## Implemented software

| Design area | Implementation |
| --- | --- |
| Home and customization | Real Three.js kart showcase on a display podium; paint selection updates the actual model. Showcase rendering stops outside the home screen. Phone Play is above the fold at the tested 390 × 844 viewport. |
| Arena selection | Eight accurate arena previews, explicitly labeled as previews; room hosts choose the actual map in the lobby. |
| Flagship courtyard | Stone walls, crenellated towers, colored trim, diagonal paved routes, central ramps, garden trees, flags, and distinct foreground/background scenery. Visual additions use the shared arena layout and retain the gameplay footprint. |
| Common rendering | Painted materials, anti-aliasing, pooled effects, soft contact shadows, gradual resolution reduction and cautious quality recovery after sustained headroom. |
| Karts | Original expressive driver, paint highlights, steering wheels, body roll, landing compression, weapon mounts, boost feedback, and translucent shield rendering. Contact shadows follow nearby supporting surfaces and fade with separation. |
| Handling and collision | Progressive controls, chassis-sized physics collision, server movement sweeps, boundaries, working ramps and raised routes. Remote extrapolation checks static cover rather than blindly projecting through it. |
| Mobile | Persistent independent steering, simultaneous drive/fire/drift input, compact orientation-specific layouts, visible ammo, touch-friendly targets, and input reset on resize, cancellation, pause, and focus loss. |
| Onboarding | Dismissible first-play prompts for driving, pickups, firing, and drift. Completion/dismissal is saved. |
| Modes | Classic Battle, Kill Race, and One-Hit Chaos; host-controlled lobby settings and public matchmaking by mode. Kill Race displays personal and leading progress. |
| Pause and results | Pause explains online vulnerability, offers settings/resume/quit, and opens automatically on interruption. Settings has an explicit Close action. Results include host Rematch and Quit to Home; rematch resets scores and starts a new countdown. |
| Preferences and audio | Saved camera, shake, brightness, graphics, mute, volume, and engine preferences; distance-aware effects, gentle envelopes, repeated-effect limits, and a 24-voice transient budget. |
| Connection recovery | Bounded connection/join timeouts and a 15-second seat reservation after a socket interruption. An in-memory opaque token restores identity, score, room, mode, and spawn state. Invalid/expired tokens are rejected. Explicit Quit releases the seat immediately. |
| Resource lifecycle | Arena geometry, instance buffers, owned materials/textures, and disposed kart resources are released. Shared resources remain reusable. The home showcase cancels its animation callback when inactive. |

## Verified checks

- `npm run verify`: type checking, **76 unit tests**, and a successful production build.
- `npm run e2e`: two-player creation/joining, incorrect codes, invite links, map synchronization, starting, driving, remote visibility, and immediate deliberate-leave host handoff.
- `npm run e2e:mobile`: gradual joystick response, simultaneous drive/fire, touch cancellation, orientation changes, pause/resume, anti-aliasing, and clean browser logs.
- `npm run e2e:design`: real model repainting, phone Play visibility, automatic same-identity reconnect, saved camera/shake preferences, and interruption pause.
- `npm run test:collisions`: **44 obstacle impacts across eight arenas**, plus successful ramp traversal in every arena.
- `npm run e2e:network`: identity/room/mode/score preservation, duplicate-seat prevention, resumed spawn, invalid-token rejection, explicit Quit/host handoff, and expiry cleanup.
- `npm run e2e:resources`: two passes through all eight arenas and four kart creation/disposal cycles. The measured renderer counts remained **244 geometries and 29 textures** before and after the repeated operations.
- `node scripts/bench.mjs courtyard`: approximately **60 FPS median and 60 FPS at the reported 95th-percentile frame-time conversion** in Ultra, High, and Low. This was a local headless Chrome test at 1280 × 720 using the Metal launch flags; it is not a physical-phone result.
- Production-build browser check on a separate local server with five-second matches: desktop/mobile entry, pause → settings → close → resume, results, host rematch with score reset, and quit-to-home all passed without browser errors.

## Review images

- [Desktop home](docs/images/home.png)
- [Desktop courtyard](docs/images/gameplay.png)
- [Phone courtyard](docs/images/mobile.png)

## Release gates still requiring physical devices

Software implementation is not evidence that every release gate in the design has passed.

1. Test a full match on a named mid-range Android phone and an iPhone, in their actual browsers.
2. Measure input latency, finger comfort, visibility outdoors, camera obstruction, and combat readability on those devices.
3. Run the specified ten-minute thermal sessions and record frame-time degradation, memory behavior, and crashes.
4. Check the sound mix at real phone-speaker/headphone levels and obtain player feedback on the flagship arena before final art sign-off.
5. Review moving footage of the remaining arena themes at the same quality standard; common rendering improvements do not replace that review.

## Practical limits

- Reconnect recovery lasts 15 seconds and applies to an interrupted live page. A full reload or server restart does not restore an account or a permanent session.
- Match outcomes are server-owned, with movement validation; player kart physics remains locally simulated.
- The physics bundle still produces Vite's large-chunk warning. Compression is supported by the production server; download time still needs checking on real mobile connections.
- Local browser measurements and touch emulation do not establish real-phone thermal performance or player enjoyment.

The development client and game servers are stopped after validation, per the user's standing request.


## Driving rewards and nitro

Hold E (or L) on keyboard, or the mobile NITRO button while accelerating, for a two-second burst. The visible tank refills in eight seconds of active play. Empty tanks require releasing the button before another burst. KOs restore 40% fuel; landing after more than 0.65 seconds airborne at driving speed restores 25%, with a BIG AIR callout. Pause disables nitro and freezes tank recharge. Respawn restores a full tank. Nitro uses the existing 15 m/s turbo ceiling; sustained turbo now respects that ceiling rather than accumulating speed each step. Ordinary cruising remains 11.5 m/s.

`npm run e2e:fun` checks burst speed, sustained boost limits, landing and KO rewards, pause behavior, simultaneous mobile drive/fire/nitro, cancellation and landscape button placement. Tank state transitions also have unit coverage in client/test/nitro.test.ts. Physical-phone comfort still requires hands-on testing.
