import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { knowledgeBase } from "@boardstack/shared";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { trackDashboardEvent } from "@/lib/analytics";

export const Route = createFileRoute("/_app/help/$slug")({
  component: HelpTopicPage,
});

function HelpTopicPage() {
  const { slug } = Route.useParams();
  const topic = knowledgeBase.app.help.topics.find(
    (candidate) => candidate.id === slug,
  );

  if (!topic) {
    throw notFound();
  }

  useEffect(() => {
    trackDashboardEvent("help_topic_opened", {
      category: topic.category,
      source: "help_topic",
      topic_id: topic.id,
    });
  }, [topic.category, topic.id]);

  const glossary = knowledgeBase.app.help.glossary.filter((entry) =>
    topic.glossaryTerms.includes(entry.term),
  );
  const relatedPageHelp = knowledgeBase.app.help.pageHelp.filter((help) =>
    help.routes.some((route) => topic.relatedRoutes.includes(route)),
  );

  return (
    <PageContainer variant="form" className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/help" search={{ role: undefined }}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Back to help
        </Link>
      </Button>
      <PageHeader
        title={topic.title}
        description={`${topic.summary} Usually takes ${topic.timeEstimate}.`}
      />

      <article className="space-y-8">
        {topic.sections.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="text-lg font-semibold leading-tight">
              {section.heading}
            </h2>
            <p className="text-sm leading-7 text-muted-foreground">
              {section.body}
            </p>
            {section.steps && (
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
                {section.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </article>

      {glossary.length > 0 && (
        <section className="rounded-lg border bg-muted/30 p-4">
          <h2 className="text-sm font-semibold">Words used in this guide</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {glossary.map((entry) => (
              <div key={entry.term}>
                <p className="text-sm font-medium">{entry.term}</p>
                <p className="text-sm text-muted-foreground">{entry.meaning}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {relatedPageHelp.length > 0 && (
        <section className="rounded-lg border bg-muted/30 p-4">
          <h2 className="text-sm font-semibold">Related app areas</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {relatedPageHelp.map((help) => (
              <div key={help.id} className="space-y-1">
                <p className="text-sm font-medium">{help.title}</p>
                <p className="text-sm text-muted-foreground">{help.nextStep}</p>
                <Button asChild size="sm" variant="outline" className="mt-2">
                  <Link
                    to={help.href as Parameters<typeof Link>[0]["to"]}
                    aria-label={`Open ${help.title}`}
                  >
                    Open related guide
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <nav className="flex flex-wrap items-center gap-3 border-t pt-6">
        <Button asChild>
          <Link to="/help" search={{ role: undefined }}>
            Back to guides
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/dashboard">Return to dashboard</Link>
        </Button>
      </nav>
    </PageContainer>
  );
}
