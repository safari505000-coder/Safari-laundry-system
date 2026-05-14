/**
 * مكون هيكل التحميل — مستطيل متحرك يُستخدم كبديل للمحتوى أثناء التحميل.
 * Skeleton component — animated pulsing placeholder used while content is loading.
 */
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
