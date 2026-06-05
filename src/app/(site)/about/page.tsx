"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Heart,
  Gamepad2,
  BookOpen,
  Shield,
  MapPin,
  Navigation,
} from "lucide-react";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  getClubBoardgames,
  getDefaultLocation,
  getPublicMembers,
  type ApiLocation,
  type ApiPublicMember,
} from "@/lib/api";

export default function AboutPage() {
  const [vagter, setVagter] = useState<ApiPublicMember[]>([]);
  // Live count of games left at the club for shared use; null until loaded.
  const [clubGameCount, setClubGameCount] = useState<number | null>(null);
  // The club's usual venue ("Fast lokation"); null if none is set.
  const [location, setLocation] = useState<ApiLocation | null>(null);

  useEffect(() => {
    getPublicMembers()
      .then((all) =>
        setVagter(
          all.filter(
            (m) => m.roles.includes("Vagt") && m.show_on_about_page !== false,
          ),
        ),
      )
      .catch(console.error);
    getClubBoardgames()
      .then((games) => setClubGameCount(games.length))
      .catch(console.error);
    getDefaultLocation().then(setLocation).catch(console.error);
  }, []);

  const mapQuery = location
    ? encodeURIComponent(`${location.name}, ${location.address}`)
    : "";
  return (
    <>
      <section className="w-full bg-white dark:bg-neutral-950">
        <div className="max-w-285 mx-auto px-4 sm:px-8 py-10 sm:py-12">
          <div className="flex flex-col gap-2 mb-8">
            <span className="font-semibold uppercase text-red-500 text-sm tracking-wider">
              Om os
            </span>
            <h1 className="font-bold text-neutral-900 dark:text-neutral-100 text-3xl">
              Hvem er vi?
            </h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12">
            <div className="flex flex-col gap-4">
              <p className="leading-relaxed text-neutral-500 dark:text-neutral-400">
                Esbjerg Brætspil er en hyggelig brætspilsklub, hvor vi mødes
                regelmæssigt for at spille alt fra klassiske familiespil til
                komplekse strategispil. Vi tror på, at gode aftener bygges
                omkring bordet med terninger, kort og masser af grin.
              </p>
              <p className="leading-relaxed text-neutral-500 dark:text-neutral-400">
                Hos os er alle velkomne - uanset om du er erfaren veteran eller
                helt ny i brætspilsverdenen. Vores erfarne medlemmer hjælper nye
                spillere i gang og introducerer nye spil hver uge.
              </p>
              <p className="leading-relaxed text-neutral-500 dark:text-neutral-400">
                Der er altid et stort udvalg af spil tilgængeligt i klubben, så
                der er altid noget nyt at prøve. Du behøver ikke medbringe egne
                spil for at deltage.
              </p>

              <div className="flex flex-row gap-6 mt-2">
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-2xl text-red-500">
                    {clubGameCount ?? "…"}
                  </span>
                  <span className="text-neutral-500 text-xs">
                    Spil i klubben
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-2xl text-yellow-500">
                    0 kr
                  </span>
                  <span className="text-neutral-500 text-xs">Kontingent</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-2xl text-green-600">2024</span>
                  <span className="text-neutral-500 text-xs">Stiftet</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-2xl text-blue-500">64</span>
                  <span className="text-neutral-500 text-xs">
                    Klubaftener/år
                  </span>
                </div>
              </div>
            </div>

            <div className="relative rounded-2xl overflow-hidden min-h-64 md:min-h-96">
              <Image
                src="https://images.unsplash.com/photo-1632501641765-e568d28b0015?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=800"
                alt="People playing board games at a table"
                fill
                className="object-cover"
              />
              <div className="absolute left-4 right-4 bottom-4 bg-white/90 dark:bg-neutral-900/90 rounded-lg p-4 flex items-center gap-2 font-medium text-sm text-neutral-900 dark:text-neutral-100">
                <Users className="size-5 text-red-500 shrink-0" />
                <span>Hver torsdag aften - bare mød op</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-neutral-100 dark:bg-neutral-900">
        <div className="max-w-285 mx-auto px-4 sm:px-8 py-10 sm:py-12">
          <div className="flex flex-col gap-2 mb-8">
            <span className="font-semibold uppercase text-red-500 text-sm tracking-wider">
              Vores værdier
            </span>
            <h2 className="font-bold text-neutral-900 dark:text-neutral-100 text-3xl">
              Hvad gør os specielle?
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center">
                <Heart className="size-5 text-white" />
              </div>
              <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
                Fællesskab
              </h3>
              <p className="text-neutral-500 dark:text-neutral-400 text-sm leading-relaxed">
                Vi skaber et trygt og inkluderende miljø, hvor alle føler sig
                velkomne uanset erfaring.
              </p>
            </div>
            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-400 flex items-center justify-center">
                <Gamepad2 className="size-5 text-white" />
              </div>
              <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
                Sjove spil
              </h3>
              <p className="text-neutral-500 dark:text-neutral-400 text-sm leading-relaxed">
                Med et stort udvalg af spil tilgængeligt i klubben er der altid
                noget for enhver smag og hvert humør.
              </p>
            </div>
            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-600 flex items-center justify-center">
                <BookOpen className="size-5 text-white" />
              </div>
              <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
                Lær nyt
              </h3>
              <p className="text-neutral-500 dark:text-neutral-400 text-sm leading-relaxed">
                Erfarne medlemmer introducerer nye spil hver uge og hjælper
                begyndere i gang.
              </p>
            </div>
          </div>
        </div>
      </section>

      {location && (
        <section className="w-full bg-white dark:bg-neutral-950">
          <div className="max-w-285 mx-auto px-4 sm:px-8 py-10 sm:py-12">
            <div className="flex flex-col gap-2 mb-8">
              <span className="font-semibold uppercase text-red-500 text-sm tracking-wider">
                Find os
              </span>
              <h2 className="font-bold text-neutral-900 dark:text-neutral-100 text-3xl">
                Her mødes vi
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-stretch">
              <div className="flex flex-col gap-4 justify-center">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center shrink-0">
                    <MapPin className="size-5 text-white" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
                      {location.name}
                    </span>
                    <span className="text-neutral-500 dark:text-neutral-400 text-sm">
                      {location.address}
                    </span>
                  </div>
                </div>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 self-start rounded-lg bg-brand-teal hover:bg-teal-600 text-white text-sm font-medium px-4 py-2 transition-colors"
                >
                  <Navigation className="size-4" />
                  Få rutevejledning
                </a>
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-700 min-h-64 md:min-h-80">
                <iframe
                  title={`Kort over ${location.name}`}
                  src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="absolute inset-0 w-full h-full"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {vagter.length > 0 && (
        <section className="w-full bg-neutral-100 dark:bg-neutral-900">
          <div className="max-w-285 mx-auto px-4 sm:px-8 py-10 sm:py-12">
            <div className="text-center flex flex-col items-center gap-2 mb-8">
              <span className="font-semibold uppercase text-red-500 text-sm tracking-wider">
                Vagter
              </span>
              <h2 className="font-bold text-neutral-900 dark:text-neutral-100 text-3xl">
                Mød holdet bag klubben
              </h2>
              <p className="max-w-xl text-neutral-500 dark:text-neutral-400 text-sm leading-5">
                Frivillige ildsjæle, der sørger for at klubaftenerne kører som
                smurt.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
              {vagter.map((m) => (
                <div
                  key={m.id}
                  className="bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6 flex flex-col items-center gap-3"
                >
                  <Avatar className="size-20">
                    {m.has_avatar && (
                      <AvatarImage
                        src={`/api/members/${m.id}/avatar`}
                        alt={m.name}
                      />
                    )}
                    <AvatarFallback className="bg-brand-red text-white text-lg font-bold">
                      {m.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-center flex flex-col items-center gap-1">
                    <p className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                      {m.name}
                    </p>
                    <span className="flex items-center gap-1 text-xs text-brand-teal font-medium bg-brand-teal/10 px-2 py-0.5 rounded-full">
                      <Shield className="size-3" />
                      Vagt
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
