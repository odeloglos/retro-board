# Retro Board Enhancements — Design Spec

## Overview

Five enhancements to the existing retro board MVP: expanded reactions, GIF search, countdown timer, custom team avatar reactions/embeds, and Phreesia-branded UI. All changes build on the existing Node.js/Express/Socket.IO/SQLite architecture.

## Feature 1: Expanded Reactions

### Current State

The `votes` table stores one thumbs-up per person per card. The vote route (`POST /api/cards/:id/vote`) inserts a row and returns a count. The frontend shows a single `👍 N` button.

### New Behavior

Replace the simple upvote with a multi-type reaction system. Users can react with one of 9 options per card: 3 standard emoji (thumbs_up, thumbs_down, heart) and 6 custom team avatars (chris_happy, chris_grumpy, phani_happy, phani_grumpy, scott_happy, scott_grumpy).

Rules:
- One reaction per person per card
- Reacting with the same type you already have removes it (toggle off)
- Reacting with a different type replaces your existing reaction (swap)

### Database Change

Drop the `votes` table. Create a `reactions` table:

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| card_id | TEXT FK | References cards.id, ON DELETE CASCADE |
| session_id | TEXT | Who reacted |
| type | TEXT | One of: thumbs_up, thumbs_down, heart, chris_happy, chris_grumpy, phani_happy, phani_grumpy, scott_happy, scott_grumpy |
| UNIQUE | | (card_id, session_id) — one reaction per person per card |

Valid reaction types (enforced at the route level, not via CHECK constraint, for easier future extension):
`thumbs_up`, `thumbs_down`, `heart`, `chris_happy`, `chris_grumpy`, `phani_happy`, `phani_grumpy`, `scott_happy`, `scott_grumpy`

### API Change

Replace `POST /api/cards/:id/vote` with `POST /api/cards/:id/react`:

**Request body:** `{ type: "thumbs_up" }`

**Behavior:**
- If no existing reaction from this session: insert new reaction
- If existing reaction with the same type: delete it (toggle off)
- If existing reaction with a different type: update to the new type

**Response:** `{ card_id, reactions: { thumbs_up: 3, thumbs_down: 1, heart: 2, chris_happy: 1 } }` — a map of all reaction types with non-zero counts for this card.

### Socket.IO Change

Replace `card:vote` / `card:voted` with `card:react` / `card:reacted`. Payload includes the full reaction summary for the card (same format as the API response).

### Frontend

The single thumbs-up button becomes a reaction picker. Clicking the reaction area on a card opens a small popup showing all 9 reaction options in a row:
- 3 emoji rendered as text: 👍 👎 ❤️
- 6 avatars rendered as ~24px images

Below each card, the reaction summary shows only types with at least one reaction, each with its count. Standard emoji show as emoji text; avatar reactions show as ~24px images. If the current user has reacted, their reaction is highlighted.

### Export Impact

The Markdown export changes from `👍 N` to listing all reaction types:
- Standard emoji: `👍 3 👎 1 ❤️ 2`
- Avatar reactions: `[Chris 😊] 1 [Phani 😠] 2`
- Cards sorted by total reaction count (sum of all types)
- Cards with zero total reactions omit the reaction indicator

### GET /api/boards/:id Change

The board detail endpoint currently returns cards with a `votes` count. This changes to return a `reactions` object per card: `{ thumbs_up: 3, heart: 1, ... }`.

## Feature 2: GIF Search & Card Embedding

### How It Works

Each card input area gets a "GIF" button. Clicking it opens a search modal:
- Text input at the top for search terms
- Grid of GIF thumbnails below (Tenor API, `tinygif` format for previews)
- Clicking a GIF selects it, closes the modal, and attaches the GIF URL to the pending card
- A small GIF preview appears next to the input to confirm selection, with an "X" to remove it
- When the card is submitted, the `gif_url` is sent alongside `text`

A card can have text only, GIF only, or both. Text appears above the GIF. At least one of text or GIF (or avatar embed) is required to submit a card.

### Database Change

