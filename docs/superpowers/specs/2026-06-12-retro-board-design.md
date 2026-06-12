# Retro Board — Design Spec

## Overview

A lightweight, real-time retrospective board web app for running team retros across distributed teams (US, Eastern Europe, India). The admin (a single PM) creates PIN-protected boards, shares them with participants, and exports the results as Markdown for upload to Cortex.

## Architecture

**Approach:** Single Node.js application (Approach A)

- **Server:** Express.js serving static frontend files + REST API + WebSocket server
- **Real-time:** Socket.IO for live card/vote/presence updates
- **Database:** SQLite via `better-sqlite3` — single `.db` file, no external services
- **Frontend:** Vanilla HTML/CSS/JavaScript — no framework
- **Auth:** Admin login with bcrypt-hashed passwords, session cookies. Participants authenticate per-board via PIN only.

**Deployment path:** Local development first (Option D), deploy to Render free tier later (Option A). Designed to be portable — the app is self-contained with no external service dependencies.

## Data Model

### `admins` table

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| username | TEXT UNIQUE | Admin login name |
| password_hash | TEXT | bcrypt hash |
| created_at | DATETIME | Default: now |

### `boards` table

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| title | TEXT | User-defined board name |
| pin | TEXT | 6-digit code for participant access |
| is_locked | BOOLEAN | Default: false. When true, board is read-only |
| admin_id | INTEGER FK | References admins.id |
| created_at | DATETIME | Default: now |

### `cards` table

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| board_id | TEXT FK | References boards.id |
| column | TEXT | One of: went_well, to_improve, stop_doing, action_items |
| text | TEXT | Card content |
| author | TEXT | Display name or "Anonymous" |
| session_id | TEXT | Browser session identifier — used to determine edit/delete permissions |
| assignee | TEXT | Optional. Only relevant for action_items column |
| created_at | DATETIME | Default: now |

### `votes` table

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| card_id | TEXT FK | References cards.id |
| session_id | TEXT | Prevents double-voting per session |
| UNIQUE | | (card_id, session_id) — one vote per person per card |

### `participants` table

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| board_id | TEXT FK | References boards.id |
| session_id | TEXT | Browser session identifier |
| display_name | TEXT | Name or "Anonymous" |
| joined_at | DATETIME | Default: now |

The `participants` table serves two purposes: tracking who has ever joined (for export) and powering the live presence indicator (cross-referenced with active WebSocket connections).

## Pages & Navigation

### 1. Join page — `/` (home)

- Two fields: Board PIN, Display Name
- Checkbox: "Join anonymously" (disables the name field, sets author to "Anonymous")
- Submit button joins the board and redirects to `/board/:id`
- Error shown if PIN is invalid

### 2. Admin Login — `/login`

- Username and password fields
- Redirects to `/dashboard` on success
- On first run (no admin exists), this page shows a "Create Admin Account" form instead

### 3. Dashboard — `/dashboard` (admin only)

- "Create New Board" button at the top — opens a form for board title (PIN is auto-generated)
- Flat list of all boards, newest first
- Each board entry shows: title, creation date, PIN, locked status
- Click a board to open it

### 4. Board — `/board/:id`

- **Header area:** Board title, lock/unlock toggle (admin only), Export to Markdown button, presence indicator
- **Presence indicator:** Shows connected users by name, with anonymous users grouped (e.g., "Online: Odysseas, Priya, 3 anonymous")
- **Four columns side by side:** Went Well | To Improve | Stop Doing | Action Items
- **Each column:** Text input at the bottom to add a new card
- **Each card displays:** text, author name, upvote button with count, edit/delete icons (only visible on your own cards)
- **Action item cards:** Additional optional assignee field
- **When locked:** All inputs disabled, board is read-only. Presence indicator and viewing still work.

## Real-time Collaboration

Powered by Socket.IO WebSockets. Each board is a "room" that all connected participants join.

### Events broadcast to all participants in a board room

| Event | Payload | Trigger |
|-------|---------|---------|
| card:added | Full card object | Someone adds a card |
| card:edited | Card id + new text (+ assignee for action items) | Someone edits their card |
| card:deleted | Card id | Someone deletes their card |
| card:voted | Card id + new vote count | Someone upvotes a card |
| board:locked | Lock state (true/false) | Admin toggles lock |
| presence:updated | List of current participants (names + anonymous count) | Someone joins or leaves |

### Connection handling

- On disconnect (bad wifi, laptop sleep), Socket.IO auto-reconnects
- On reconnect, the client fetches full board state via REST API to sync up
- Presence is derived from active WebSocket connections — when a socket disconnects, the user drops from the presence list after a short grace period (5 seconds, to handle momentary blips)

## Authentication & Access Control

### Admin

- Single admin account created on first run
- Login via username + password at `/login`
- Session maintained via secure HTTP-only cookie
- Admin privileges: create boards, lock/unlock boards, view dashboard, access any board without PIN

### Participants

- Access a board by entering its 6-digit PIN on the home page
- Choose a display name or join anonymously
- Session stored in browser — tied to a randomly generated session ID
- Can edit/delete only their own cards (matched by session ID)
- Can upvote any card (one vote per card per session)

### Board access rules

- Board URL alone is not sufficient — PIN is required (unless admin is logged in)
- Locked boards: viewable by everyone, editable by no one (including admin)

## Markdown Export

Clicking "Export to Markdown" downloads a `.md` file.

### Output format

```markdown
# {Board Title}
**Date:** {board creation date}
**Participants:** {all participants who ever joined, with anonymous count}

## Went Well
- {card text} ({author}) 👍 {vote count}

## To Improve
- {card text} ({author}) 👍 {vote count}

## Stop Doing
- {card text} ({author}) 👍 {vote count}

## Action Items
- {card text} → **Assigned to: {assignee}** ({author}) 👍 {vote count}
```

### Export rules

- Cards sorted by upvote count (highest first) within each column
- Participants list includes everyone who ever joined the board, not just currently online
- Action items include assignee in bold if set
- Cards with zero votes omit the vote indicator (in export only — the UI always shows the upvote button with a "0" count so users know they can vote)
- Filename pattern: `retro-{slugified-title}-{YYYY-MM-DD}.md`

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Server framework | Express.js |
| WebSockets | Socket.IO |
| Database | SQLite via better-sqlite3 |
| Auth hashing | bcrypt |
| Session management | express-session with SQLite session store |
| Frontend | Vanilla HTML + CSS + JavaScript |
| Package manager | npm |

## Future Considerations (not in scope for MVP)

These are deferred for the "bells and whistles" phase:
- Visual polish: colors, icons, animations, card styling
- Drag-and-drop card reordering
- Board templates
- Timer/countdown for retro timeboxing
- Deployment to Render or company infrastructure
- Customizable columns
