# Hosting OrcusDash

## Existing hosted game

- Game: https://orcusdash.orcus-pro01.chatgpt.site
- Multiplayer server: https://orcusdash-multiplayer-production.up.railway.app
- WebSocket endpoint: wss://orcusdash-multiplayer-production.up.railway.app/ws

The game is hosted with Sites and the multiplayer backend with Railway. The Sites audience is public, so anyone with the game URL can visit. The multiplayer endpoint is public so the hosted browser client can connect.

## Deploy your own copy

The simplest approach is the root Dockerfile or the single Node server described in README.md. Both serve the client and WebSockets together. Use Node.js 22 and a platform supporting long-lived WebSocket connections.

For a static frontend, build with `VITE_SERVER_URL=wss://your-server.example/ws npm run build` and publish `client/dist`. Point it at your own running server.

## Existing deployment artifacts

`server/src/railway-entry.ts` is the standalone server entry point used by the existing Railway deployment. `deployment/railway-server.mjs` is its bundled artifact. The primary maintainable server source is under `server/src`.

The owner-managed Sites source checkout is intentionally excluded from this public repository because it has independent Git history and hosting configuration. GitHub pushes do not automatically update the existing Sites or Railway deployments.

Keep the multiplayer backend at one replica: rooms, match state, and reconnect seats live in process memory. Server restarts reset active matches. Check `/health` and validate a two-player match after deployment.
