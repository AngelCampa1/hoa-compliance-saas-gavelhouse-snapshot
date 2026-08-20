import * as React from "react";
import { cn } from "@/lib/utils";

type PageContainerVariant = "form" | "data" | "report";

interface PageContainerProps {
  variant?: PageContainerVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<PageContainerVariant, string> = {
  form: "max-w-2xl",
  data: "w-full",
  report: "max-w-5xl",
};

function PageContainer({
  variant = "data",
  children,
  className,
}: PageContainerProps) {
  return (
    <div className={cn("space-y-6", variantClasses[variant], className)}>
      {children}
    </div>
  );
}

export { PageContainer };
export type { PageContainerProps, PageContainerVariant };
