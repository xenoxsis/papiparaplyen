"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthNames = [
    "Januar",
    "Februar",
    "Marts",
    "April",
    "Maj",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "December",
  ];
  const daysOfWeek = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    let firstDayOfWeek = firstDay.getDay() - 1;
    if (firstDayOfWeek === -1) firstDayOfWeek = 6;
    return { daysInMonth, firstDayOfWeek };
  };

  const { daysInMonth, firstDayOfWeek } = getDaysInMonth(currentDate);

  const previousMonth = () =>
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1),
    );
  const nextMonth = () =>
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1),
    );

  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() &&
    currentDate.getMonth() === today.getMonth() &&
    currentDate.getFullYear() === today.getFullYear();

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDayOfWeek }, (_, i) => i);

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-6 max-w-160 mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={previousMonth}
          aria-label="Forrige måned"
          className="p-2 rounded-lg hover:bg-neutral-100 transition-colors flex items-center justify-center"
        >
          <ChevronLeft className="size-5 text-neutral-900" />
        </button>
        <h2 className="text-lg font-bold text-neutral-900">
          {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
        </h2>
        <button
          onClick={nextMonth}
          aria-label="Næste måned"
          className="p-2 rounded-lg hover:bg-neutral-100 transition-colors flex items-center justify-center"
        >
          <ChevronRight className="size-5 text-neutral-900" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2 mb-2">
        {daysOfWeek.map((day) => (
          <div
            key={day}
            className="text-center font-semibold text-neutral-500 text-sm py-2"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {emptyDays.map((_, index) => (
          <div key={`empty-${index}`} className="aspect-square" />
        ))}
        {days.map((day) => (
          <div
            key={day}
            className={`aspect-square flex items-center justify-center rounded-lg text-sm cursor-pointer transition-colors ${
              isToday(day)
                ? "bg-red-500 text-white font-bold hover:bg-red-600"
                : "text-neutral-900 hover:bg-neutral-100"
            }`}
          >
            {day}
          </div>
        ))}
      </div>
    </div>
  );
}
