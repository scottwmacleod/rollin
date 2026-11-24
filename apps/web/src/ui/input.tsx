import { Label as LabelPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "./utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 max-md:h-11 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

const FieldContext = React.createContext<{ id: string; invalid: boolean } | null>(null);

function Field({
  invalid,
  className,
  ...props
}: React.ComponentProps<"div"> & { name?: string; invalid?: boolean }) {
  const id = React.useId();
  return (
    <FieldContext value={{ id, invalid: invalid === true }}>
      <div className={cn("flex flex-col gap-2", className)} {...props} />
    </FieldContext>
  );
}

function FieldLabel(props: React.ComponentProps<typeof Label>) {
  const field = React.useContext(FieldContext);
  return <Label htmlFor={field?.id} {...props} />;
}

function FieldError({
  className,
  match: _match,
  ...props
}: React.ComponentProps<"p"> & { match?: boolean }) {
  const field = React.useContext(FieldContext);
  return (
    <p
      id={field ? `${field.id}-error` : undefined}
      className={cn("m-0 text-sm text-destructive", className)}
      {...props}
    />
  );
}

function FieldInput({ ...props }: React.ComponentProps<typeof Input>) {
  const field = React.useContext(FieldContext);
  return (
    <Input
      id={field?.id}
      aria-invalid={field?.invalid ? true : undefined}
      aria-describedby={field?.invalid ? `${field.id}-error` : undefined}
      {...props}
    />
  );
}

export { Field, FieldError, FieldInput, FieldLabel, Input, Label };
