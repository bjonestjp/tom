# Tom Leaderboard

A small mobile-first leaderboard site for one overall table plus event scoreboards.

## Stack

- Static HTML/CSS/JS frontend
- Netlify Functions for the API
- Netlify Blobs for persistent JSON storage
- Shared admin password via the `ADMIN_PASSWORD` environment variable

This keeps hosting free-friendly and avoids a separate database account for a small competition.

## Local development

```sh
npm run dev
```

Open `http://localhost:8888`.

The local dev password is `Dragon`. Local scores are stored in `.data/leaderboard-state.json`.

## Deploy to Netlify

1. Push this folder to a Git repo.
2. Create a new Netlify site from that repo.
3. Use these settings:
   - Build command: leave blank
   - Publish directory: `public`
   - Functions directory: `netlify/functions`
4. Add an environment variable in Netlify:
   - `ADMIN_PASSWORD`: `Dragon`
5. Deploy.

Netlify will install `@netlify/blobs` during deploy. Viewer traffic reads from `/api/state`; admin saves post to the same endpoint with the shared password.

## Current competitors

- Brad Jones
- Jack Birch
- Tom Garrod
- Chris Bond
- Sam Gallop
- Tommy Hearn
- James Hogan
- Sam Holdsworth
- Jack Tunnacliffe-Jones
- Scott McEvoy

The app starts with ten placeholder events named `Event 1` through `Event 10`. Admins can rename, delete, mark complete, and add events from the Admin tab.

Admins can also use the Players section inside Admin to add up to 20 title lines per competitor. Those lines appear under each name on the overall leaderboard.

Admins can upload up to 12 compressed gallery images per competitor from the Players section. Image files are stored separately from the leaderboard state, and each player detail card shows the uploaded thumbnails.

When an event is marked complete, overall leaderboard names show medal emojis for players ranked first, second, or third in that completed event, including ties.

The public navigation includes an About page. Admins can edit that page from the About section inside Admin.
# tom
