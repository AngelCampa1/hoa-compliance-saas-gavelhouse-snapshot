import { PRODUCT_CONTEXTUAL_HELP } from "@boardstack/shared";
import { Link } from "@tanstack/react-router";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";

type HelpKey = keyof typeof PRODUCT_CONTEXTUAL_HELP;

export function HelpCallout({
  topic,
  showAction = true,
}: {
  topic: HelpKey;
  showAction?: boolean;
}) {
  const help = PRODUCT_CONTEXTUAL_HELP[topic];

  return (
    <section
      aria-label={help.title}
      className="rounded-lg border bg-muted/30 p-4 text-sm"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-primary">
          <CircleHelp className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">{help.title}</h2>
            <p className="text-muted-foreground">{help.body}</p>
          </div>
          <ul className="grid gap-2 text-muted-foreground md:grid-cols-3">
            {help.bullets.map((bullet) => (
              <li key={bullet} className="min-w-0 break-words">
                {bullet}
              </li>
            ))}
          </ul>
          {showAction && (
            <Button asChild variant="outline" size="sm">
              <Link to={help.href as Parameters<typeof Link>[0]["to"]}>
                Open help
              </Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
