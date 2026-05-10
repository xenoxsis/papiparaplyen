import { LogIn, Dices } from "lucide-react";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-neutral-900 text-white w-full">
      <div className="max-w-285 mx-auto px-4 sm:px-8 py-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div className="flex flex-row items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-white flex justify-center items-center p-1.5 shrink-0">
            <Dices className="size-7 text-neutral-900" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm">Pap i Paraplyen</span>
            <span className="text-white/60 text-xs">Brætspilsklub</span>
          </div>
        </div>

        <a
          href="https://www.facebook.com/groups/409372775159824"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors"
        >
          <svg
            className="size-4 shrink-0"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.884v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
          </svg>
          Mød os på Facebook
        </a>

        <Link
          href="/login"
          className="inline-flex items-center gap-2 bg-red-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
        >
          <LogIn className="size-4" />
          Member Login
        </Link>
      </div>

      <div className="border-t border-white/10" />

      <div className="max-w-285 mx-auto px-4 sm:px-8 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs text-white/60">
        <span>© 2026 Pap i Paraplyen. Alle rettigheder forbeholdes.</span>
        <Link
          href="/privacy"
          className="hover:text-white/90 transition-colors underline underline-offset-2"
        >
          Privatlivspolitik
        </Link>
      </div>
    </footer>
  );
}
