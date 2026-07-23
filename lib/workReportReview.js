import "server-only";

function manualRate(tier) {
  return { rate_80: 80, rate_85: 85, rate_90: 90, manager_95: 95 }[tier] || null;
}

function taipeiYear(value) {
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Taipei", year: "numeric" }).format(new Date(value)));
}

function taipeiMonth(value) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit" }).formatToParts(new Date(value));
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
}

function nextMonth(value) {
  const source = new Date(value);
  const shifted = new Date(Date.UTC(taipeiYear(source), Number(taipeiMonth(source).slice(5)) - 1 + 1, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function deepnightRate(supabaseAdmin, staff, finishedAt) {
  const configured = manualRate(staff?.commission_tier);
  if (configured) return configured;
  if (new Date(finishedAt) < new Date("2026-09-01T00:00:00+08:00")) return 90;
  const { data, error } = await supabaseAdmin.from("play_orders")
    .select("discord_id, order_amount, price, staff_salary, order_finished_at, completed_at, created_at, is_deleted")
    .eq("discord_id", staff.discord_id).or("is_deleted.eq.false,is_deleted.is.null")
    .order("order_finished_at", { ascending: true });
  if (error) throw error;
  const orders = data || [];
  const previousYear = taipeiYear(finishedAt) - 1;
  const previousSalary = orders.filter((row) => taipeiYear(row.order_finished_at || row.completed_at || row.created_at) === previousYear).reduce((sum, row) => sum + Number(row.staff_salary || 0), 0);
  if (previousSalary >= 100000) return 90;
  let total = 0;
  for (const row of orders) {
    total += Number(row.order_amount ?? row.price ?? 0);
    if (total >= 10000) {
      const reachedAt = row.order_finished_at || row.completed_at || row.created_at;
      if (reachedAt && taipeiMonth(finishedAt) >= nextMonth(reachedAt)) return 85;
      break;
    }
  }
  return 80;
}

function parseMeta(row, organization) {
  try { return JSON.parse((organization === "deepnight" ? row.note : row.admin_note) || "{}"); } catch { return {}; }
}

export async function reviewWorkReport(supabaseAdmin, organization, body, reviewerDiscordId) {
  const deepnight = organization === "deepnight";
  const table = deepnight ? "play_orders" : "qiunai_salary_orders";
  const pendingStatus = deepnight ? "work_pending" : "工時待審核";
  const id = String(body.id || "").trim();
  const action = String(body.action || "");
  if (!id || !["approve", "reject"].includes(action)) throw new Error("審核資料不正確");
  const { data: row, error: readError } = await supabaseAdmin.from(table).select("*").eq("id", id).eq("status", pendingStatus).single();
  if (readError || !row) throw new Error("找不到待審核的訂單或打賞");

  if (action === "reject") {
    const reason = String(body.reason || "").trim();
    if (!reason) throw new Error("請輸入駁回原因");
    const payload = deepnight
      ? { status: "work_rejected", note: `工時申報駁回：${reason}` }
      : { status: "工時已駁回", deleted_reason: reason, edited_at: new Date().toISOString(), edited_by: reviewerDiscordId };
    const { error } = await supabaseAdmin.from(table).update(payload).eq("id", id).eq("status", pendingStatus);
    if (error) throw error;
    return { id, action };
  }

  const meta = parseMeta(row, organization);
  const staffId = String(row.discord_id || "").trim();
  const staffTable = deepnight ? "players" : "qiunai_staff";
  const { data: staff, error: staffError } = await supabaseAdmin.from(staffTable).select("discord_id, commission_tier").eq("discord_id", staffId).single();
  if (staffError || !staff) throw new Error("找不到員工抽成設定");
  const endedAt = meta.endedAt || row.order_finished_at || row.completed_at || new Date().toISOString();
  const serviceName = meta.serviceName || row.service_name || row.service || "陪玩服務";
  const orderType = meta.orderType || row.order_type || "訂單";
  const isTip = String(orderType).includes("打賞") || String(serviceName).includes("打賞");
  const regularRate = deepnight ? await deepnightRate(supabaseAdmin, staff, endedAt) : (manualRate(staff.commission_tier) || (new Date(endedAt) < new Date("2026-09-01T00:00:00+08:00") ? 90 : 80));
  const salaryRate = isTip && regularRate !== 95 ? 90 : regularRate;
  const amount = Number(row.order_amount || row.final_price || row.price || 0);
  const salary = Math.round(amount * salaryRate / 100);
  const common = { customer_name: meta.customerName || row.customer_name || row.customer_id || "手動報單", service_name: serviceName, order_amount: amount, staff_salary: salary, bonus_amount: 0, salary_rate: salaryRate, salary_level: isTip ? (salaryRate === 95 ? "打賞特別設定 95%" : "打賞固定 90%") : `工時申報 ${salaryRate}%`, platform_income: amount, platform_expense: salary, order_finished_at: endedAt, is_deleted: false };
  const payload = deepnight
    ? { ...common, service: serviceName, order_type: isTip ? "打賞" : "訂單", assigned_player: staffId, status: "completed", quote_status: "completed", final_price: amount, price: amount, completed_at: endedAt, duration_minutes: Number(meta.durationMinutes || row.duration_minutes || 0) }
    : { ...common, status: "未發薪", admin_note: `申報時長 ${Number(meta.durationMinutes || row.duration_minutes || 0)} 分鐘｜審核人 ${reviewerDiscordId}` };
  const { error } = await supabaseAdmin.from(table).update(payload).eq("id", id).eq("status", pendingStatus);
  if (error) throw error;
  return { id, action, salaryRate, staffSalary: salary };
}

