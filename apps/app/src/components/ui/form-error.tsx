import { cn } from "@/lib/utils";

interface FormErrorProps {
  message?: string;
  className?: string;
}

function FormError({ message, className }: FormErrorProps) {
  if (!message) return null;
  return (
    <p role="alert" className={cn("text-sm text-destructive", className)}>
      {message}
    </p>
  );
}

export { FormError };
export type { FormErrorProps };
