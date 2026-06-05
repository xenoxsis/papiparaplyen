"use client";

import { useState } from "react";
import {
  GripVertical,
  Search,
  Users,
  Wand2,
  Ghost,
  Settings,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ApiMember } from "@/lib/api";

interface VagterPanelProps {
  vagter: ApiMember[];
  draggingMemberId: number | null;
  saving: boolean;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  onAutoAssign: () => void;
  onOpenAutoAssignSettings: () => void;
  /** "vertical" (default) is the sidebar layout; "horizontal" is a wrappable
   *  chip row for the calendar's top strip on lg screens. */
  orientation?: "vertical" | "horizontal";
  /** Tailwind classes overriding the outer Card wrapper visibility. */
  className?: string;
}

export function VagterPanel({
  vagter,
  draggingMemberId,
  saving,
  onDragStart,
  onDragEnd,
  onAutoAssign,
  onOpenAutoAssignSettings,
  orientation = "vertical",
  className,
}: VagterPanelProps) {
  const [memberSearch, setMemberSearch] = useState("");

  const filteredVagter = vagter.filter((m) =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase()),
  );

  const horizontal = orientation === "horizontal";

  return (
    <Card
      className={
        className ??
        (horizontal
          ? "border-l-4 border-l-brand-red p-4 gap-3 flex flex-col print:hidden"
          : "border-l-4 border-l-brand-red p-6 gap-4 hidden md:flex flex-col flex-1 min-h-0")
      }
    >
      <CardHeader className="p-0 gap-2 flex flex-col">
        <div className="flex items-center gap-2 flex-wrap">
          <Users className="size-5 text-brand-red" />
          <CardTitle className="text-base leading-6">Vagter</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {vagter.length}
          </Badge>
          {horizontal && (
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-400"
                onClick={onAutoAssign}
                disabled={saving}
              >
                <Wand2 className="size-4" />
                Auto-tildel
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 px-2 border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-400"
                onClick={onOpenAutoAssignSettings}
                disabled={saving}
                aria-label="Auto-tildel indstillinger"
                title="Auto-tildel indstillinger"
              >
                <Settings className="size-4" />
              </Button>
            </div>
          )}
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Træk en person til en klubaften for at tildele
        </p>
      </CardHeader>
      <CardContent
        className={
          horizontal
            ? "flex p-0 gap-2 items-start"
            : "flex p-0 flex-col gap-2 flex-1 min-h-0"
        }
      >
        {!horizontal && (
          <div className="relative">
            <Search className="size-4 top-1/2 -translate-y-1/2 text-neutral-500 dark:text-neutral-400 absolute left-3" />
            <Input
              aria-label="Søg vagt"
              placeholder="Søg vagt…"
              className="pl-9 h-9"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />
          </div>
        )}
        <div
          className={
            horizontal
              ? "flex flex-wrap gap-2 flex-1"
              : "flex flex-col gap-1 overflow-y-auto flex-1 min-h-0"
          }
        >
          {filteredVagter.map((m) => (
            <div
              key={m.id}
              draggable
              onDragStart={() => onDragStart(m.id)}
              onDragEnd={onDragEnd}
              className={
                horizontal
                  ? `select-none cursor-grab active:cursor-grabbing rounded-full flex pl-1 pr-3 py-1 items-center gap-2 border transition-colors ${
                      draggingMemberId === m.id
                        ? "opacity-50 border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800"
                        : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-neutral-400"
                    }`
                  : `select-none cursor-grab active:cursor-grabbing rounded-md flex p-2 items-center gap-3 border transition-colors ${
                      draggingMemberId === m.id
                        ? "opacity-50 border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800"
                        : "border-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-neutral-200 dark:hover:border-neutral-700"
                    }`
              }
            >
              {!horizontal && (
                <GripVertical className="hidden sm:block size-4 text-neutral-300 shrink-0" />
              )}
              <div
                className={`${horizontal ? "w-7 h-7 text-[0.55rem]" : "w-9 h-9 text-[0.65rem]"} rounded-full text-white flex items-center justify-center font-bold select-none shrink-0 ${m.is_virtual ? "bg-brand-teal/40 border-2 border-dashed border-brand-teal" : "bg-brand-red"}`}
              >
                {m.is_virtual ? (
                  <Ghost
                    className={horizontal ? "size-3 text-brand-teal" : "size-4 text-brand-teal"}
                  />
                ) : (
                  m.initials
                )}
              </div>
              {horizontal ? (
                <span className="text-xs font-medium leading-4 truncate">
                  {m.name}
                </span>
              ) : (
                <div className="flex flex-col min-w-0">
                  <span className="truncate text-sm font-medium leading-5">
                    {m.name}
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    {m.is_virtual ? "Virtuel vagt" : "Vagt"}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
        {!horizontal && (
          <div className="mt-2 flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2 border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-400"
              onClick={onAutoAssign}
              disabled={saving}
            >
              <Wand2 className="size-4" />
              Auto-tildel vagter
            </Button>
            <Button
              variant="outline"
              className="shrink-0 px-2 border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-400"
              onClick={onOpenAutoAssignSettings}
              disabled={saving}
              aria-label="Auto-tildel indstillinger"
              title="Auto-tildel indstillinger"
            >
              <Settings className="size-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
