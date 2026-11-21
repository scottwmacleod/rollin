# Biome rules turned off, and why

The sm_ conventions ask for a reason for every Biome rule a product turns off, recorded in an ADR. These are rollin's, from `biome.jsonc`. Recorded on 2026-11-21 from the config comments they replace.

- **`complexity/noImportantStyles`**: the reduced-motion reset in `apps/web/src/index.css` must beat every component's own animation and transition values.
- **`suspicious/noArrayIndexKey`**: every keyed list is a fixed, ordered rendering of one roll or one tree level, so the index is the identity. A content key would collide on repeated dice or terms.
- **`correctness/useExhaustiveDependencies`**: some effects are triggered on purpose by refs, stable callbacks and a roll counter, and adding the suggested dependencies would change when they run. #360 tracks driving those from events instead and turning the rule back on.
- **`a11y/useSemanticElements`**: `role="group"` divs avoid `fieldset`'s default border, padding and legend layout. #362 tracks switching to `fieldset` with those defaults reset.
- **`a11y/noNoninteractiveElementToInteractiveRole`, `a11y/useFocusableInteractive`, `a11y/useKeyWithClickEvents`**: the formula completion list is a combobox listbox driven by `aria-activedescendant` from the input. Focus stays in the input, so the options must not be focusable or take keys. #363 tracks scoping these to that one component.
