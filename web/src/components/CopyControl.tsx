import { Check, CircleAlert, Copy } from "lucide-react";
import { useId, useRef, useState } from "react";

interface CopyControlProps {
  value: string;
  label: string;
  successMessage: string;
  failureMessage: string;
  onCopy?: (value: string) => Promise<void> | void;
}

interface CopyFeedback {
  announcementId: number;
  message: string;
  status: "success" | "error";
  value: string;
}

async function writeToClipboard(value: string) {
  const clipboard = globalThis.navigator?.clipboard;

  if (!clipboard?.writeText) {
    throw new Error("Clipboard access is unavailable.");
  }

  await clipboard.writeText(value);
}

export function CopyControl({
  value,
  label,
  successMessage,
  failureMessage,
  onCopy,
}: CopyControlProps) {
  const feedbackId = useId();
  const announcementId = useRef(0);
  const [feedback, setFeedback] = useState<CopyFeedback | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const currentFeedback = feedback?.value === value ? feedback : null;

  const handleCopy = async () => {
    const copiedValue = value;
    setFeedback(null);
    setIsCopying(true);

    try {
      if (onCopy) {
        await onCopy(copiedValue);
      } else {
        await writeToClipboard(copiedValue);
      }

      announcementId.current += 1;
      setFeedback({
        announcementId: announcementId.current,
        message: successMessage,
        status: "success",
        value: copiedValue,
      });
    } catch {
      announcementId.current += 1;
      setFeedback({
        announcementId: announcementId.current,
        message: failureMessage,
        status: "error",
        value: copiedValue,
      });
    } finally {
      setIsCopying(false);
    }
  };

  const FeedbackIcon =
    currentFeedback?.status === "success"
      ? Check
      : currentFeedback?.status === "error"
        ? CircleAlert
        : Copy;

  return (
    <>
      <button
        aria-busy={isCopying || undefined}
        aria-describedby={currentFeedback ? feedbackId : undefined}
        aria-label={label}
        className="copy-button copy-control__button"
        data-copy-state={currentFeedback?.status ?? (isCopying ? "copying" : "idle")}
        disabled={isCopying}
        onClick={() => void handleCopy()}
        title={currentFeedback?.message ?? label}
        type="button"
      >
        <FeedbackIcon aria-hidden="true" size={18} strokeWidth={1.5} />
      </button>
      <span
        aria-atomic="true"
        aria-live="polite"
        className="copy-control__feedback"
        id={feedbackId}
        role="status"
      >
        {currentFeedback ? (
          <span key={currentFeedback.announcementId}>{currentFeedback.message}</span>
        ) : null}
      </span>
    </>
  );
}
