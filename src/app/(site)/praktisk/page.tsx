import type { Metadata } from "next";
import { Coffee, CreditCard, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Praktisk info — Esbjerg Brætspil",
  description:
    "Godt at vide, inden du kommer til klubaften hos Esbjerg Brætspil.",
};

const items = [
  {
    icon: Users,
    color: "bg-red-500",
    title: "Børn under 15 år",
    body: "Børn under 15 år skal ledsages af en voksen. Vi vil gerne have alle med, men det er et krav af hensyn til de øvrige gæster og tryghed i lokalet.",
  },
  {
    icon: Coffee,
    color: "bg-yellow-400",
    title: "Sodavand, kage og snacks",
    body: "Hos Café Finns Paraply er der sodavand, kage og snacks tilgængeligt, som du kan købe til aftenen.",
  },
  {
    icon: CreditCard,
    color: "bg-green-600",
    title: "Betaling med MobilePay",
    body: "Betaling for mad og drikke foregår via MobilePay, så du ikke behøver kontanter.",
  },
];

export default function PraktiskPage() {
  return (
    <>
      <section className="w-full bg-white dark:bg-neutral-950">
        <div className="max-w-285 mx-auto px-4 sm:px-8 py-10 sm:py-12">
          <div className="flex flex-col gap-2 mb-4">
            <span className="font-semibold uppercase text-red-500 text-sm tracking-wider">
              Godt at vide
            </span>
            <h1 className="font-bold text-neutral-900 dark:text-neutral-100 text-3xl">
              Praktisk information
            </h1>
          </div>
          <p className="max-w-2xl text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Her finder du nyttig information, inden du møder op til en
            klubaften. Er du i tvivl om noget, er du altid velkommen til at
            spørge en af vores vagter på aftenen.
          </p>
        </div>
      </section>

      <section className="w-full bg-neutral-100 dark:bg-neutral-900">
        <div className="max-w-285 mx-auto px-4 sm:px-8 py-10 sm:py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {items.map(({ icon: Icon, color, title, body }) => (
              <div
                key={title}
                className="bg-white dark:bg-neutral-800 rounded-xl p-6 flex flex-col gap-3"
              >
                <div
                  className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}
                >
                  <Icon className="size-5 text-white" />
                </div>
                <h2 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
                  {title}
                </h2>
                <p className="text-neutral-500 dark:text-neutral-400 text-sm leading-relaxed">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
