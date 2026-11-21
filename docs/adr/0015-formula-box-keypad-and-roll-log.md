# How the formula box, keypad and roll log behave

Recorded on 2026-11-21 from the code comments they replace. The e2e specs in `apps/web/e2e` check most of this.

**Roll log.** Every roll this session, newest at the bottom, one line per roll showing every die. It's a flat tree so it stays one tab stop: Up and Down move between entries, Home and End jump. It's the only part of the page that scrolls. Like a chat, it sticks to the bottom while the reader is there, lets go once they scroll up, and offers a way back. A roll made on this page always brings it back to the bottom. Only a roll made on this page plays the arrival; history that loads with the page or arrives from another tab doesn't.

**Formula box keys.** With suggestions open, the arrows move through them, Tab accepts the highlighted one, Enter accepts it only after an arrow chose it (otherwise Enter rolls), and Esc closes them. Without suggestions, Up and Down step through past rolls like a shell, and Esc moves to the newest log entry, which sits above the box. The box keeps focus and keys while the completion list is open; the list is driven by `aria-activedescendant`.

**Keypad.** A die after a number joins it (`2` then d6 is `2d6`). A die after nothing, an operator or another die starts a new term (`d6`, then d8, is `d6+d8`), so taps always make a formula the engine accepts. Like a calculator, once a formula has been rolled, a digit or die starts a new formula and an operator carries on from the old one. Under the Auto setting the keypad shows on touch screens, whatever their width. The formula box takes focus on load except on a touch screen, where focus would raise the system keyboard over the keypad.

**Command palette.** Plain typing searches presets, commands and characters; `@` searches only characters and `>` only commands. Characters and edit rows appear only once something is typed, so the first view stays short.

**Focus.** When a dialog closes, focus goes back to what opened it, or to the formula box if that's gone (a renamed or deleted preset's Edit button). A form dialog closes on Esc, not on a press outside it (#346, Modern Web Guidance `dialog`). Buttons, links and inputs draw a focus ring; roll log rows draw their own highlight instead.

**Loading.** Lists that come from storage are `null` until storage has been read, so they never flash empty.

**Colour is never the only cue.** A critical hit or miss and doubled damage dice carry a visible text label beside their coloured edge. Dropped and rerolled dice are faded and struck through and an exploded die has a lime edge, with no word on screen; the word is generated content, so a screen reader reads it in the die's name without a second piece of visible text for that name to disagree with.
