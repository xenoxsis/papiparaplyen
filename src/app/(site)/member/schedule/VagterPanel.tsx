"use client";

import { useState } from "react";
import { GripVertical, Search, Users, Wand2 } from "lucide-react";
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
}

export function VagterPanel({
  vagter,
  draggingMemberId,
  saving,
  onDragStart,
  onDragEnd,
  onAutoAssign,
}: VagterPanelProps) {
  const [memberSearch, setMemberSearch] = useState("");

  const filteredVagter = vagter.filter((m) =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase()),
  );

  return (
    <Card className="border-l-4 border-l-[#E63946] p-6 gap-4 hidden md:flex flex-col flex-1 min-h-0">
      <CardHeader className="p-0 gap-2 flex flex-col">
        <div className="flex items-center gap-2">
          <Users className="size-5 text-[#E63946]" />
          <CardTitle className="text-base leading-6">Vagter</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {vagter.length}
          </Badge>
        </div>
        <p className="text-xs text-neutral-500">
          Træk en person til en klubaften for at tildele
        </p>
      </CardHeader>
      <CardContent className="flex p-0 flex-col gap-2 flex-1 min-h-0">
        <div className="relative">
          <Search className="size-4 top-1/2 -translate-y-1/2 text-neutral-500 absolute left-3" />
          <Input
            placeholder="Søg vagt…"
            className="pl-9 h-9"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto flex-1 min-h-0">
          {filteredVagter.map((m) => (
            <div
              key={m.id}
              draggable
              onDragStart={() => onDragStart(m.id)}
              onDragEnd={onDragEnd}
              className={`select-none cursor-grab active:cursor-grabbing rounded-md flex p-2 items-center gap-3 border transition-colors ${
                draggingMemberId === m.id
                  ? "opacity-50 border-neutral-200 bg-neutral-50"
                  : "border-transparent hover:bg-neutral-50 hover:border-neutral-200"
              }`}
            >
              <GripVertical className="hidden sm:block size-4 text-neutral-300 shrink-0" />
              <div className="w-9 h-9 rounded-full bg-[#E63946] text-white flex items-center justify-center text-[0.65rem] font-bold select-none shrink-0">
                {m.initials}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="truncate text-sm font-medium leading-5">
                  {m.name}
                </span>
                <span className="text-[10px] text-neutral-400">Vagt</span>
              </div>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          className="mt-2 w-full gap-2 border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-400"
          onClick={onAutoAssign}
          disabled={saving}
        >
          <Wand2 className="size-4" />
          Auto-tildel vagter
        </Button>
      </CardContent>
    </Card>
  );
}
