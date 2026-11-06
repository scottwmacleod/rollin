# Store data as TOML under ~/.config/rollin, one file per character

Data lives in `$XDG_CONFIG_HOME/rollin` (default `~/.config/rollin`), not next to the binary and not in the macOS-native Application Support directory, so it is easy to dotfile and survives a move to other platforms. TOML is used over JSON so sheets are hand-editable and can carry comments. Each character is its own file so one can be copied or shared alone. v1's `presets.json` is migrated by an explicit `import` command, not auto-detected, so nothing is silently read or rewritten. Writes are atomic (temp file, then rename), and saves edit an existing file in place (`toml_edit`) so hand-written comments, ordering and formatting survive; only a new file is written fresh.

## Windows (amended 2026-11-06)

On Windows there is no `HOME` or XDG variable, so data lives in `%APPDATA%\rollin` (Roaming). The CLI is not released for Windows, so matching its `~/.config` layout there is not a goal. macOS and Linux are unchanged. The rule is `rollin::config_dir_from_env`, with the Windows branch unit-tested through `windows_config_dir`.
