import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privatlivspolitik — Esbjerg Brætspil",
  description:
    "Oplysninger om behandling af personoplysninger i Esbjerg Brætspil.",
};

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-8 py-12 text-neutral-900">
      <h1 className="text-3xl font-bold mb-2">Privatlivspolitik</h1>
      <p className="text-sm text-neutral-500 mb-8">
        Sidst opdateret: 10. maj 2026
      </p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">1. Dataansvarlig</h2>
        <p className="text-sm leading-relaxed text-neutral-700">
          Esbjerg Brætspil er dataansvarlig for de personoplysninger, vi
          behandler om vores medlemmer. Har du spørgsmål til denne politik eller
          vil gøre brug af dine rettigheder, kan du kontakte os via vores{" "}
          <a
            href="https://www.facebook.com/groups/409372775159824"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Facebook-gruppe
          </a>
          .
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          2. Hvilke oplysninger indsamler vi?
        </h2>
        <ul className="list-disc list-inside text-sm leading-relaxed text-neutral-700 space-y-1">
          <li>Navn og initialer</li>
          <li>E-mailadresse</li>
          <li>Indmeldelsesdato</li>
          <li>Krypteret adgangskode (kun ved lokal konto)</li>
          <li>
            OAuth-udbyder og eksternt bruger-ID (ved Google- eller
            Facebook-login)
          </li>
          <li>Chatbeskeder sendt i klubbens kanaler</li>
          <li>Vagtbooking og skiftanmodninger</li>
          <li>Notifikationer og præferencerne for e-mailmeddelelser</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          3. Formål og retsgrundlag
        </h2>
        <div className="overflow-x-auto">
          <table className="text-sm w-full border-collapse">
            <thead>
              <tr className="bg-neutral-100 text-left">
                <th className="px-3 py-2 font-semibold border border-neutral-200">
                  Formål
                </th>
                <th className="px-3 py-2 font-semibold border border-neutral-200">
                  Retsgrundlag (GDPR)
                </th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              <tr>
                <td className="px-3 py-2 border border-neutral-200">
                  Administrere medlemskab og login
                </td>
                <td className="px-3 py-2 border border-neutral-200">
                  Art. 6, stk. 1, litra b (kontrakt)
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-neutral-200">
                  Sende e-mail om vagter, arrangementer og omtaler
                </td>
                <td className="px-3 py-2 border border-neutral-200">
                  Art. 6, stk. 1, litra a (samtykke)
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-neutral-200">
                  Vise chatbeskeder og vagtplan til andre medlemmer
                </td>
                <td className="px-3 py-2 border border-neutral-200">
                  Art. 6, stk. 1, litra b (kontrakt)
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-neutral-200">
                  Gemme OAuth-udbyder-ID for at muliggøre login via
                  Google/Facebook
                </td>
                <td className="px-3 py-2 border border-neutral-200">
                  Art. 6, stk. 1, litra b (kontrakt)
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-neutral-200">
                  Sikkerhedslogning og fejlhåndtering
                </td>
                <td className="px-3 py-2 border border-neutral-200">
                  Art. 6, stk. 1, litra f (legitim interesse)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">4. Tredjeparter</h2>
        <p className="text-sm leading-relaxed text-neutral-700 mb-2">
          Vi deler ikke dine personoplysninger med tredjeparter med henblik på
          markedsføring. Følgende tredjeparter modtager nødvendige oplysninger:
        </p>
        <ul className="list-disc list-inside text-sm leading-relaxed text-neutral-700 space-y-1">
          <li>
            <strong>Google / Facebook</strong> — hvis du vælger at logge ind via
            OAuth. Disse platforme modtager et redirect-URL og returnerer et
            bruger-ID og en e-mailadresse til os. Vi gemmer det tildelte
            udbyder-ID lokalt.
          </li>
          <li>
            <strong>E-mail-udbyder (SMTP)</strong> — din e-mailadresse
            videregives til vores e-mailserver, når vi sender dig notifikationer
            du har tilmeldt dig.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          5. Opbevaring og sletning
        </h2>
        <ul className="list-disc list-inside text-sm leading-relaxed text-neutral-700 space-y-1">
          <li>
            Brugte nulstillingslinks for adgangskoder slettes automatisk efter
            30 dage.
          </li>
          <li>Notifikationer slettes automatisk efter 90 dage.</li>
          <li>
            Slettede chatbeskeder anonymiseres øjeblikkeligt (indholdet
            fjernes).
          </li>
          <li>
            Øvrige personoplysninger opbevares, så længe du er aktivt medlem.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">6. Dine rettigheder</h2>
        <p className="text-sm leading-relaxed text-neutral-700 mb-2">
          Du har efter GDPR følgende rettigheder:
        </p>
        <ul className="list-disc list-inside text-sm leading-relaxed text-neutral-700 space-y-1">
          <li>
            <strong>Indsigt</strong> — du kan til enhver tid eksportere alle
            dine personoplysninger fra din profilside.
          </li>
          <li>
            <strong>Berigtigelse</strong> — du kan rette dit navn og dine
            præferencer fra din profilside.
          </li>
          <li>
            <strong>Sletning</strong> — du kan slette din konto og anonymisere
            dine data fra din profilside.
          </li>
          <li>
            <strong>Tilbagetrækning af samtykke</strong> — du kan til enhver tid
            framelde e-mailnotifikationer i dine kontoindstillinger.
          </li>
          <li>
            <strong>Dataportabilitet</strong> — dine data eksporteres i
            maskinlæsbart JSON-format.
          </li>
          <li>
            <strong>Klage</strong> — du har ret til at klage til Datatilsynet (
            <a
              href="https://www.datatilsynet.dk"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              datatilsynet.dk
            </a>
            ).
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">7. Sikkerhed</h2>
        <p className="text-sm leading-relaxed text-neutral-700">
          Adgangskoder opbevares udelukkende som bcrypt-hashes. Forbindelsen til
          databasen er krypteret (TLS). Autentificering sker via
          httpOnly-cookies med kortvarige JWT-tokens. Vi forsøger løbende at
          vedligeholde passende tekniske og organisatoriske
          sikkerhedsforanstaltninger i henhold til GDPR art. 32.
        </p>
      </section>

      <div className="mt-10 pt-6 border-t border-neutral-200">
        <Link
          href="/"
          className="text-sm text-neutral-500 hover:text-neutral-700 underline"
        >
          ← Tilbage til forsiden
        </Link>
      </div>
    </main>
  );
}
