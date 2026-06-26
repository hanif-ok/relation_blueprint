# Relation Blueprint

## What This Is

A serverless, offline-capable web app (PWA) for **people-tracking and relationship mapping** across physical spaces. Like Mokuro, it has no backend and no accounts — every user owns their entire database in their **own** Google Drive or Mega.nz. You draw maps of locations, place people on them, give every person/place/group a rich customizable profile, define relationships between people and groups, and search and browse it all. It's for anyone who needs to answer "who is where, what are they like, and how do they connect" — a single curator maintaining their own private dataset.

## Core Value

You can place people on a map of real locations and instantly see **who is where**, open any person to see their full profile, and trace **how people and groups relate** — all from data you fully own, with no server.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. All are hypotheses until shipped and validated. -->

**Storage & app shell (serverless, Mokuro-model)**
- [ ] Connect to a user-chosen cloud provider (Google Drive **or** Mega.nz) and store the entire database there
- [ ] Read/write all data as files in the user's own cloud — no backend, no accounts, single curator
- [ ] Offline-capable PWA: installable, works offline against a local cache, syncs to the connected cloud
- [ ] Export the whole database as a portable backup

**Maps & editor**
- [ ] Create maps using uploaded images as backgrounds plus drawn shapes/lines/zones for rooms/areas
- [ ] Layers in the map editor
- [ ] Place people as markers (round photo avatar) on a map
- [ ] Place location-link markers with a distinctive unique shape that hyperlink ("portal") to another map
- [ ] Nest maps into spatial map-groups (floor → building → street) and navigate the hierarchy

**Entities (four first-class object types — each with custom fields, thumbnail, photo gallery, searchable)**
- [ ] People: out-of-box fields (name, photo, phone, description, tags, notes); can appear in multiple places at once
- [ ] Locations/Maps as objects with their own profile/media/fields
- [ ] Social Groups (distinct from spatial map-groups) with members and relations
- [ ] Relationship-links that carry their own data (label, date, notes)
- [ ] User-definable typed custom fields (text, number, date, phone, tags/select, link-to-entity, photo) configurable beyond the essentials
- [ ] Click a person/place → sidebar/menu showing their full data; thumbnail + multi-photo gallery per object

**Relationships & graph**
- [ ] Define relationships in an entity's details: person↔person, person↔group, group↔group
- [ ] Render data-defined relationships as connectors (derived from data, not hand-drawn)
- [ ] Graph view (viewer-only) visualizing how people and groups connect

**Browse & search**
- [ ] Browse people as a list
- [ ] Browse locations as a list (alongside direct map navigation)
- [ ] Smart fuzzy search over people across their attributes
- [ ] Per-field checkbox toggles to scope which attributes search matches (the "smith" vs "blacksmith" behavior)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Backend server / hosted database — defeats the core "own your data, no server" premise (Mokuro model)
- User accounts / authentication on our side — only cloud-provider connect (OAuth/API); no identity system to maintain
- Multi-user / real-time collaboration & conflict resolution — single curator per database by design
- Time/history dimension (tracking movement over time) — v1 records **current state only**
- CSV/spreadsheet import of people — deferred; v1 covers full-database export, not structured import
- Read-only shared snapshots of a map for non-users — deferred to a later version
- Editing relationships directly in the graph view — graph is viewer-only; relationships authored in entity details
- Geographic/satellite map tiles as backgrounds — v1 uses uploaded images only
- Full diagrams.io-grade vector editor (freeform beziers, advanced connectors) — beyond v1 editor scope
- App-level encryption of the database — v1 relies on provider security (Mega is end-to-end encrypted; Drive uses Google encryption)

## Context

- **Inspiration:** Mokuro — a purely client-side tool where the user's files *are* the database. This project applies the same "no backend, you own your data" model to spatial people/relationship mapping, and borrows diagrams.io's drawing/placement UX.
- **Single-curator model:** Each user runs their own instance against their own cloud. There is no shared/global database; "everyone has their own DB."
- **Provider-agnostic storage:** Must support both Google Drive and Mega.nz; the user picks which to connect.
- **Signature feature:** Field-scoped smart search — fuzzy matching over people with per-attribute checkboxes so a query like "smith" can match the name field while excluding the job field (so it won't surface blacksmiths).
- **Data-driven connectors:** Relationships are authored in an entity's data, then visualized — on maps as connectors and in a dedicated graph view — rather than drawn by hand.
- **Sensitivity:** Holds real people's info (descriptions, phones, photos). Mitigated by the single-user, own-cloud model; provider security is the v1 boundary.
- **Visual feel:** Deliberately deferred — to be defined in the design stage (`/gsd-ui-phase`).

## Constraints

- **Architecture**: Fully serverless / client-side (PWA) — All persistence is in the user's own Google Drive or Mega.nz; no backend may be introduced.
- **Tech stack**: Free and open-source only — Avoid paid services and paid API tiers; only free + OSS libraries and free cloud quotas.
- **Storage providers**: Google Drive + Mega.nz, user-selectable — Both must be supported via their official/free APIs/SDKs.
- **Offline**: PWA must function offline against a local cache and sync to the cloud — Mokuro-like usability without constant connectivity.
- **Scale**: Must degrade gracefully from small (dozens) to large (thousands+) databases — Client-side storage means indexing/lazy-loading/pagination matter as data grows.
- **Security**: Provider-level security only in v1 — Keeps v1 simple; app-level encryption is explicitly deferred.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Serverless, own-cloud storage (Mokuro model) | No backend to run/pay for; users own their data; matches the inspiration | — Pending |
| Support both Google Drive and Mega.nz (user picks) | Flexibility; avoid lock-in to one provider | — Pending |
| Single curator per database (no multi-user sync) | Removes conflict-resolution complexity; makes serverless feasible | — Pending |
| Four first-class object types incl. Groups and Relationship-links | Rich relationship modeling (person↔person/group, group↔group) with data-bearing links | — Pending |
| Typed custom fields | Powers per-field checkbox search and validation; the search feature depends on it | — Pending |
| Relationships are data-driven, graph is viewer-only | Single source of truth in entity data; connectors/graph are projections of it | — Pending |
| Social Groups separate from spatial Map-groups | Keeps social grouping and floor→building→street nesting from colliding | — Pending |
| v1 = current state only (no time/history) | Scope control; temporal tracking is a large feature deferred | — Pending |
| Provider security only (no app-level encryption) in v1 | Simplicity; Mega is e2e encrypted, Drive uses Google encryption | — Pending |
| Free/OSS-only dependencies | Keeps the tool free to run and self-hostable as a static site | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-26 after Phase 02.1 — closed the DATA-03 cloud-sync blocker so custom-field definitions round-trip through the manifest cloud path (own-your-whole-database guarantee restored for the custom-field schema).*
