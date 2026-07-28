"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Cpu,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TicketPlus,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useErpAccess } from "@/lib/useErpAccess";

type Organization = "deepnight" | "qiunai";
type Finding = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
};
type AuditReport = {
  id: string;
  organization: Organization;
  reportId: string;
  applicantId: string;
  generatedAt: string;
  uploadedAt: string;
  consentAccepted: boolean;
  automaticUploadAccepted: boolean;
  reportSha256: string;
  reviewStatus: string;
  analysis: {
    summary: {
      score: number;
      level: "high" | "review" | "low";
      high: number;
      medium: number;
      low: number;
      dmaCandidateCount: number;
      unsignedDriverCount: number;
      invalidDriverCount: number;
      defenderDetectionCount: number;
      collectionErrorCount: number;
      isAdministrator: boolean;
    };
    security: Record<string, string>;
    system: Record<string, string>;
    findings: Finding[];
    disclaimer: string;
  };
};

const LABELS: Record<Organization, string> = {
  deepnight: "深夜不關燈",
  qiunai: "秋奈電競",
};
const ERP_OWNER_DISCORD_ID = "847840193859682304";
const STATE_LABELS: Record<string, string> = {
  enabled: "已啟用",
  disabled: "未啟用",
  unknown: "無法確認",
  unsupported: "不支援",
};
const SECURITY_LABELS: Record<string, string> = {
  secureBoot: "Secure Boot",
  tpm: "TPM",
  vbs: "VBS",
  memoryIntegrity: "記憶體完整性",
  kernelDmaProtection: "Kernel DMA Protection",
  dmaRemapping: "DMA Remapping",
};

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("ERP 登入已過期，請重新登入");
  return token;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function levelStyle(level: string) {
  if (level === "high") return "border-rose-200 bg-rose-50 text-rose-700";
  if (level === "review") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default function DeviceAuditAdmin({
  organization,
  combinedForOwner = false,
  embedded = false,
}: {
  organization: Organization;
  combinedForOwner?: boolean;
  embedded?: boolean;
}) {
  const { loading: accessLoading, access } = useErpAccess(organization);
  const owner =
    combinedForOwner && access?.discordId === ERP_OWNER_DISCORD_ID;
  const [reports, setReports] = useState<AuditReport[]>([]);
  const [viewOrganization, setViewOrganization] = useState<
    Organization | "all"
  >("all");
  const [tokenOrganization, setTokenOrganization] =
    useState<Organization>(organization);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [applicantId, setApplicantId] = useState("");
  const [creatingToken, setCreatingToken] = useState(false);
  const [createdToken, setCreatedToken] = useState<{
    token: string;
    expiresAt: string;
  } | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await accessToken();
      const organizations: Organization[] = owner
        ? ["deepnight", "qiunai"]
        : [organization];
      const payloads = await Promise.all(
        organizations.map(async (currentOrganization) => {
          const response = await fetch(
            `/api/device-audit/reports?organization=${currentOrganization}`,
            {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
            },
          );
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload.message || "讀取報告失敗");
          }
          return payload;
        }),
      );
      const nextReports = payloads
        .flatMap((payload) => payload.reports || [])
        .sort(
          (a: AuditReport, b: AuditReport) =>
            new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
        );
      setReports(nextReports);
      setSelectedId((current) =>
        nextReports.some((item: AuditReport) => item.id === current)
          ? current
          : nextReports[0]?.id || "",
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "讀取報告失敗");
    } finally {
      setLoading(false);
    }
  }, [organization, owner]);

  useEffect(() => {
    if (accessLoading || !access?.capabilities.canViewDeviceAudits) return;
    const timer = window.setTimeout(() => void loadReports(), 0);
    return () => window.clearTimeout(timer);
  }, [access, accessLoading, loadReports]);

  const visibleReports = useMemo(
    () =>
      owner && viewOrganization !== "all"
        ? reports.filter((report) => report.organization === viewOrganization)
        : reports,
    [owner, reports, viewOrganization],
  );
  const effectiveSelectedId = visibleReports.some(
    (report) => report.id === selectedId,
  )
    ? selectedId
    : visibleReports[0]?.id || "";
  const selected = useMemo(
    () =>
      visibleReports.find((report) => report.id === effectiveSelectedId) ||
      null,
    [effectiveSelectedId, visibleReports],
  );

  async function generateToken() {
    if (!applicantId.trim()) {
      setError("請先輸入申請編號或 Discord ID");
      return;
    }
    setCreatingToken(true);
    setError("");
    setCreatedToken(null);
    try {
      const token = await accessToken();
      const response = await fetch("/api/device-audit/tokens", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organization: tokenOrganization,
          applicantId: applicantId.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "建立上傳碼失敗");
      setCreatedToken({ token: payload.token, expiresAt: payload.expiresAt });
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "建立上傳碼失敗",
      );
    } finally {
      setCreatingToken(false);
    }
  }

  async function copyToken() {
    if (!createdToken) return;
    await navigator.clipboard.writeText(createdToken.token);
  }

  if (accessLoading) {
    return <p className="p-8 text-sm font-bold text-slate-500">正在驗證權限…</p>;
  }

  return (
    <main className={embedded ? "w-full" : "min-h-screen bg-slate-100 p-5 sm:p-8"}>
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[28px] bg-slate-900 p-7 text-white shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black tracking-[0.18em] text-cyan-300">
                {owner ? "兩家共同後台" : LABELS[organization]}
              </p>
              <h1 className="mt-2 flex items-center gap-3 text-3xl font-black">
                <Cpu /> 電腦稽核
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                受檢者掃描前同意一次，完成後報告會直接回傳；這裡只呈現風險指標，不作為外掛定論。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadReports()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-black text-slate-900 disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              重新整理
            </button>
          </div>
        </header>

        <section className="mt-6 rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <TicketPlus size={20} /> 建立一次性上傳碼
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            上傳碼綁定部門及帳號，24 小時內只能成功上傳一份報告。
          </p>
          <div className="device-audit-token-row mt-4 flex flex-col gap-3 sm:flex-row">
            {owner ? (
              <select
                value={tokenOrganization}
                onChange={(event) =>
                  setTokenOrganization(event.target.value as Organization)
                }
                className="device-audit-organization rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-black outline-none focus:border-cyan-500"
              >
                <option value="deepnight">深夜不關燈</option>
                <option value="qiunai">秋奈電競</option>
              </select>
            ) : null}
            <input
              value={applicantId}
              onChange={(event) => setApplicantId(event.target.value)}
              placeholder="申請編號或 Discord ID"
              className="device-audit-applicant min-w-0 flex-1 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none focus:border-cyan-500"
            />
            <button
              type="button"
              onClick={() => void generateToken()}
              disabled={creatingToken}
              className="device-audit-create-button shrink-0 rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              {creatingToken ? "建立中…" : "建立上傳碼"}
            </button>
          </div>
          {createdToken ? (
            <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
              <p className="text-xs font-black text-cyan-700">請交給本次受檢者</p>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 break-all rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-800">
                  {createdToken.token}
                </code>
                <button
                  type="button"
                  onClick={() => void copyToken()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white"
                >
                  <Clipboard size={16} /> 複製
                </button>
              </div>
              <p className="mt-2 text-xs font-bold text-slate-500">
                有效至 {dateTime(createdToken.expiresAt)}
              </p>
            </div>
          ) : null}
        </section>

        {error ? (
          <p className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-black text-slate-900">最近報告</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">
                共 {visibleReports.length} 份
              </p>
              {owner ? (
                <div className="mt-3 flex gap-2">
                  {[
                    ["all", "全部"],
                    ["deepnight", "深夜"],
                    ["qiunai", "秋奈"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setViewOrganization(
                          value as Organization | "all",
                        )
                      }
                      className={`rounded-full px-3 py-1.5 text-xs font-black ${
                        viewOrganization === value
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="max-h-[720px] overflow-y-auto p-3">
              {!loading && visibleReports.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm font-bold text-slate-400">
                  尚無掃描報告
                </p>
              ) : null}
              {visibleReports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setSelectedId(report.id)}
                  className={`mb-2 w-full rounded-2xl border p-4 text-left transition ${
                    effectiveSelectedId === report.id
                      ? "border-cyan-400 bg-cyan-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong className="truncate text-sm text-slate-900">
                      {report.applicantId}
                    </strong>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-black ${levelStyle(
                        report.analysis.summary.level,
                      )}`}
                    >
                      {report.analysis.summary.score} 分
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    {owner ? `${LABELS[report.organization]}・` : ""}
                    {dateTime(report.uploadedAt)}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <AuditDetail report={selected} />
        </div>
      </div>
    </main>
  );
}

function AuditDetail({ report }: { report: AuditReport | null }) {
  if (!report) {
    return (
      <section className="flex min-h-80 items-center justify-center rounded-[26px] border border-slate-200 bg-white p-8 text-sm font-bold text-slate-400 shadow-sm">
        請選擇一份報告
      </section>
    );
  }
  const summary = report.analysis.summary;
  const LevelIcon = summary.level === "low" ? ShieldCheck : ShieldAlert;

  return (
    <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black tracking-[0.14em] text-slate-400">
            {report.reportId}
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">
            {report.applicantId}
          </h2>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            掃描 {dateTime(report.generatedAt)}・上傳 {dateTime(report.uploadedAt)}
          </p>
        </div>
        <div className={`rounded-2xl border px-5 py-4 ${levelStyle(summary.level)}`}>
          <p className="flex items-center gap-2 text-sm font-black">
            <LevelIcon size={18} /> 風險分數
          </p>
          <p className="mt-1 text-3xl font-black">{summary.score}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="高風險" value={summary.high} tone="rose" />
        <Metric label="需確認" value={summary.medium} tone="amber" />
        <Metric label="DMA 可存取裝置" value={summary.dmaCandidateCount} tone="violet" />
        <Metric
          label="管理員掃描"
          value={summary.isAdministrator ? "是" : "否"}
          tone={summary.isAdministrator ? "emerald" : "amber"}
        />
      </div>
      <p className="mt-3 text-xs font-bold text-slate-500">
        DMA 可存取裝置通常包含顯示卡、網卡及控制器；數量僅供硬體核對，不代表外掛數量，也不會因數量增加風險分數。
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {Object.entries(report.analysis.security).map(([key, value]) => (
          <div key={key} className="rounded-2xl border border-slate-200 px-4 py-3">
            <p className="text-xs font-black text-slate-500">
              {SECURITY_LABELS[key] || key}
            </p>
            <p className="mt-1 text-sm font-black text-slate-900">
              {STATE_LABELS[value] || value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 p-5">
        <h3 className="font-black text-slate-900">檢查摘要</h3>
        <div className="mt-4 space-y-3">
          {report.analysis.findings.length === 0 ? (
            <p className="flex items-center gap-2 text-sm font-bold text-emerald-700">
              <CheckCircle2 size={18} /> 目前沒有規則命中的風險項目
            </p>
          ) : (
            report.analysis.findings.map((finding) => (
              <div key={finding.id} className="rounded-xl bg-slate-50 p-4">
                <p className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <AlertTriangle size={16} className="text-amber-500" />
                  {finding.title}
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  {finding.detail}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      <p className="mt-5 text-xs font-semibold leading-5 text-slate-500">
        {report.analysis.disclaimer}
      </p>
      <p className="mt-2 break-all text-[11px] font-semibold text-slate-400">
        SHA-256：{report.reportSha256}
      </p>
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "rose" | "amber" | "violet" | "emerald";
}) {
  const styles = {
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 ${styles}`}>
      <p className="text-xs font-black">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}
