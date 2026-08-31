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

  // Padding shrinks the content box (border-box), so the "tors."/"sep."
  // abbreviations keep a margin from the edges instead of hugging them.
  const sizeClass = size === "sm" ? "w-10 h-10 p-1" : "w-14 h-14 px-1.5 py-1";
  const dayClass = size === "sm" ? "text-base" : "text-lg";
  const labelClass = size === "sm" ? "text-[0.5rem]" : "text-[0.55rem]";

  return (
    <div
      className={`rounded-lg text-white flex flex-col justify-center items-center shrink-0 ${colorClass} ${sizeClass}`}
    >
      <span
        className={`font-medium uppercase leading-none whitespace-nowrap ${labelClass}`}
      >
        {weekday}
      </span>
      <span className={`font-bold leading-tight ${dayClass}`}>{day}</span>
      <span
        className={`font-medium uppercase leading-none whitespace-nowrap opacity-80 ${labelClass}`}
      >
        {month}
      </span>
    </div>
  );
}
