# Formula syntax is a strict superset of v1

Every v1 formula parses and means the same in v2, so existing `presets.json` files and muscle memory keep working. Output format and CLI behavior are free to change; the grammar is not. New syntax must not collide with v1 forms, so features are added as suffixes (`adv`, `dis`, `!`, `r`) and new prefixes (`@`, `#`, `Nx`) rather than by redefining existing tokens.
