interface DateBadgeProps {
  /** ISO date string (YYYY-MM-DD) or Date object */
  date: string | Date;
  /** Tailwind background class, e.g. "bg-brand-red". Defaults to "bg-brand-red". */
  colorClass?: string;
  /** Size variant — "md" (default) renders w-14 h-14, "sm" renders w-10 h-10 */
  size?: "sm" | "md";
}

export function DateBadge({
  date,
  colorClass = "bg-brand-red",
  size = "md",
}: DateBadgeProps) {
  const d = typeof date === "string" ? new Date(date) : date;

  const weekday = d.toLocaleDateString("da-DK", { weekday: "short" });
  const day = d.getDate();
  const month = d.toLocaleDateString("da-DK", { month: "short" });

  const sizeClass = size === "sm" ? "w-10 h-10" : "w-14 h-14";
  const dayClass = size === "sm" ? "text-base" : "text-lg";

  return (
    <div
      className={`rounded-lg text-white flex flex-col justify-center items-center shrink-0 ${colorClass} ${sizeClass}`}
    >
      <span className="font-medium uppercase text-[0.55rem] leading-none">
        {weekday}
      </span>
      <span className={`font-bold leading-tight ${dayClass}`}>{day}</span>
      <span className="font-medium uppercase text-[0.55rem] leading-none opacity-80">
        {month}
      </span>
    </div>
  );
}
