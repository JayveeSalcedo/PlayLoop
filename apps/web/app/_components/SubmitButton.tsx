"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "./Spinner";

/**
 * Submit button for a plain `<form action={serverAction}>` (no client-side
 * async call to hook a stage/pending state off of, unlike GamePlayer or
 * RewardsBoard). useFormStatus reads the pending state of the nearest
 * ancestor <form>, so this must be rendered as that form's child, not passed
 * the form's own props.
 */
export function SubmitButton({
  children,
  pendingText,
  className = "btn go lg block",
}: {
  children: React.ReactNode;
  pendingText: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className} suppressHydrationWarning>
      {pending ? (
        <>
          <Spinner size={22} /> {pendingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}
