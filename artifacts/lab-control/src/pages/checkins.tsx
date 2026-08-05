import {
  getCheckinsQueryKey,
  useGetCheckins,
  screenshotFileUrl,
} from "@workspace/api-client-react";
import { UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

function Checkins() {
  const { data, isLoading } = useGetCheckins({
    query: {
      queryKey: getCheckinsQueryKey(),
      refetchInterval: 15_000,
    },
  });

  const checkins = data?.checkins ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Student check-ins</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign-ins submitted from each PC's check-in screen (name, phone, admission number, photo).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="size-4" />
            Check-in log
          </CardTitle>
          <CardDescription>
            Students must complete this form before using a PC and again after an administrator
            lock.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3 p-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : checkins.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <UserCheck className="size-5" />
                </EmptyMedia>
                <EmptyTitle>No check-ins yet</EmptyTitle>
                <EmptyDescription>
                  When a student signs in on a PC running the agent, it will appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Photo</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Admission / ID</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Computer</TableHead>
                  <TableHead>Signed in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checkins.map((checkin) => (
                  <TableRow key={checkin.id}>
                    <TableCell>
                      {checkin.photoFileId ? (
                        <a href={screenshotFileUrl(checkin.photoFileId)} target="_blank" rel="noreferrer">
                          <img
                            src={screenshotFileUrl(checkin.photoFileId)}
                            alt={`${checkin.studentName} photo`}
                            className="h-10 w-10 rounded-md border object-cover"
                          />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{checkin.studentName}</TableCell>
                    <TableCell className="tabular-nums">{checkin.phone}</TableCell>
                    <TableCell className="font-mono text-xs">{checkin.admissionNo}</TableCell>
                    <TableCell className="text-muted-foreground">{checkin.email || "—"}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {checkin.computerName}
                        <Badge variant="outline">{checkin.userName || "unknown user"}</Badge>
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDateTime(checkin.submittedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Checkins;
