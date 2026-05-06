import { Mail, LogIn, Dices } from "lucide-react";
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

        <div className="flex items-center gap-2 text-sm text-white/80">
          <Mail className="size-4" />
          kontakt@papiparaplyen.dk
        </div>

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
        <span>© 2025 Pap i Paraplyen. Alle rettigheder forbeholdes.</span>
        <div className="flex flex-row gap-4">
          <a href="#" className="hover:text-white transition-colors">
            Privatlivspolitik
          </a>
          <a href="#" className="hover:text-white transition-colors">
            Vedtægter
          </a>
        </div>
      </div>
    </footer>
  );
}
