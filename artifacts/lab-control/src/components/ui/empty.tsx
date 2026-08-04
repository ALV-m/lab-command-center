import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const emptyVariants = cva("py-16 px-6 text-center", {
  variants: {
    variant: {
      default: "border border-dashed rounded-lg",
      ghost: "",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

function Empty({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyVariants>) {
  return (
    <div
      className={cn(emptyVariants({ variant }), className)}
      {...props}
    />
  );
}

function EmptyHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col items-center gap-1", className)}
      {...props}
    />
  );
}

function EmptyMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4",
        className,
      )}
      {...props}
    />
  );
}

function EmptyTitle({
  className,
  ...props
}: React.ComponentProps<"h3">) {
  return (
    <h3
      className={cn("text-base font-medium", className)}
      {...props}
    />
  );
}

function EmptyDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-sm text-muted-foreground max-w-md", className)}
      {...props}
    />
  );
}

function EmptyContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-4 flex flex-col items-center gap-2", className)}
      {...props}
    />
  );
}

export {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
};
