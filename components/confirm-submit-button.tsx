"use client";

import { cn } from "@/lib/utils";

export function ConfirmSubmitButton({
  children,
  message,
  danger,
  disabled,
  className,
  "data-testid": dataTestId
}: {
  children: React.ReactNode;
  message: string;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <button
      data-testid={dataTestId}
      disabled={disabled}
      type="submit"
      onClick={(event: { preventDefault: () => void }) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
      className={cn(
        "focus-ring inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50",
        danger ? "bg-danger text-white hover:bg-danger/90" : "bg-ink text-white hover:bg-black",
        className
      )}
    >
      {children}
    </button>
  );
}
