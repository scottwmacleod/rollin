# Store data as TOML under ~/.config/rollin, one file per character

Data lives in `$XDG_CONFIG_HOME/rollin` (default `~/.config/rollin`), not next to the binary and not in the macOS-native Application Support directory, so it is easy to dotfile and survives a move to other platforms. TOML is used over JSON so sheets are hand-editable and can carry comments. Each character is its own file so one can be copied or shared alone. v1's `presets.json` is migrated by an explicit `import` command, not auto-detected, so nothing is silently read or rewritten. Writes are atomic (temp file, then rename).
