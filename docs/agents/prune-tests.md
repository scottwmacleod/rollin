# prune-tests

From [caldoai/skills](https://github.com/caldoai/skills/blob/main/skills/prune-tests/SKILL.md) (MIT), pinned at commit `d5b68da`: `npx skills add caldoai/skills --skill prune-tests`. It deletes or rewrites tests that guard no behaviour (tests for removed code, tests that can't fail, tests tied to the implementation, duplicates) and removes production code that only existed for those tests. For rollin and planning-poker; the site has no unit tests.

Guardrails:

- Run it once per product, after the product's test suite has settled, not as a routine step.
- One PR per product that lists every deleted or rewritten test with the reason the skill gives. Coverage of the behaviour that's left must not drop.
- Never touch rollin's frozen parity fixtures (`packages/engine/fixtures/parity`), or any axe, contrast or Lighthouse check.
