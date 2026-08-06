import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  listUsersQueryKey,
  useCreateUser,
  useDeleteUser,
  useListUsers,
  useUpdateUser,
  type SubmenuKey,
  type UserAccount,
  type UserRole,
} from "@workspace/api-client-react";
import { Pencil, Plus, ShieldCheck, Trash2, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { ALL_SUBMENUS, SUBMENU_LABELS } from "@/lib/submenus";

function SubmenuPicker({
  value,
  onChange,
}: {
  value: SubmenuKey[];
  onChange: (next: SubmenuKey[]) => void;
}) {
  const toggle = (submenu: SubmenuKey) => {
    onChange(
      value.includes(submenu)
        ? value.filter((item) => item !== submenu)
        : [...value, submenu],
    );
  };

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {ALL_SUBMENUS.map((submenu) => (
        <label
          key={submenu}
          className="flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
        >
          {SUBMENU_LABELS[submenu]}
          <Switch
            checked={value.includes(submenu)}
            onCheckedChange={() => toggle(submenu)}
          />
        </label>
      ))}
    </div>
  );
}

const emptyRole: UserRole = "admin";

function UserFormDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserAccount | null;
}) {
  const queryClient = useQueryClient();
  const isCreate = user === null;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(emptyRole);
  const [submenuAccess, setSubmenuAccess] = useState<SubmenuKey[]>([]);

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: listUsersQueryKey() });
        toast.success("User created.");
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    },
  });

  const updateMutation = useUpdateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: listUsersQueryKey() });
        toast.success("User updated.");
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    },
  });

  const reset = (next: UserAccount | null) => {
    setUsername(next?.username ?? "");
    setPassword("");
    setRole(next?.role ?? emptyRole);
    setSubmenuAccess(next?.submenuAccess ?? []);
  };

  const submit = () => {
    if (isCreate) {
      if (!username.trim()) {
        toast.error("Enter a username.");
        return;
      }
      if (password.length < 6) {
        toast.error("Password must be at least 6 characters.");
        return;
      }
      if (submenuAccess.length === 0) {
        toast.error("Grant at least one section.");
        return;
      }
      createMutation.mutate({
        data: {
          username: username.trim(),
          password,
          role,
          submenuAccess,
        },
      });
      return;
    }

    if (submenuAccess.length === 0) {
      toast.error("Grant at least one section.");
      return;
    }
    updateMutation.mutate({
      userId: user!.id,
      data: {
        ...(password ? { password } : {}),
        role,
        submenuAccess,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (next) reset(user);
      onOpenChange(next);
    }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "Add user" : `Edit ${user?.username ?? "user"}`}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? "Create a dashboard account and pick which sections it can access."
              : "Update the account role, sections, or password."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-username">Username</Label>
            <Input
              id="user-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={!isCreate}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-password">
              {isCreate ? "Password" : "New password (optional)"}
            </Label>
            <Input
              id="user-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              placeholder={isCreate ? "" : "Leave blank to keep current password"}
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Section access</Label>
            <SubmenuPicker value={submenuAccess} onChange={setSubmenuAccess} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {createMutation.isPending || updateMutation.isPending ? (
              <Spinner className="size-4" />
            ) : null}
            {isCreate ? "Create user" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserAccount | null;
}) {
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: listUsersQueryKey() });
        toast.success("User deleted.");
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete user</DialogTitle>
          <DialogDescription>
            Remove {user?.username}? They will no longer be able to sign in to
            the dashboard.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              user && deleteMutation.mutate({ userId: user.id })
            }
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? <Spinner className="size-4" /> : <Trash2 className="size-4" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsersPage() {
  const { user: currentUser } = useAuth();
  const { data, isLoading } = useListUsers();
  const users = data?.users ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [deleting, setDeleting] = useState<UserAccount | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dashboard accounts and their section access. Super admins can access
            everything.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add user
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            Accounts
          </CardTitle>
          <CardDescription>
            {users.length} account{users.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : users.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <UsersIcon className="size-6" />
                </EmptyMedia>
                <EmptyTitle>No users yet</EmptyTitle>
                <EmptyDescription>
                  Add your first dashboard account to get started.
                </EmptyDescription>
                <EmptyContent>
                  <Button
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    <Plus className="size-4" />
                    Add user
                  </Button>
                </EmptyContent>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sections</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.username}
                      {currentUser?.id === user.id ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (you)
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          user.role === "super_admin" ? "success" : "secondary"
                        }
                      >
                        {user.role === "super_admin" ? "Super Admin" : "Admin"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal">
                      {user.submenuAccess
                        .map((submenu) => SUBMENU_LABELS[submenu])
                        .join(", ")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(user);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={currentUser?.id === user.id}
                          onClick={() => setDeleting(user)}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        user={editing}
      />
      <DeleteUserDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        user={deleting}
      />
    </div>
  );
}

export default UsersPage;
