interface MemberAvatarProps {
  initials: string;
  /** "sm" = w-6 h-6, "md" = w-9 h-9 (default), "lg" = w-16 h-16 */
  size?: "sm" | "md" | "lg";
  /** Tailwind background class. Defaults to "bg-brand-red". */
  colorClass?: string;
  className?: string;
}

const sizeClasses = {
  sm: "w-6 h-6 text-[0.55rem]",
  md: "w-9 h-9 text-[0.65rem]",
  lg: "w-16 h-16 text-lg",
};

export function MemberAvatar({
  initials,
  size = "md",
  colorClass = "bg-brand-red",
  className = "",
}: MemberAvatarProps) {
  return (
    <div
      className={`rounded-full text-white flex items-center justify-center font-bold select-none shrink-0 ${colorClass} ${sizeClasses[size]} ${className}`}
    >
      {initials}
    </div>
  );
}
