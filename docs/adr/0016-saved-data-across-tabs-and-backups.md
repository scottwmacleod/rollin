# Saved data across tabs, and backups

Recorded on 2026-11-21 from the code comments they replace.

**One store, latest save wins.** The app saves through one small `Storage` interface (`apps/web/src/storage`), backed by IndexedDB. If IndexedDB is missing or blocked, as in some private modes, the app falls back to memory and says so. Each save is announced to other tabs over a BroadcastChannel carrying the new value, so the latest save wins everywhere.

**Read before write.** Changing characters, presets or a backup Add reads what's saved just before writing, so a change another tab saved a moment ago is kept, not overwritten.

**Roll log.** The log is saved after a roll or the first load, from committed state, so rolls handled in one batch are all saved; a roll made before storage opens waits for it. Rolls made before the saved log loads are kept after the saved ones and renumbered to follow them. An entry's id is one past the largest saved, so ids never collide with another tab's.

**Backups.** A backup file carries a format version. `UPGRADES[n]` turns a version `n` file into version `n + 1`, and import walks the steps up to the current version, so a file from any past version still opens; bumping the version means adding a step. Replace either saves everything or throws and leaves the page as it was. Add writes presets first and characters last, so a failure part way leaves the larger piece untouched; if it fails after saving one of the two, the page shows what's really saved. Names in a file go through the same rules as names typed into the app: lowercased, a name that can't be made valid is left out and counted, and a repeat after lowercasing is dropped. Two items are the same when their cleaned JSON is equal; key order doesn't matter and a missing key equals `undefined`.

**Backup reminder.** The state behind the "back up your data" nudge is kept on this device only and is never part of a backup.
