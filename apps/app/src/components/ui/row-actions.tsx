import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface RowActionProps {
  onClick: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
  children: React.ReactNode;
}

function RowAction({
  onClick,
  variant = "default",
  disabled,
  children,
}: RowActionProps) {
  return (
    <DropdownMenuItem
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "cursor-pointer",
        variant === "destructive" && "text-destructive focus:text-destructive",
      )}
    >
      {children}
    </DropdownMenuItem>
  );
}

interface RowActionsProps {
  label: string;
  children: React.ReactNode;
}

function RowActions({ label, children }: RowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

export { RowActions, RowAction };
export type { RowActionsProps, RowActionProps };
