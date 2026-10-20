import AdminShell from "@/components/AdminShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell company="深夜不關燈 EIP" rankingPath="/admin/salary-rank" organization="deepnight">{children}</AdminShell>;
}
