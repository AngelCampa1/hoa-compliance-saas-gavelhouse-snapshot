import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { getFieldHelp, getPageHelpForRoute, roleCan } from "@boardstack/shared";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth";
import { api } from "@/lib/api";
import { trackDashboardEvent } from "@/lib/analytics";
import { reportUserFacingError } from "@/lib/sentry";
import { useCommunity } from "@/lib/community-context";
import { qk } from "@/lib/query-keys";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { HelpCallout } from "@/components/help/HelpCallout";
import { HelpHint } from "@/components/help/HelpHint";
import { PageHelpPanel } from "@/components/help/PageHelpPanel";
import { StateSelect } from "@/components/ui/state-select";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

const communitySchema = z.object({
  name: z.string().max(256).optional(),
  state: z
    .string()
    .refine(
      (v) => v === "" || /^[A-Z]{2}$/.test(v),
      "Use a 2-letter state code",
    )
    .optional(),
});

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["admin", "treasurer", "secretary", "viewer"]),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
const deleteAccountSchema = z.object({
  password: z.string().optional(),
  confirmation: z.literal("DELETE", {
    errorMap: () => ({ message: "Type DELETE to confirm account deletion" }),
  }),
});

type CommunityFormValues = z.infer<typeof communitySchema>;
type InviteFormValues = z.infer<typeof inviteSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;
type DeleteAccountFormValues = z.infer<typeof deleteAccountSchema>;

