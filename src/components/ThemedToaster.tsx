"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/lib/theme-context";

export function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster position="bottom-right" richColors theme={resolvedTheme} />;
}
