---
status: testing
phase: 01-storage-spine-first-person-on-a-map
source: [01-VERIFICATION.md]
started: 2026-06-24T15:50:00Z
updated: 2026-06-24T15:50:00Z
---

## Current Test

number: 1
name: Live Drive Connect — drive.file-only consent + visible folder (STOR-01)
expected: |
  After completing SETUP.md (create the OAuth Client ID, set VITE_GOOGLE_CLIENT_ID in .env)
  and clicking "Connect Drive" with a real Google account:
  (a) the OAuth consent screen shows ONLY "files this app creates" (drive.file), NOT
      "See and manage all of your Google Drive files";
  (b) a visible "Relation Blueprint" folder appears at drive.google.com;
  (c) the status pill transitions to "Drive – Synced".
awaiting: user response

## Tests

### 1. Live Drive Connect — drive.file-only consent + visible folder (STOR-01)
expected: Consent screen lists only drive.file ("files this app creates"), never broad Drive access (T-01-01); a visible "Relation Blueprint" folder appears in Google Drive; status pill → "Drive – Synced".
result: [pending]

### 2. Live Drive Sync Round-Trip (STOR-02 / STOR-04)
expected: After connecting a real Google account and creating a person, the SyncEngine push() commits people/maps/markers shards + manifest into the visible "Relation Blueprint" folder; the shard files are present in Drive and contain the created entities.
result: [pending]

### 3. Token Expiry Reconnect Flow (>1h session)
expected: After a session exceeding ~60 min, the status pill transitions to "Drive – Reconnect" without blocking the app; clicking Reconnect re-acquires a token and resumes sync (no queued writes dropped).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
