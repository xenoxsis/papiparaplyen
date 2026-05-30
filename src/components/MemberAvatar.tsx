import Image from "next/image";

interface MemberAvatarProps {
  initials: string;
  /** "sm" = w-6 h-6, "md" = w-9 h-9 (default), "lg" = w-16 h-16 */
  size?: "sm" | "md" | "lg";
  /** Tailwind background class. Defaults to "bg-brand-red". */
  colorClass?: string;
  className?: string;
  /** When provided (and hasAvatar is true), renders the member's photo instead of initials. */
  memberId?: number;
  hasAvatar?: boolean;
  /** Cache-bust key (e.g. timestamp) so the image refreshes after upload. */
  avatarVersion?: number;
}

const sizeClasses = {
  sm: "w-6 h-6 text-[0.55rem]",
  md: "w-9 h-9 text-[0.65rem]",
  lg: "w-16 h-16 text-lg",
};

const sizePx = { sm: 24, md: 36, lg: 64 };

export function MemberAvatar({
  initials,
  size = "md",
  colorClass = "bg-brand-red",
  className = "",
  memberId,
  hasAvatar,
  avatarVersion,
}: MemberAvatarProps) {
  if (hasAvatar && memberId != null) {
    const version = avatarVersion ?? 0;
    const src = `/api/members/${memberId}/avatar${version ? `?v=${version}` : ""}`;
    const px = sizePx[size];
    return (
      <Image
        src={src}
        alt={initials}
        width={px}
        height={px}
        unoptimized
        className={`rounded-full object-cover shrink-0 ${sizeClasses[size].replace(/text-[^\s]+/, "").trim()} ${className}`}
        style={{ width: px, height: px }}
      />
    );
  }

  return (
    <div
      className={`rounded-full text-white flex items-center justify-center font-bold select-none shrink-0 ${colorClass} ${sizeClasses[size]} ${className}`}
    >
      {initials}
    </div>
  );
}
