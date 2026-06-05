"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Check, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getIcalToken, postIcalToken, deleteIcalToken } from "@/lib/api";

export function IcalCard() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getIcalToken()
      .then((r) => setToken(r.token))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const feedUrl = token
    ? `${origin}/api/club-nights/ical/me?token=${token}`
    : null;

  const isAndroid =
    typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

  // Android doesn't handle webcal:// — use Google Calendar's subscription URL instead.
  const webcalUrl = feedUrl
    ? isAndroid
      ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent("Esbjerg Brætspil - Vagter")}`
      : feedUrl.replace(/^https?/, "webcal")
    : null;

  async function generate() {
    setLoading(true);
    try {
      const result = await postIcalToken();
      setToken(result.token);
    } catch {
      toast.error("Noget gik galt. Prøv igen.");
    } finally {
      setLoading(false);
    }
  }

  async function revoke() {
    setRevoking(true);
    try {
      await deleteIcalToken();
      setToken(null);
    } catch {
      toast.error("Noget gik galt. Prøv igen.");
    } finally {
      setRevoking(false);
    }
  }

  async function copy() {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="p-6 gap-4 flex flex-col">
      <CardHeader className="p-0 gap-1 flex flex-col">
        <div className="flex items-center gap-2">
          <CalendarPlus className="size-5 text-brand-teal" />
          <CardTitle className="text-base leading-6">
            Mine vagter · iCal
          </CardTitle>
        </div>
        <p className="text-xs text-neutral-500">
          Abonnér på dine tildelte vagter i din kalender. Linket opdateres
          automatisk når vagtplanen ændres.
        </p>
      </CardHeader>

      <CardContent className="p-0 flex flex-col gap-3">
        {loading ? (
          <div className="h-9 w-40 rounded-md bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
        ) : !token ? (
          <Button
            variant="outline"
            className="gap-2 self-start text-sm"
            onClick={generate}
            disabled={loading}
          >
            <CalendarPlus className="size-4" />
            Generér kalenderlink
          </Button>
        ) : (
          <>
            {/* Feed URL row */}
            <div className="flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-2">
              <span className="text-xs text-neutral-600 dark:text-neutral-300 font-mono flex-1 truncate">
                {feedUrl}
              </span>
              <button
                onClick={copy}
                title="Kopiér link"
                className="shrink-0 text-neutral-400 hover:text-neutral-700 transition-colors"
              >
                {copied ? (
                  <Check className="size-4 text-brand-teal" />
                ) : (
                  <Copy className="size-4" />
                )}
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 flex-wrap">
              {!isAndroid && (
                <a
                  href={webcalUrl!}
                  className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 border border-brand-teal text-brand-teal hover:bg-brand-teal/10 transition-colors"
                >
                  <CalendarPlus className="size-3.5" />
                  Åbn i kalender
                </a>
              )}
              <button
                onClick={revoke}
                disabled={revoking}
                className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-brand-red transition-colors underline underline-offset-2 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className="size-3" />
                {revoking ? "Tilbagekalder…" : "Tilbagekald link"}
              </button>
            </div>

            {/* Security notice */}
            <p className="text-[10px] text-neutral-400 leading-4">
              ⚠️ Del ikke dette link — det giver adgang til dine vagter uden
              login. Brug &quot;Tilbagekald link&quot; for at ugyldiggøre det.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
