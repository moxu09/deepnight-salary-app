import ErpLoginCard from "@/components/ErpLoginCard";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string }>;
}) {
  const params = await searchParams;
  const department = params.department === "qiunai" ? "qiunai" : "deepnight";
  const nextPath =
    department === "qiunai"
      ? "/admin/department/qiunai/salary"
      : "/admin";

  return (
    <ErpLoginCard
      organization="deepnight"
      nextPath={nextPath}
      department={department}
      admin
    />
  );
}
