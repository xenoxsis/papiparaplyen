import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Use shadcn Input (default). Set to false for a raw <input> (matches existing chat search styling). */
  raw?: boolean;
  rawClassName?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Søg…",
  className = "",
  inputRef,
  raw = false,
  rawClassName,
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
      {raw ? (
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={
            rawClassName ??
            "w-full h-8 pl-9 pr-3 text-xs rounded-md border border-neutral-200 outline-none bg-transparent placeholder:text-neutral-400 focus:border-neutral-400 font-[inherit]"
          }
        />
      ) : (
        <Input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9 h-9"
        />
      )}
    </div>
  );
}