function SettingsPage() {
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCommunityId, selectedCommunityRole } = useCommunity();
  const canUpdateCommunity =
    selectedCommunityRole == null ||
    roleCan(selectedCommunityRole as never, "community:update");
  const canInviteMembers =
    selectedCommunityRole == null ||
    roleCan(selectedCommunityRole as never, "member:invite");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: communitiesData, isError } = useQuery({
    queryKey: qk.communities.list(),
    queryFn: () => api.communities.list(),
    enabled: !!session,
  });

  const currentCommunity =
    communitiesData?.communities.find(
      (c) => c.community.id === selectedCommunityId,
    )?.community ??
    communitiesData?.communities[0]?.community ??
    null;
  const currentCommunityId = currentCommunity?.id ?? null;
  const inviteUrl = inviteToken
    ? `${window.location.origin}/invitations/${inviteToken}/accept`
    : null;

  const user = session?.user;
  const pageHelp = getPageHelpForRoute("/settings");

  const communityForm = useForm<CommunityFormValues>({
    resolver: zodResolver(communitySchema),
    defaultValues: {
      name: "",
      state: "",
    },
  });

  useEffect(() => {
    communityForm.reset({
      name: currentCommunity?.name ?? "",
      state: currentCommunity?.state ?? "",
    });
  }, [
    currentCommunity?.id,
    currentCommunity?.name,
    currentCommunity?.state,
    communityForm,
  ]);

  useEffect(() => {
    setInviteToken(null);
  }, [currentCommunityId]);

  const inviteForm = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "treasurer" },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });
  const deleteAccountForm = useForm<DeleteAccountFormValues>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: {
      password: "",
      confirmation: "" as DeleteAccountFormValues["confirmation"],
    },
  });

  const inviteMutation = useMutation({
    mutationFn: (values: InviteFormValues) => {
      if (!currentCommunityId) throw new Error("No community selected.");
      return api.communities.invite(
        currentCommunityId,
        values.email,
        values.role,
      );
    },
    onSuccess: ({ token }, values) => {
      setInviteToken(token);
      inviteForm.reset({ email: "", role: values.role });
      toast.success("Invitation created.");
    },
    onError: (err) => {
      toast.error(
        reportUserFacingError(
          err,
          "We could not send this invitation. Please try again.",
          { tags: { source: "settings-invite" } },
        ),
      );
    },
  });

  const saveMutation = useMutation({
    mutationFn: (values: CommunityFormValues) =>
      api.communities.setup({
        communityId: currentCommunityId ?? undefined,
        name: values.name || undefined,
        state: values.state || undefined,
      }),
    onSuccess: (_data, values) => {
      if (currentCommunityId) {
        trackDashboardEvent("community_settings_updated", {
          changed_name: (values.name ?? "") !== (currentCommunity?.name ?? ""),
          changed_state:
            (values.state ?? "") !== (currentCommunity?.state ?? ""),
          community_id: currentCommunityId,
        });
      }
      toast.success("Settings saved.");
      void queryClient.invalidateQueries({ queryKey: qk.communities.list() });
    },
    onError: (err, values) => {
      if (currentCommunityId) {
        trackDashboardEvent("community_settings_update_failed", {
          changed_name: (values.name ?? "") !== (currentCommunity?.name ?? ""),
          changed_state:
            (values.state ?? "") !== (currentCommunity?.state ?? ""),
          community_id: currentCommunityId,
          failure_type: "api_error",
        });
      }
      toast.error(
        reportUserFacingError(
          err,
          "We could not save your settings. Please try again.",
          { tags: { source: "settings-save" } },
        ),
      );
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (values: PasswordFormValues) =>
      authClient.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        revokeOtherSessions: true,
      }),
    onSuccess: () => {
      trackDashboardEvent("account_password_changed", {
        source: "settings",
      });
      toast.success("Password updated.");
      passwordForm.reset();
    },
    onError: (err) => {
      trackDashboardEvent("account_password_change_failed", {
        failure_type: "api_error",
        source: "settings",
      });
      passwordForm.setError("currentPassword", {
        message: reportUserFacingError(
          err,
          "We could not change your password. Please try again.",
          { tags: { source: "settings-password" } },
        ),
      });
    },
  });
  const deleteAccountMutation = useMutation({
    mutationFn: async (values: DeleteAccountFormValues) => {
      const password = values.password?.trim();
      trackDashboardEvent("account_deletion_requested", {
        credential_provided: Boolean(password && password.length > 0),
        source: "settings",
      });
      const result =
        password && password.length > 0
          ? await authClient.deleteUser({ password })
          : await authClient.deleteUser();
      if (result.error) {
        throw new Error(result.error.message ?? "Failed to delete account.");
      }
    },
    onSuccess: () => {
      trackDashboardEvent("account_deletion_completed", {
        source: "settings",
      });
      toast.success("Account deleted.");
      void queryClient.clear();
      void navigate({ to: "/login", replace: true });
    },
    onError: (err) => {
      trackDashboardEvent("account_deletion_failed", {
        failure_type: "api_error",
        source: "settings",
      });
      deleteAccountForm.setError("root", {
        message: reportUserFacingError(
          err,
          "We could not delete your account. Please try again.",
          { tags: { source: "settings-delete-account" } },
        ),
      });
      toast.error(
        reportUserFacingError(
          err,
          "We could not delete your account. Please try again.",
          { tags: { source: "settings-delete-account" } },
        ),
      );
    },
  });

  function handleCopyInviteUrl() {
    if (!inviteUrl) return;
    void navigator.clipboard
      .writeText(inviteUrl)
      .then(() => {
        if (currentCommunityId) {
          trackDashboardEvent("member_invite_link_copied", {
            community_id: currentCommunityId,
            role: inviteForm.getValues("role"),
            source: "settings",
          });
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        toast.error("Failed to copy link.");
      });
  }

  return (
    <PageContainer variant="form" className="space-y-6">
      <PageHeader title="Settings" />
      <HelpCallout topic="settings" />
      {pageHelp && <PageHelpPanel help={pageHelp} />}

      <Form {...communityForm}>
        <form
          onSubmit={communityForm.handleSubmit((v) => {
            if (!currentCommunityId) {
              return;
            }
            saveMutation.mutate(v);
          })}
        >
          <Card>
            <CardHeader>
              <CardTitle>Community</CardTitle>
              <CardDescription>Basic info for this community.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isError && !currentCommunity && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>
                    We could not load your community settings. Refresh the page
                    to try again.
                  </AlertDescription>
                </Alert>
              )}
              <FormField
                control={communityForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-1">
                      <FormLabel>Community name</FormLabel>
                      {getFieldHelp("community.name") && (
                        <HelpHint help={getFieldHelp("community.name")!} />
                      )}
                    </div>
                    <FormControl>
                      <Input placeholder="Enter community name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={communityForm.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-1">
                      <FormLabel>State</FormLabel>
                      {getFieldHelp("community.state") && (
                        <HelpHint help={getFieldHelp("community.state")!} />
                      )}
                    </div>
                    <FormControl>
                      <StateSelect
                        value={field.value ?? ""}
                        onValueChange={field.onChange}
                        aria-label="Community state"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="mt-4 flex justify-end">
            <Button
              type="submit"
              disabled={
                saveMutation.isPending ||
                !currentCommunityId ||
                !canUpdateCommunity
              }
            >
              {saveMutation.isPending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </form>
      </Form>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your login email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label
              className="text-sm font-medium leading-none"
              htmlFor="user-email"
            >
              Email
            </label>
            <Input
              id="user-email"
              type="email"
              value={user?.email ?? ""}
              readOnly
              className="cursor-default bg-muted"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Set a new password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...passwordForm}>
            <form
              onSubmit={passwordForm.handleSubmit((v) =>
                passwordMutation.mutate(v),
              )}
              className="space-y-4"
            >
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm new password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={passwordMutation.isPending}>
                  {passwordMutation.isPending ? "Updating…" : "Update password"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delete Account</CardTitle>
          <CardDescription>
            This permanently deletes your login, sessions, and saved data.
            Transfer or close any communities and portfolios you own first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...deleteAccountForm}>
            <form
              onSubmit={deleteAccountForm.handleSubmit((v) =>
                deleteAccountMutation.mutate(v),
              )}
              className="space-y-4"
            >
              <FormField
                control={deleteAccountForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        placeholder="Required for password accounts"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={deleteAccountForm.control}
                name="confirmation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type DELETE to confirm</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {deleteAccountForm.formState.errors.root?.message && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {deleteAccountForm.formState.errors.root.message}
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={deleteAccountMutation.isPending}
                >
                  {deleteAccountMutation.isPending
                    ? "Deleting…"
                    : "Delete account"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {canInviteMembers && (
        <Card>
          <CardHeader>
            <CardTitle>Invite Member</CardTitle>
            <CardDescription>
              Add a board member or viewer to this community.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Form {...inviteForm}>
              <form
                onSubmit={inviteForm.handleSubmit((v) =>
                  inviteMutation.mutate(v),
                )}
                className="space-y-4"
              >
                <FormField
                  control={inviteForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email address</FormLabel>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="member@example.com"
                            className="min-w-0 flex-1"
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              setInviteToken(null);
                            }}
                          />
                        </FormControl>
                        <FormField
                          control={inviteForm.control}
                          name="role"
                          render={({ field: roleField }) => (
                            <FormItem className="space-y-0">
                              <FormLabel className="sr-only">Role</FormLabel>
                              <Select
                                value={roleField.value}
                                onValueChange={(value) => {
                                  roleField.onChange(value);
                                  setInviteToken(null);
                                }}
                              >
                                <div className="flex min-w-0 items-center gap-1">
                                  <FormControl>
                                    <SelectTrigger
                                      className="w-full sm:w-36"
                                      aria-label="Invitation role"
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  {getFieldHelp("invite.role") && (
                                    <HelpHint
                                      help={getFieldHelp("invite.role")!}
                                    />
                                  )}
                                </div>
                                <SelectContent>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="treasurer">
                                    Treasurer
                                  </SelectItem>
                                  <SelectItem value="secretary">
                                    Secretary
                                  </SelectItem>
                                  <SelectItem value="viewer">Viewer</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                        <Button
                          type="submit"
                          className="w-full sm:w-auto"
                          disabled={
                            inviteMutation.isPending || !currentCommunityId
                          }
                        >
                          {inviteMutation.isPending ? "Inviting…" : "Invite"}
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
            {inviteUrl && (
              <div className="space-y-2 rounded-md bg-muted p-3">
                <p className="text-sm font-medium">Invitation created.</p>
                <div className="flex items-center gap-2">
                  <span
                    className="min-w-0 flex-1 overflow-hidden text-ellipsis break-all font-mono text-xs"
                    aria-label="Invitation URL"
                  >
                    {inviteUrl}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={handleCopyInviteUrl}
                  >
                    {copied ? "Copied!" : "Copy link"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
