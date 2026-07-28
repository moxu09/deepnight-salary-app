"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Building2, MoonStar, Sparkles } from "lucide-react";
import { useErpAccess } from "@/lib/useErpAccess";

const ERP_OWNER_DISCORD_ID = "847840193859682304";

export default function AdminHomePage() {
  const { loading, access } = useErpAccess("deepnight");
  const owner = access?.discordId === ERP_OWNER_DISCORD_ID;

  if (loading || !access?.isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="rounded-2xl bg-white px-6 py-4 text-sm font-bold text-slate-500 shadow-sm">
          正在載入共同 ERP 後台…
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-pink-50 p-5 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-[32px] border border-white bg-white/90 p-7 shadow-xl shadow-slate-200/60 sm:p-10">
          <p className="flex items-center gap-2 text-sm font-black tracking-[0.16em] text-slate-500">
            <Building2 size={18} />
            WE ARE STILL HERE
          </p>
          <h1 className="mt-3 text-3xl font-black text-slate-900 sm:text-4xl">
            共同 ERP 後台
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            兩間店的營運資料依部門分開顯示。切換部門後，左側功能會保留相同操作位置。
          </p>
        </section>

        <section className={`mt-6 grid gap-5 ${owner ? "md:grid-cols-2" : ""}`}>
          <DepartmentCard
            href="/admin/salary"
            title="深夜不關燈"
            description="查看深夜部門的員工、訂單、薪資、簽核與會計資料。"
            icon={<MoonStar size={28} />}
            color="sky"
          />
          {owner ? (
            <DepartmentCard
              href="/admin/department/qiunai/salary"
              title="秋奈電競"
              description="查看秋奈部門的員工、訂單、薪資、簽核與會計資料。"
              icon={<Sparkles size={28} />}
              color="pink"
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function DepartmentCard({
  href,
  title,
  description,
  icon,
  color,
}: {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  color: "sky" | "pink";
}) {
  const styles =
    color === "pink"
      ? "border-pink-200 bg-pink-50 text-pink-700 hover:border-pink-300 hover:bg-pink-100"
      : "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100";

  return (
    <Link
      href={href}
      className={`group rounded-[30px] border p-6 transition hover:-translate-y-1 hover:shadow-xl ${styles}`}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
        {icon}
      </span>
      <h2 className="mt-5 text-2xl font-black">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <p className="mt-5 text-sm font-black">進入部門 →</p>
    </Link>
  );
}
