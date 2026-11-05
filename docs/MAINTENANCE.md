# Maintaining OrcusDash

OrcusDash is a playable prototype. Passing automated checks does not establish real-device performance, production reliability, or an active player community.

## Triage and review

- Reproduce a bug on the reported build before marking it confirmed. Record browser, device, arena, mode, and whether the problem occurs locally or on the hosted game.
- Remove credentials and player information from public reports. Request only the minimum diagnostic information needed.
- Link a fix to its report. Describe the behavior before and after, and record the commands actually run.
- Review server ownership of scoring, damage, pickups, and reconnect seats when changing multiplayer behavior. Check client and shared collision definitions together.
- Keep phone emulation results separate from physical-phone results. Do not close a device-specific report based only on desktop emulation.

## Before a release

Copy this checklist into the release PR and attach evidence. An unchecked item remains a known limitation; it must not be silently reported as passing.

- [ ] Record the exact commit and Node.js version.
- [ ] Run `npm ci` and `npm run verify` from a clean checkout.
- [ ] Start the local game with `npm run dev`; check two-player create/join, movement, combat, scoring, and leaving a room.
- [ ] Run the relevant scripts listed in the README for changed behavior. Record failures and platform limitations.
- [ ] Check a private room and reconnect after an interruption; confirm expired sessions do not reclaim occupied seats.
- [ ] Complete the [playtest record](PLAYTEST.md) on real Android and iPhone devices before making mobile performance claims.
- [ ] Test the built client against the intended server version. Record the hosted build separately from the repository commit if deployment provenance is unknown.
- [ ] Review third-party asset attribution and the current code licensing status.
- [ ] Write release notes covering user-visible changes, breaking changes, validation, and known limitations.
- [ ] After deployment, verify the public menu and a complete match. Do not mark a deploy verified from a successful build alone.

## Evidence to retain

Keep reproducible issue reports, reviewed PRs, CI runs, and release notes linked together. Record actual testing dates and results. Repository traffic, bots, and the maintainer's own sessions are not evidence of independent players or adoption.

The original source code is covered by the MIT License. Check the README's assets and permissions section for the separate artwork and third-party asset terms.
