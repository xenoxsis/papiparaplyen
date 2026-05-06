import CalendarComponent from "@/components/Calendar";

export default function CalendarPage() {
  return (
    <section className="bg-neutral-100 w-full min-h-[60vh]">
      <div className="max-w-285 mx-auto px-4 sm:px-8 py-8 sm:py-12">
        <div className="flex flex-col gap-2 mb-8">
          <span className="font-semibold uppercase text-blue-500 text-sm tracking-wider">
            Kalender
          </span>
          <h1 className="font-bold text-neutral-900 text-2xl sm:text-3xl">
            Kalender
          </h1>
          <p className="text-neutral-500 text-base">
            Find ud af hvornår vi mødes næste gang!
          </p>
        </div>
        <CalendarComponent />
      </div>
    </section>
  );
}
