import {
  Sparkles,
  UserPlus,
  Calendar,
  Users,
  ArrowRight,
  Clock,
  MapPin,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type ClubNight = {
  id: number;
  number: number;
  name: string;
  date: string;
  time_from: string;
  time_to: string;
  location: string;
  vagt_member_id: number | null;
  assigned_member_name: string | null;
  assigned_member_initials: string | null;
  vagt_confirmed: boolean;
};

async function getUpcomingNights(): Promise<ClubNight[]> {
  try {
    const res = await fetch(`${API}/api/club-nights`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const all: ClubNight[] = await res.json();
    const today = new Date().toISOString().slice(0, 10);
    return all
      .filter((n) => n.date >= today && n.vagt_confirmed)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3);
  } catch {
    return [];
  }
}

export default async function Home() {
  const nights = await getUpcomingNights();
  return (
    <>
      {/* Hero */}
      <section className="w-full bg-linear-to-br from-neutral-900 to-neutral-950">
        <div className="max-w-285 mx-auto px-4 sm:px-8 py-10 sm:py-12 flex flex-col sm:flex-row items-center gap-6 sm:gap-8 text-center sm:text-left">
          <div className="shrink-0 w-28 h-28 sm:w-40 sm:h-40 rounded-2xl bg-white flex items-center justify-center p-2">
            <Image
              src="/papiparaplyen-logo.png"
              alt="Pap i Paraplyen logo"
              width={144}
              height={144}
              className="object-contain w-full h-full"
            />
          </div>
          <div className="flex flex-col gap-4">
            <span className="inline-flex items-center gap-1 bg-yellow-400 text-black rounded-full px-4 py-1 text-sm font-medium mx-auto sm:mx-0 w-fit">
              <Sparkles className="size-3 mr-1" />
              Brætspilsklub siden 2022
            </span>
            <h1 className="font-bold text-white text-3xl sm:text-5xl tracking-tight leading-none">
              Pap i Paraplyen
            </h1>
            <p className="text-white/80 text-lg">
              Din lokale brætspilsklub - alle er velkomne!
            </p>
            <div className="flex flex-row gap-4 mt-2 justify-center sm:justify-start">
              <Button
                asChild
                className="bg-red-500 hover:bg-red-600 text-white gap-2"
              >
                <Link href="/login">
                  <UserPlus className="size-4" />
                  Bliv medlem
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="bg-transparent text-white hover:bg-white/10 hover:text-white gap-2"
              >
                <Link href="/events">
                  <Calendar className="size-4 text-white" />
                  <span className="text-white">Se kommende aftener</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="w-full bg-white">
        <div className="max-w-285 mx-auto px-4 sm:px-8 py-10 sm:py-12 grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12">
          <div className="flex flex-col justify-center gap-4">
            <span className="font-semibold uppercase text-red-500 text-sm tracking-wider">
              Om os
            </span>
            <h2 className="font-bold text-neutral-900 text-3xl">Hvem er vi?</h2>
            <p className="leading-relaxed text-neutral-500">
              Pap i Paraplyen er en hyggelig brætspilsklub, hvor vi mødes
              regelmæssigt for at spille alt fra klassiske familiespil til
              komplekse strategispil.
            </p>
            <p className="leading-relaxed text-neutral-500">
              Hos os er alle velkomne - uanset om du er erfaren veteran eller
              helt ny i brætspilsverdenen.
            </p>
            <p className="leading-relaxed text-neutral-500">
              Klubben råder over et stort spilbibliotek med over 200 titler, så
              der er altid noget nyt at prøve.
            </p>
            <div className="flex flex-row gap-6 mt-2">
              <div className="flex flex-col gap-1">
                <span className="font-bold text-2xl text-red-500">200+</span>
                <span className="text-neutral-500 text-xs">
                  Spil i biblioteket
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-bold text-2xl text-yellow-500">85</span>
                <span className="text-neutral-500 text-xs">
                  Aktive medlemmer
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-bold text-2xl text-green-600">10</span>
                <span className="text-neutral-500 text-xs">År med spil</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-bold text-2xl text-blue-500">52</span>
                <span className="text-neutral-500 text-xs">Klubaftener/år</span>
              </div>
            </div>
          </div>
          <div className="relative rounded-2xl overflow-hidden min-h-64 sm:min-h-96">
            <Image
              src="https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800"
              alt="People playing board games at a table"
              fill
              className="object-cover"
            />
            <div className="absolute left-4 right-4 bottom-4 bg-white/90 rounded-lg p-4 flex items-center gap-2 font-medium text-sm text-neutral-900">
              <Users className="size-5 text-red-500 shrink-0" />
              <span>Hver torsdag aften - helt gratis</span>
            </div>
          </div>
        </div>
      </section>

      {/* Events */}
      <section className="w-full bg-neutral-100">
        <div className="max-w-285 mx-auto px-4 sm:px-8 py-10 sm:py-12 flex flex-col gap-8">
          <div className="flex justify-between items-end">
            <div className="flex flex-col gap-2">
              <span className="font-semibold uppercase text-red-500 text-sm tracking-wider">
                Klubaftener
              </span>
              <h2 className="font-bold text-neutral-900 text-3xl">
                Næste klubaftener
              </h2>
            </div>
            <Button asChild variant="ghost" className="gap-2">
              <Link href="/events">
                Se alle
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {nights.map((night, i) => {
              const d = new Date(night.date);
              const dateLabel = d.toLocaleDateString("da-DK", {
                weekday: "long",
                day: "numeric",
                month: "long",
              });
              const hasVagt = night.vagt_member_id !== null;
              const isNext = i === 0;

              return (
                <Card
                  key={night.id}
                  className={`border-t-4 flex flex-col ${isNext ? "border-t-[#E63946]" : "border-t-neutral-300"}`}
                >
                  <CardHeader className="flex flex-col gap-2">
                    <span
                      className={`font-semibold uppercase text-xs tracking-wider flex items-center gap-1 rounded-full px-2 py-0.5 w-fit ${isNext ? "bg-red-50 text-red-600" : "bg-neutral-100 text-neutral-500"}`}
                    >
                      <Calendar className="size-3" />
                      {isNext ? "Næste aften" : `Klubaften #${night.number}`}
                    </span>
                    <h3 className="font-bold text-xl text-neutral-900 capitalize">
                      {dateLabel}
                    </h3>
                    <p className="text-neutral-500 text-sm">{night.name}</p>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 pt-0 pb-6">
                    <div className="flex items-center gap-2 text-sm text-neutral-900">
                      <Clock className="size-4 text-neutral-500 shrink-0" />
                      {night.time_from} - {night.time_to}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-neutral-900">
                      <MapPin className="size-4 text-neutral-500 shrink-0" />
                      {night.location}
                    </div>
                    {hasVagt ? (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="w-6 h-6 rounded-full bg-[#2a9d8f] text-white text-[0.6rem] font-bold flex items-center justify-center shrink-0">
                          {night.assigned_member_initials}
                        </span>
                        <span className="text-sm text-neutral-700">
                          {night.assigned_member_name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-[#E63946] font-medium mt-1">
                        Ingen vagt tildelt endnu
                      </span>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {nights.length === 0 && (
              <p className="col-span-3 text-center text-neutral-400 py-8">
                Ingen kommende klubaftener planlagt endnu
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
