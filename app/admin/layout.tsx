import AdminShell from "@/components/AdminShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell company="深夜不關燈" rankingPath="/admin/salary-rank">{children}</AdminShell>;
}
