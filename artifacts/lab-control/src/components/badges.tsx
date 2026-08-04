import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import type {
  ComputerStatus,
  ComputerUsbState,
  LabAlertSeverity,
  LabAlertStatus,
  StudentSessionStatus,
} from "@workspace/api-client-react";

type BadgeProps = ComponentProps<typeof Badge>;

const STATUS_VARIANT: Record<ComputerStatus, BadgeProps["variant"]> = {
  online: "success",
  offline: "secondary",
  warning: "warning",
  locked: "destructive",
};

const USB_VARIANT: Record<ComputerUsbState, BadgeProps["variant"]> = {
  allowed: "success",
  blocked: "destructive",
  review: "warning",
};

const SEVERITY_VARIANT: Record<LabAlertSeverity, BadgeProps["variant"]> = {
  critical: "destructive",
  warning: "warning",
  info: "info",
};

const ALERT_STATUS_VARIANT: Record<LabAlertStatus, BadgeProps["variant"]> = {
  open: "warning",
  acknowledged: "info",
  resolved: "success",
};

const SESSION_STATUS_VARIANT: Record<StudentSessionStatus, BadgeProps["variant"]> = {
  active: "success",
  ended: "secondary",
};

export function StatusBadge({ status }: { status: ComputerStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}

export function UsbBadge({ state }: { state: ComputerUsbState }) {
  return <Badge variant={USB_VARIANT[state]}>{state}</Badge>;
}

export function SeverityBadge({ severity }: { severity: LabAlertSeverity }) {
  return <Badge variant={SEVERITY_VARIANT[severity]}>{severity}</Badge>;
}

export function AlertStatusBadge({ status }: { status: LabAlertStatus }) {
  return <Badge variant={ALERT_STATUS_VARIANT[status]}>{status}</Badge>;
}

export function SessionStatusBadge({ status }: { status: StudentSessionStatus }) {
  return <Badge variant={SESSION_STATUS_VARIANT[status]}>{status}</Badge>;
}