Add column to `cards` table:

| Column | Type | Notes |
|--------|------|-------|
| gif_url | TEXT | Optional. Tenor GIF URL |

### Tenor API

- Provider: Tenor (Google), free tier
- Client-side fetch directly from the browser (no server proxy)
- API key embedded in frontend JavaScript (non-sensitive for an internal tool)
- Search endpoint: `https://tenor.googleapis.com/v2/search?q={query}&key={key}&limit=20&media_filter=gif,tinygif`
- Use `tinygif` format for search result thumbnails, `gif` format URL stored on the card for display

### Card Display

If a card has a `gif_url`, render an `<img>` tag below the card text, constrained to the column width (max ~250px wide, auto height).

### Real-time

No new Socket.IO events needed. The existing `card:added` and `card:edited` events broadcast the full card object, which now includes `gif_url`.

### Export Impact

Cards with GIFs include the URL as `![GIF](url)` in the Markdown export, below the card text line.

## Feature 3: Countdown Timer

### How It Works

Admin sees a "Timer" button in the board header. Clicking it opens a dropdown with three preset buttons: **5 min**, **10 min**, **15 min**. Selecting one starts the countdown immediately.

- The timer displays as a live `MM:SS` countdown in the board header, visible to all connected users
- Admin sees an "X" button next to the timer to cancel it early
- When the timer reaches zero, it displays **"Time's up!"** for 10 seconds, then disappears
- No board locking or other side effects when the timer ends

### Socket.IO Events

| Event | Payload | Trigger |
|-------|---------|---------|
| timer:started | `{ endTime }` (Unix timestamp in ms) | Admin starts a timer |
| timer:cancelled | — | Admin cancels the timer |

Each client computes its own countdown from the shared `endTime` timestamp. A user joining mid-timer receives the `endTime` as part of the board's current state (emitted on `join-board` if a timer is active).

### Server State

The Socket.IO handler stores the active timer per board in memory:
```
boardTimers[boardId] = { endTime: 1718200000000 }
```

When a new user joins a board with an active timer (endTime > now), the server emits `timer:started` to that socket. When the timer expires or is cancelled, the entry is deleted.

No database storage. Timers are ephemeral — they don't survive server restarts, which is fine for a live retro session.

### Frontend

- Timer display sits in the board header between the title and the actions area
- When no timer is active: admin sees a "⏱ Timer" button; participants see nothing
- When a timer is running: all users see the `MM:SS` countdown; admin also sees "✕" to cancel
- At zero: "Time's up!" in orange (`#e25f37`) text, auto-clears after 10 seconds
- The countdown updates every second via `setInterval`

## Feature 4: Custom Avatar Reactions & Embeds

### Avatar Assets

Six PNG images stored in `public/images/avatars/`:
- `chris-happy.png`, `chris-grumpy.png` — man with trucker hat, glasses, gray beard
- `phani-happy.png`, `phani-grumpy.png` — man with gray hair, red collar
- `scott-happy.png`, `scott-grumpy.png` — bald man with glasses, dark shirt

These are cropped from the user-provided paired images (each pair shows happy on the left, grumpy on the right). Each individual avatar image should be square, ~200x200px, transparent or dark background trimmed.

### As Reactions (Small, ~24px)

Covered in Feature 1. The 6 avatar types are part of the 9-option reaction picker. They render at ~24px in the reaction summary below cards.

### As Card Embeds (Large, ~120px)

- An "Avatar" button appears next to the "GIF" button in the card input area
- Clicking it opens a small picker grid showing all 6 avatars at ~80px
- Selecting one attaches the avatar identifier to the card
- A card can have text + GIF + avatar, or any combination (at least one required)
- Avatar embeds render at ~120px in the card body, below text but above GIF if both are present

### Database Change

Add column to `cards` table:

| Column | Type | Notes |
|--------|------|-------|
| avatar | TEXT | Optional. One of: chris_happy, chris_grumpy, phani_happy, phani_grumpy, scott_happy, scott_grumpy |

### Avatar Registry

