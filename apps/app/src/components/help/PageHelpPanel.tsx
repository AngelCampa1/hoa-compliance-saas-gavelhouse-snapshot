import type { ProductPageHelp } from "@boardstack/shared";
import { Link } from "@tanstack/react-router";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHelpPanel({ help }: { help: ProductPageHelp }) {
  return (
    <section
      aria-label={help.title}
      className="rounded-lg border bg-muted/30 p-4 text-sm"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-primary">
          <CircleHelp className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">{help.title}</h2>
            <p className="mt-1 text-xs font-semibold uppercase text-primary">
              What this page is for
            </p>
            <p className="mt-1 text-muted-foreground">{help.purpose}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md bg-background/70 p-3">
              <h3 className="text-xs font-semibold uppercase text-primary">
                What to do next
              </h3>
              <p className="mt-1 text-muted-foreground">{help.nextStep}</p>
            </div>
            <div className="rounded-md bg-background/70 p-3">
              <h3 className="text-xs font-semibold uppercase text-primary">
                Common mistake
              </h3>
              <p className="mt-1 text-muted-foreground">{help.commonMistake}</p>
            </div>
          </div>
          <div className="flex justify-start">
            <Button asChild variant="outline" size="sm">
              <Link to={help.href as Parameters<typeof Link>[0]["to"]}>
                Open full guide
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
