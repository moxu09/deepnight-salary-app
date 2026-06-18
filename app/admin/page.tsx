"use client";

import Link from "next/link";
import { Users, WalletCards, Settings, ArrowRight } from "lucide-react";

export default function AdminHomePage() {
  const cards = [
    {
      href: "/admin/staff",
      icon: Users,
      title: "員工管理",
      desc: "設定員工資料、上線狀態、可接服務、個人薪資頻道 ID。",
    },
    {
      href: "/admin/salary",
      icon: WalletCards,
      title: "薪資總表",
      desc: "查看收入、支出、獎金、訂單薪資與發薪狀態。",
    },
    {
      href: "/admin/settings",
      icon: Settings,
      title: "系統設定",
      desc: "設定管理總報告頻道、發薪日與薪資通知相關設定。",
    },
  ];

  return (
    <main className="min-h-screen bg-[#eef7fd] px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <header className="mb-10 rounded-[32px] border border-sky-100 bg-white px-8 py-7 shadow-sm shadow-sky-100">
          <p className="text-sm font-bold tracking-wide text-sky-600">
            DeepNight Admin
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">
            深夜不關燈｜管理後台
          </h1>

          <p className="mt-3 text-sm leading-7 text-slate-600 md:text-base">
            管理員可在這裡維護員工資料、薪資資料、系統通知與發薪設定。
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <Link
                key={card.href}
                href={card.href}
                className="group rounded-[30px] border border-sky-100 bg-white p-7 shadow-sm shadow-sky-100 transition duration-200 hover:-translate-y-1 hover:border-sky-300 hover:shadow-md"
              >
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 transition group-hover:bg-sky-100">
                  <Icon size={30} strokeWidth={2.3} />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-2xl font-black text-slate-900 transition group-hover:text-sky-700">
                    {card.title}
                  </h2>

                  <ArrowRight
                    size={20}
                    className="shrink-0 text-sky-400 transition group-hover:translate-x-1 group-hover:text-sky-600"
                  />
                </div>

                <p className="mt-4 text-base leading-8 text-slate-600">
                  {card.desc}
                </p>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}