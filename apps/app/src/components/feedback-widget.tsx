import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/lib/api";

type Category = "bug" | "idea" | "other";

const MAX_MESSAGE_LENGTH = 2000;

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "idea", label: "Idea" },
  { value: "other", label: "Other" },
];

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setCategory(null);
    setMessage("");
    setSubmitting(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    setOpen(next);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!category || message.trim().length === 0 || submitting) return;
    setSubmitting(true);
    try {
      await api.feedback.submit({
        category,
        message: message.trim(),
        pageUrl: window.location.href,
      });
      toast.success("Feedback sent. Thank you!");
      handleOpenChange(false);
    } catch {
      toast.error("Could not send feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    category !== null && message.trim().length > 0 && !submitting;

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => handleOpenChange(true)}
        aria-label="Open feedback form"
        className="fixed bottom-6 right-6 z-40 min-h-11 min-w-11 gap-2 rounded-full shadow-lg"
      >
        <MessageSquare className="h-4 w-4" aria-hidden="true" />
        <span>Feedback</span>
      </Button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="flex w-full max-w-md flex-col">
          <SheetHeader>
            <SheetTitle>Send Feedback</SheetTitle>
            <SheetDescription>
              Send a bug report, feature idea, or general comment to the
              Gavelhouse team.
            </SheetDescription>
          </SheetHeader>
          <form
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col gap-4 overflow-y-auto py-4"
          >
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Category</legend>
              <div className="flex gap-2">
                {CATEGORIES.map((cat) => (
                  <Button
                    key={cat.value}
                    type="button"
                    variant={category === cat.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCategory(cat.value)}
                    aria-pressed={category === cat.value}
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-col gap-1">
              <label htmlFor="feedback-message" className="text-sm font-medium">
                Message
              </label>
              <Textarea
                id="feedback-message"
                value={message}
                onChange={(e) =>
                  setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))
                }
                placeholder="What happened, or what would you like to see?"
                rows={5}
                maxLength={MAX_MESSAGE_LENGTH}
                disabled={submitting}
                aria-required="true"
              />
              <p className="text-right text-xs text-muted-foreground">
                {message.length}/{MAX_MESSAGE_LENGTH}
              </p>
            </div>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? "Sending…" : "Submit Feedback"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
