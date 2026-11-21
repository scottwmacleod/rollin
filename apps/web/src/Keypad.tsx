import { KEYPAD_DICE, type Key, press } from "./keypad.ts";
import { Button } from "./ui";

const KEY =
  "press inline-flex min-h-11 min-w-11 items-center justify-center rounded-1 border border-control-line bg-surface font-mono text-base text-ink active:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-ink";

export function Keypad({
  formula,
  fresh,
  onChange,
  onRoll,
}: {
  formula: string;
  fresh: boolean;
  onChange: (formula: string) => void;
  onRoll: () => void;
}) {
  const tap = (key: Key) => onChange(press(formula, key, fresh));
  const digit = (d: string) => (
    <Button key={d} type="button" className={KEY} onClick={() => tap({ kind: "digit", digit: d })}>
      {d}
    </Button>
  );
  return (
    <div role="group" aria-label="Dice keypad" className="flex w-full flex-col gap-1 md:max-w-md">
      <div className="grid grid-cols-7 gap-1">
        {KEYPAD_DICE.map((sides) => (
          <Button
            key={sides}
            type="button"
            aria-label={`d${sides}`}
            className={`${KEY} px-0 text-sm`}
            onClick={() => tap({ kind: "die", sides })}
          >
            d{sides}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1">
        {["1", "2", "3"].map(digit)}
        <Button
          type="button"
          aria-label="plus"
          className={KEY}
          onClick={() => tap({ kind: "op", op: "+" })}
        >
          +
        </Button>
        <Button
          type="button"
          aria-label="backspace"
          className={KEY}
          onClick={() => tap({ kind: "back" })}
        >
          ⌫
        </Button>
        {["4", "5", "6"].map(digit)}
        <Button
          type="button"
          aria-label="minus"
          className={KEY}
          onClick={() => tap({ kind: "op", op: "-" })}
        >
          −
        </Button>
        <Button
          type="button"
          aria-label="all clear"
          className={KEY}
          onClick={() => tap({ kind: "clear" })}
        >
          C
        </Button>
        {["7", "8", "9", "0"].map(digit)}
        <Button
          type="button"
          onClick={onRoll}
          className="press inline-flex min-h-11 items-center justify-center rounded-1 bg-signal font-mono text-base font-semibold lowercase text-on-signal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-ink"
        >
          Roll
        </Button>
      </div>
    </div>
  );
}
