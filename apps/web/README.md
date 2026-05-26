# ForkFit Web

Next.js frontend for ForkFit's community recipe discovery and personalized fork flow.

## Run locally

Start the FastAPI backend and worker first, then run:

```bash
npm run dev
```

The app opens at `http://localhost:3000`.

By default, frontend requests to `/api/backend/*` are proxied to
`http://127.0.0.1:8000/*`. Override with:

```bash
FORKFIT_API_BASE_URL=http://127.0.0.1:8010 npm run dev
```

## Pages

- `/` shows the seeded recipe post discovery feed.
- `/packs/[packId]` shows a community recipe post.
- `/packs/[packId]/fork` submits a user profile to `POST /runs`.
- `/runs/[runId]` polls `GET /runs/{run_id}` and displays the adapted dish.
