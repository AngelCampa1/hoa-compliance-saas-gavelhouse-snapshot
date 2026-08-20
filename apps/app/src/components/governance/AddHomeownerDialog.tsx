import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { addHomeownerInput } from "@boardstack/shared";
import { api, ApiError } from "@/lib/api";
import { reportUserFacingError } from "@/lib/sentry";
import { trackDashboardEvent } from "@/lib/analytics";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Form-level schema: accepts empty strings for optional fields (HTML inputs always
// produce strings). Empty strings are stripped to undefined before sending to API.
const formSchema = addHomeownerInput.extend({
  unitNumber: z.string().optional(),
  phone: z.string().optional(),
  moveInDate: z
    .union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "moveInDate must be YYYY-MM-DD"),
      z.literal(""),
    ])
    .optional(),
});

type FormValues = z.infer<typeof formSchema>;

export interface AddHomeownerDialogProps {
  communityId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddHomeownerDialog({
  communityId,
  open,
  onOpenChange,
  onSuccess,
}: AddHomeownerDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      unitNumber: "",
      phone: "",
      moveInDate: "",
    },
  });

  useEffect(() => {
    if (!open) form.reset();
  }, [open, form]);

  async function onSubmit(values: FormValues) {
    // Strip empty optional strings — send undefined to the API
    const payload = {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      ...(values.unitNumber ? { unitNumber: values.unitNumber } : {}),
      ...(values.phone ? { phone: values.phone } : {}),
      ...(values.moveInDate ? { moveInDate: values.moveInDate } : {}),
    };

    try {
      await api.governance.homeowners.add(communityId, payload);
      trackDashboardEvent("governance_item_created", {
        community_id: communityId,
        has_move_in_date: Boolean(payload.moveInDate),
        has_phone: Boolean(payload.phone),
        has_unit_number: Boolean(payload.unitNumber),
        item_type: "homeowner",
      });
      toast.success("Homeowner added.");
      form.reset();
      onSuccess();
    } catch (err) {
      const message = reportUserFacingError(
        err,
        "We could not add this homeowner. Please try again.",
        { tags: { source: "add-homeowner" } },
      );

      // 409 conflict: use ApiError status code for reliable detection.
      const isConflict = err instanceof ApiError && err.status === 409;

      if (isConflict) {
        form.setError("email", { message });
        return;
      }

      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Homeowner</DialogTitle>
          <DialogDescription>
            Add contact and unit details for a homeowner in your community.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            className="space-y-4"
            noValidate
          >
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Smith" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="jane.smith@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="unitNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit Number</FormLabel>
                  <FormControl>
                    <Input placeholder="101 (optional)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="555-0101 (optional)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="moveInDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Move-In Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
