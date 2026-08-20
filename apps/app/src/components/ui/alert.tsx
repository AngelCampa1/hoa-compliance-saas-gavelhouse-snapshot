import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Info, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-3.5 [&>svg+div]:translate-y-[-3px] [&:has(svg)]:pl-11",
  {
    variants: {
      variant: {
        default:
          "bg-background text-foreground border-border [&>svg]:text-foreground",
        info: "bg-info/10 text-info border-info/30 [&>svg]:text-info",
        success:
          "bg-success/10 text-success border-success/30 [&>svg]:text-success",
        // warning uses foreground token — amber lacks AA contrast as body text on light tints
        warning:
          "bg-warning/15 text-warning-foreground border-warning/40 [&>svg]:text-warning",
        destructive:
          "bg-destructive/10 text-destructive border-destructive/30 [&>svg]:text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const variantIconMap = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: XCircle,
} as const;

export interface AlertProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  /** Override the default icon for this variant. Pass null to suppress the icon. */
  icon?: React.ReactNode | null;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, icon, children, ...props }, ref) => {
    const resolvedVariant = variant ?? "default";
    const IconComponent = variantIconMap[resolvedVariant];
    const renderedIcon =
      icon === null ? null : icon !== undefined ? (
        icon
      ) : (
        <IconComponent className="h-4 w-4" aria-hidden="true" />
      );

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        {renderedIcon}
        {children}
      </div>
    );
  },
);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
