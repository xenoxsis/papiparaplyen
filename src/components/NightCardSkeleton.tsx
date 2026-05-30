import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface NightCardSkeletonProps {
  variant?: "card" | "row";
}

export function NightCardSkeleton({
  variant = "card",
}: NightCardSkeletonProps) {
  if (variant === "row") {
    return (
      <div className="flex items-center gap-4 bg-white dark:bg-neutral-900 border dark:border-neutral-700 rounded-xl px-4 py-3">
        {/* Date badge */}
        <Skeleton className="w-12 h-14 rounded-lg shrink-0" />
        {/* Title + meta */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <Skeleton className="h-4 w-40 rounded" />
          <Skeleton className="h-3 w-28 rounded" />
        </div>
        {/* Badge area */}
        <Skeleton className="h-5 w-20 rounded-full shrink-0" />
      </div>
    );
  }

  return (
    <Card className="overflow-hidden border shadow-sm">
      <CardHeader className="p-0">
        <Skeleton className="h-24 w-full rounded-none" />
      </CardHeader>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-3/4 rounded" />
          <Skeleton className="h-3 w-1/2 rounded" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-32 rounded" />
          <Skeleton className="h-3 w-24 rounded" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}