A constant map in the frontend (and mirrored in the export route) defining display metadata:

```
AVATARS = {
  chris_happy:  { label: "Chris 😊", file: "chris-happy.png" },
  chris_grumpy: { label: "Chris 😠", file: "chris-grumpy.png" },
  phani_happy:  { label: "Phani 😊", file: "phani-happy.png" },
  phani_grumpy: { label: "Phani 😠", file: "phani-grumpy.png" },
  scott_happy:  { label: "Scott 😊", file: "scott-happy.png" },
  scott_grumpy: { label: "Scott 😠", file: "scott-grumpy.png" },
}
```

### Real-time

No new events. Existing `card:added` / `card:edited` events broadcast the full card object, which now includes `avatar`.

### Export Impact

Avatar embeds in cards export as their text label (e.g., `[Chris 😊]`) in the Markdown. Avatar reactions in the reaction summary export as `[Chris 😊] 2`.

## Feature 5: Phreesia Branded UI

### Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Orange | #e25f37 | Primary accent, buttons, CTA |
| Purple | #78287B | Banner gradient start, secondary accent |
| Teal | #96d6e0 | Hover states, highlights, card accents |
| Near-black | #050709 | Body text, dark backgrounds |

### Top Banner

Every page gets a top banner:
- Background: left-to-right gradient from purple (`#78287B`) to orange (`#e25f37`)
- Text: "Retro Board" in white, bold, Nunito font
- Height: ~56px
- On the board page, the existing board header content (title, actions) moves inside the banner

### Font

Google Fonts — **Nunito** for the entire app. Loaded via `<link>` tag in each HTML file. Applied to `body` as the primary font, with system fonts as fallback.

### Style Changes

- **Buttons:** Primary buttons change from `#4a90d9` (blue) to `#e25f37` (orange). Hover state darkens to `#c94e2d`.
- **Column headers:** Keep existing functional colors (green, amber, red, blue) — they serve a purpose and look good against the new palette.
- **Card hover/focus:** Subtle teal (`#96d6e0`) border or shadow on hover.
- **Body text:** `#050709` replaces `#333`.
- **Links:** Orange (`#e25f37`) instead of default blue.
- **Error messages:** Keep existing red styling — functional, not branded.
- **Board header:** Integrates into the gradient banner on the board page. Lock toggle, timer, and export button sit inside the banner with white/light text.

### Pages Affected

All four: `index.html` (join), `login.html`, `dashboard.html`, `board.html`. Each gets the gradient banner and updated color variables.

## Summary of Database Changes

### New table: `reactions` (replaces `votes`)

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| card_id | TEXT FK | References cards.id, ON DELETE CASCADE |
| session_id | TEXT | Who reacted |
| type | TEXT | Reaction type identifier |
| UNIQUE | | (card_id, session_id) |

### Modified table: `cards`

Two new nullable columns:
| Column | Type | Notes |
|--------|------|-------|
| gif_url | TEXT | Optional. Tenor GIF URL |
| avatar | TEXT | Optional. Avatar identifier |

### Dropped table: `votes`

Replaced entirely by `reactions`.

## Summary of API Changes

| Before | After | Notes |
|--------|-------|-------|
| POST /api/cards/:id/vote | POST /api/cards/:id/react | Body: `{ type }`. Returns reaction summary map |
| GET /api/boards/:id response `votes: N` | `reactions: { type: count }` | Per-card reaction summary |

Card creation/edit endpoints accept two new optional fields: `gif_url` and `avatar`. The card creation route validates that at least one of `text`, `gif_url`, or `avatar` is present (the existing `text` required check is relaxed to allow GIF-only or avatar-only cards).

## Summary of Socket.IO Changes

| Before | After | Notes |
|--------|-------|-------|
| card:vote / card:voted | card:react / card:reacted | Payload includes full reaction summary |
| — | timer:started | `{ endTime }` Unix timestamp |
| — | timer:cancelled | No payload |

On `join-board`, if a timer is active, the server emits `timer:started` to the joining socket.
