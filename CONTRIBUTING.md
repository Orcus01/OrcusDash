# Contributing to OrcusDash

Open an issue describing a bug or proposed change before a large contribution. For bugs, include the browser/device, steps to reproduce, expected behavior, actual behavior, and relevant logs or screenshots without credentials.

## Local workflow

1. Use Node.js 22 and run `npm ci`.
2. Create a branch for your change.
3. Run `npm run dev` to play locally.
4. Run `npm run verify` before opening a pull request.
5. For gameplay changes, exercise the relevant multiplayer, collision, mobile, or reconnect scripts described in the README.

Keep rendering and collisions consistent with shared arena definitions. Preserve server ownership of combat and scoring. Never commit environment files, access tokens, credentials, or generated dependency/build folders.

Include a concise explanation and relevant validation in your pull request. Real-phone testing is required before claiming phone performance or control comfort.

## Reporting and reviewing changes

Use the [bug-report form](https://github.com/Orcus01/OrcusDash/issues/new?template=bug_report.yml) for reproducible problems and the [feature-request form](https://github.com/Orcus01/OrcusDash/issues/new?template=feature_request.yml) for proposals. The bug form asks for reproduction steps, device/browser details, and the affected build so another contributor can investigate.

Pull requests include a template for the change, related issue, validation, and visual evidence where relevant. Documentation-only changes can be checked through link and formatting review; gameplay or build changes still require the appropriate checks above.
