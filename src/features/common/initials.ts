// Shared `initialsOf` — the single implementation of "up to two initials from a name", used by the
// no-photo avatar fallbacks across the app (ProfileSidebar, AvatarMarker, BrowseRow, PersonPicker).
// Extracting it here (IN-01) removes the previously duplicated copies so a future locale/format tweak
// can never drift between call sites.

/** Up to two initials from a name (first + last), uppercased. Falls back to `?` for a blank name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
