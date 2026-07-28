import { notFound } from "next/navigation";
import RemoteDepartmentFrame from "@/components/RemoteDepartmentFrame";

const SECTIONS = new Set([
  "staff",
  "salary",
  "payroll",
  "ranking",
  "approvals",
  "files",
  "accounting",
  "settings",
]);

export default async function QiunaiDepartmentPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!SECTIONS.has(section)) notFound();
  return <RemoteDepartmentFrame section={section} />;
}
