import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { knowledgeBase, type HelpCategory } from "@boardstack/shared";
import { BookOpen, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trackDashboardEvent } from "@/lib/analytics";
import { makeHelpSearchHandlers } from "@/lib/help-search-analytics";

export const Route = createFileRoute("/_app/help")({
  validateSearch: (search: Record<string, unknown>) => ({
    role: typeof search["role"] === "string" ? search["role"] : undefined,
  }),
  component: HelpPage,
});

const CATEGORY_LABELS: Record<HelpCategory, string> = {
  start: "Start here",
  files: "Files",
  finance: "Finance",
  governance: "Governance",
  reports: "Reports",
  "owner-portal": "Owner portal",
};

const helpKnowledge = knowledgeBase.app.help;
const helpTopics = helpKnowledge.topics;
const rolePaths = helpKnowledge.rolePaths;
const glossary = helpKnowledge.glossary;

function normalizeHelpKey(value: string): string {
  return value.trim().toLowerCase();
}

function slugifyRole(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getKnowledgeRolePath(role: string) {
  const normalizedRole = normalizeHelpKey(role);
  const slugRole = slugifyRole(role);

  return rolePaths.find(
    (path) =>
      normalizeHelpKey(path.role) === normalizedRole ||
      path.id === normalizedRole ||
      path.id === slugRole,
  );
}

function searchKnowledgeTopics(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return helpTopics;

  return helpTopics.filter((topic) => {
    const haystack = [
      topic.title,
      topic.summary,
      topic.category,
      topic.audience,
      ...topic.sections.flatMap((section) => [
        section.heading,
        section.body,
        ...(section.steps ?? []),
      ]),
      ...topic.glossaryTerms,
    ]
      .join("")
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

function HelpPage() {
  const { role } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<HelpCategory | "all">("all");
  const selectedRole = role ? getKnowledgeRolePath(role) : undefined;
  const filteredTopics = useMemo(() => {
    const matches = searchKnowledgeTopics(query);
    if (category === "all") return matches;
    return matches.filter((topic) => topic.category === category);
  }, [category, query]);

  const searchHandlers = useMemo(() => makeHelpSearchHandlers(), []);

  function trackSearch(nextQuery: string) {
    const trimmed = nextQuery.trim();
    if (!trimmed) return;
    const matches = searchKnowledgeTopics(nextQuery);
    const resultCount =
      category === "all"
        ? matches.length
        : matches.filter((topic) => topic.category === category).length;
    trackDashboardEvent("help_search_performed", {
      query_length: trimmed.length,
      result_count: resultCount,
    });
    searchHandlers.onSearch({
      result_count: resultCount,
      has_results: resultCount > 0,
    });
  }

  function selectCategory(nextCategory: HelpCategory | "all") {
    setCategory(nextCategory);
    const matches = searchKnowledgeTopics(query);
    trackDashboardEvent("help_category_selected", {
      category: nextCategory,
      result_count:
        nextCategory === "all"
          ? matches.length
          : matches.filter((topic) => topic.category === nextCategory).length,
    });
  }

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title={selectedRole?.role ?? "Help Center"}
        description={
          selectedRole?.summary ??
          "Plain-language guides for board members and homeowners. Each guide gives you one clear next step."
        }
      />

      {selectedRole && (
        <section className="rounded-lg border bg-muted/30 p-4">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Start here</h2>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              {selectedRole.firstSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <Button asChild variant="outline" size="sm">
              <Link to="/help" search={{ role: undefined }}>
                See all help
              </Link>
            </Button>
          </div>
        </section>
      )}

      <section className="rounded-lg border bg-muted/30 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <label className="relative block">
            <span className="sr-only">Search help</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                trackSearch(event.target.value);
              }}
              onFocus={() => searchHandlers.onOpen()}
              placeholder="Search guides, e.g. dues, PDF, reserve study, downloads…"
              className="pl-9"
            />
          </label>
          <Button asChild variant="outline">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </section>

      <Tabs defaultValue="topics" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="topics">Guides</TabsTrigger>
          <TabsTrigger value="roles">Start by role</TabsTrigger>
          <TabsTrigger value="glossary">Glossary</TabsTrigger>
        </TabsList>

        <TabsContent value="topics" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={category === "all" ? "default" : "outline"}
              onClick={() => selectCategory("all")}
            >
              All
            </Button>
            {(Object.keys(CATEGORY_LABELS) as HelpCategory[]).map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={category === key ? "default" : "outline"}
                onClick={() => selectCategory(key)}
              >
                {CATEGORY_LABELS[key]}
              </Button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {filteredTopics.map((topic, index) => (
              <Card key={topic.id}>
                <CardHeader>
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <CardTitle className="break-words text-base">
                        {topic.title}
                      </CardTitle>
                      <CardDescription>{topic.summary}</CardDescription>
                    </div>
                    <Badge className="w-fit shrink-0" variant="neutral">
                      {CATEGORY_LABELS[topic.category]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Usually takes {topic.timeEstimate}.
                  </p>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/help/$slug"
                      params={{ slug: topic.id }}
                      search={{ role: undefined }}
                      onClick={() => {
                        trackDashboardEvent("help_topic_opened", {
                          category: topic.category,
                          source: "help_index",
                          topic_id: topic.id,
                        });
                        searchHandlers.onResultClick({
                          result_position: index + 1,
                        });
                      }}
                    >
                      Read guide
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredTopics.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <BookOpen
                aria-hidden="true"
                className="mx-auto h-8 w-8 text-muted-foreground"
              />
              <h2 className="mt-3 text-sm font-semibold">No guide found</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a simpler word like dues, PDF, bank, reserve, or homeowner.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="roles">
          <div className="grid gap-4 md:grid-cols-2">
            {rolePaths.map((path) => (
              <Card key={path.role}>
                <CardHeader>
                  <CardTitle className="text-base">{path.role}</CardTitle>
                  <CardDescription>{path.summary}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                    {path.firstSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <Button asChild size="sm" variant="outline" className="mt-4">
                    <Link
                      to={path.href as Parameters<typeof Link>[0]["to"]}
                      onClick={() =>
                        trackDashboardEvent("help_role_path_opened", {
                          role_path_id: path.id,
                          source: "help_index",
                        })
                      }
                    >
                      Open role guide
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="glossary">
          <div className="grid gap-3 md:grid-cols-2">
            {glossary.map((entry) => (
              <div key={entry.term} className="rounded-lg border p-4">
                <h2 className="text-sm font-semibold">{entry.term}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {entry.meaning}
                </p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

export { CATEGORY_LABELS };
