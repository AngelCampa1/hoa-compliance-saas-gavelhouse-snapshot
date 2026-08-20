import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import type { Community } from "@/lib/api";
import { useCommunity } from "@/lib/community-context";
import { useQueryClient } from "@tanstack/react-query";

type Props = {
  communities: Array<{ community: Community; role: string }>;
  isLoading?: boolean;
};

export function CommunitySwitcher({ communities, isLoading = false }: Props) {
  const { selectedCommunityId, setSelectedCommunityId } = useCommunity();
  const queryClient = useQueryClient();

  if (isLoading) {
    return (
      <span className="text-sm text-muted-foreground">
        Loading community...
      </span>
    );
  }

  if (communities.length === 0) {
    return <span className="text-sm text-muted-foreground">No community</span>;
  }

  const active =
    communities.find((c) => c.community.id === selectedCommunityId)
      ?.community ?? communities[0]!.community;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="min-w-0 max-w-[min(22rem,55vw)] gap-1 px-2 sm:max-w-sm"
          aria-label={active.name ? active.name : "Select community"}
        >
          <span className="min-w-0 truncate">{active.name}</span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[min(22rem,90vw)]">
        {communities.map(({ community }) => (
          <DropdownMenuItem
            key={community.id}
            onSelect={() => {
              if (community.id !== selectedCommunityId) {
                // Remove community-scoped cached data before switching so the
                // next route does not briefly show the previous community's data
                // while queries refetch (HIGH-APP-15). TanStack Query keys are
                // always arrays, so a plain `includes` on the previous id is
                // enough to target the outgoing community's cached queries.
                queryClient.removeQueries({
                  predicate: (query) =>
                    query.queryKey.includes(selectedCommunityId),
                });
              }
              setSelectedCommunityId(community.id);
            }}
            className="min-w-0"
          >
            <span className="min-w-0 truncate">{community.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
