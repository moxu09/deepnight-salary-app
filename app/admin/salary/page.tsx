"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  Edit3,
  Gift,
  Loader2,
  MinusCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const DEEPNIGHT_GUILD_ID =
  process.env.NEXT_PUBLIC_DEEPNIGHT_GUILD_ID ||
  process.env.NEXT_PUBLIC_GUILD_ID ||
  "1501098191813214312";
const DEEPNIGHT_PLAY_ORDER_FILTER =
  `guild_id.eq.${DEEPNIGHT_GUILD_ID},guild_id.is.null`;

type Staff = {
  id: string;
  discord_id: string;
  discord_name?: string | null;
  display_name?: string | null;
  real_name?: string | null;
  is_active?: boolean | null;
  commission_tier?: string | null;
  commission_note?: string | null;
};

type SalaryOrder = {
  id: string;
  order_no?: string | null;
  order_id?: string | null;
  discord_id: string;
  staff_name?: string | null;
  customer_name?: string | null;
  customer_id?: string | null;
  service_name?: string | null;
  service?: string | null;
  order_amount?: number | null;
  price?: number | null;
  staff_salary?: number | null;
  bonus_amount?: number | null;
  salary_rate?: number | null;
  salary_level?: string | null;
  platform_income?: number | null;
  platform_expense?: number | null;
  status?: string | null;
  order_finished_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  is_deleted?: boolean | null;
};

type Bonus = {
  id: string;
  discord_id: string;
  staff_name?: string | null;
  bonus_type?: string | null;
  description?: string | null;
  amount?: number | null;
  created_at?: string | null;
};

type OrderForm = {
  discord_id: string;
  service_name: string;
  order_amount: string;
  salary_rate: string;
  bonus_amount: string;
  order_finished_at: string;
  status: string;
};

type BonusForm = {
  discord_id: string;
  bonus_type: string;
  description: string;
  amount: string;
  created_at: string;
};

type DeductionForm = {
  discord_id: string;
  amount: string;
  description: string;
  created_at: string;
};

type PayForm = {
  discord_id: string;
  start_date: string;
  end_date: string;
};

function getTodayInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function getNowInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function getMonthStartInput() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const offset = start.getTimezoneOffset();
  const local = new Date(start.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function dateToStartIso(value: string) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toISOString();
}

function dateToEndIso(value: string) {
  if (!value) return null;
  return new Date(`${value}T23:59:59`).toISOString();
}

function datetimeToIso(value: string) {
  if (!value) return new Date().toISOString();
  return new Date(value).toISOString();
}

function money(value: number | string | null | undefined) {
  return `$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("zh-TW", {
    hour12: true,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDisplayStaffName(staff?: Staff | null) {
  if (!staff) return "未知員工";

  return (
    staff.display_name ||
    staff.real_name ||
    staff.discord_name ||
    staff.discord_id ||
    "未知員工"
  );
}

function getStaffNameByDiscordId(staffList: Staff[], discordId: string) {
  const staff = staffList.find((item) => item.discord_id === discordId);
  return getDisplayStaffName(staff);
}

function getManualCommissionRate(tier?: string | null) {
  if (tier === "rate_80") return 80;
  if (tier === "rate_85") return 85;
  if (tier === "rate_90") return 90;
  if (tier === "manager_95") return 95;
  return null;
}

function getTaipeiMonthText(date = new Date()) {
  const taipeiDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return taipeiDate.toISOString().slice(0, 7);
}

function getNextMonthTextFromIso(isoText?: string | null) {
  if (!isoText) return "";

  const date = new Date(isoText);
  const taipeiDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);

  const year = taipeiDate.getUTCFullYear();
  const month = taipeiDate.getUTCMonth();

  const next = new Date(Date.UTC(year, month + 1, 1));
  return next.toISOString().slice(0, 7);
}

function getOrderSourceDate(order: SalaryOrder) {
  return order.order_finished_at || order.completed_at || order.created_at || null;
}

function getStaffTotalOrderAmountBeforeDate(
  orderList: SalaryOrder[],
  discordId: string,
  beforeIso: string
) {
  const beforeDate = new Date(beforeIso);

  return orderList
    .filter((order) => order.discord_id === discordId)
    .filter((order) => {
      const sourceDate = getOrderSourceDate(order);
      if (!sourceDate) return false;
      return new Date(sourceDate) < beforeDate;
    })
    .reduce((sum, order) => sum + getOrderAmount(order), 0);
}

function getStaffYearSalaryTotal(
  orderList: SalaryOrder[],
  discordId: string,
  year: number
) {
  return orderList
    .filter((order) => order.discord_id === discordId)
    .filter((order) => {
      const sourceDate = getOrderSourceDate(order);
      if (!sourceDate) return false;
      return new Date(sourceDate).getFullYear() === year;
    })
    .reduce((sum, order) => sum + Number(order.staff_salary || 0), 0);
}

function getFirstReachAmountDate(
  orderList: SalaryOrder[],
  discordId: string,
  targetAmount: number
) {
  const sortedOrders = orderList
    .filter((order) => order.discord_id === discordId)
    .filter((order) => order.is_deleted !== true)
    .sort((a, b) => {
      const aDate = getOrderSourceDate(a);
      const bDate = getOrderSourceDate(b);

      return new Date(aDate || 0).getTime() - new Date(bDate || 0).getTime();
    });

  let total = 0;

  for (const order of sortedOrders) {
    total += getOrderAmount(order);

    if (total >= targetAmount) {
      return getOrderSourceDate(order);
    }
  }

  return null;
}

function getStaffRate(
  staff: Staff | null | undefined,
  finishedAtInput?: string,
  orderList: SalaryOrder[] = []
) {
  const finishedAt = datetimeToIso(finishedAtInput || getNowInput());
  const finishedDate = new Date(finishedAt);
  const openingEnd = new Date("2026-09-01T00:00:00+08:00");
  const manualRate = getManualCommissionRate(staff?.commission_tier);

  if (manualRate) {
    return manualRate;
  }

  if (finishedDate < openingEnd) {
    return 90;
  }

  const discordId = staff?.discord_id;

  if (!discordId) {
    return 80;
  }

  const previousYear = finishedDate.getFullYear() - 1;
  const previousYearSalary = getStaffYearSalaryTotal(
    orderList,
    discordId,
    previousYear
  );

  if (previousYearSalary >= 100000) {
    return 90;
  }

  const firstReach10kDate = getFirstReachAmountDate(orderList, discordId, 10000);

  if (firstReach10kDate) {
    const reachNextMonth = getNextMonthTextFromIso(firstReach10kDate);
    const orderMonth = getTaipeiMonthText(finishedDate);

    if (orderMonth >= reachNextMonth) {
      return 85;
    }
  }

  return 80;
}

function getOrderAmount(order: SalaryOrder) {
  return Number(order.order_amount ?? order.price ?? 0);
}

function getOrderService(order: SalaryOrder) {
  return order.service_name || order.service || "-";
}

function getOrderCustomer(order: SalaryOrder) {
  return order.customer_name || order.customer_id || "-";
}

function getDiscordIdFromSession(session: any) {
  const user = session?.user;
  const metadata = user?.user_metadata || {};

  return String(
    metadata.provider_id ||
      metadata.sub ||
      metadata.user_id ||
      user?.identities?.[0]?.identity_data?.sub ||
      user?.identities?.[0]?.identity_data?.id ||
      ""
  ).trim();
}

export default function AdminSalaryPage() {
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [orders, setOrders] = useState<SalaryOrder[]>([]);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [keyword, setKeyword] = useState("");
  const [filterStaffId, setFilterStaffId] = useState("all");
  const [startDate, setStartDate] = useState(getMonthStartInput());
  const [endDate, setEndDate] = useState(getTodayInput());
  const [savingOrder, setSavingOrder] = useState(false);
  const [savingBonus, setSavingBonus] = useState(false);
  const [savingDeduction, setSavingDeduction] = useState(false);
  const [paying, setPaying] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  const [orderForm, setOrderForm] = useState<OrderForm>({
    discord_id: "",
    service_name: "",
    order_amount: "",
    salary_rate: "90",
    bonus_amount: "0",
    order_finished_at: getNowInput(),
    status: "未發薪",
  });

  const [bonusForm, setBonusForm] = useState<BonusForm>({
    discord_id: "",
    bonus_type: "",
    description: "",
    amount: "",
    created_at: getNowInput(),
  });

  const [deductionForm, setDeductionForm] = useState<DeductionForm>({
    discord_id: "",
    amount: "",
    description: "",
    created_at: getNowInput(),
  });

  const [payForm, setPayForm] = useState<PayForm>({
    discord_id: "all",
    start_date: getMonthStartInput(),
    end_date: getTodayInput(),
  });

  const filteredOrders = useMemo(() => {
    const key = keyword.trim().toLowerCase();

    if (!key) return orders;

    return orders.filter((order) => {
      const text = [
        order.order_no,
        order.order_id,
        order.discord_id,
        order.staff_name,
        order.customer_name,
        order.customer_id,
        order.service_name,
        order.service,
        order.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(key);
    });
  }, [orders, keyword]);

  const filteredBonuses = useMemo(() => {
    const key = keyword.trim().toLowerCase();

    if (!key) return bonuses;

    return bonuses.filter((bonus) => {
      const text = [
        bonus.discord_id,
        bonus.staff_name,
        bonus.bonus_type,
        bonus.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(key);
    });
  }, [bonuses, keyword]);

  const totalIncome = useMemo(() => {
    return orders.reduce((sum, order) => sum + getOrderAmount(order), 0);
  }, [orders]);

  const totalSalary = useMemo(() => {
    return orders.reduce((sum, order) => sum + Number(order.staff_salary || 0), 0);
  }, [orders]);

  const totalBonus = useMemo(() => {
    const orderBonus = orders.reduce(
      (sum, order) => sum + Number(order.bonus_amount || 0),
      0
    );

    const extraBonus = bonuses.reduce(
      (sum, bonus) => sum + Number(bonus.amount || 0),
      0
    );

    return orderBonus + extraBonus;
  }, [orders, bonuses]);

  const totalExpense = totalSalary + totalBonus;

  const unpaidTotal = useMemo(() => {
    const orderUnpaid = orders
      .filter((order) => order.status !== "已發薪")
      .reduce(
        (sum, order) =>
          sum +
          Number(order.staff_salary || 0) +
          Number(order.bonus_amount || 0),
        0
      );

    const bonusTotal = bonuses.reduce(
      (sum, bonus) => sum + Number(bonus.amount || 0),
      0
    );

    return orderUnpaid + bonusTotal;
  }, [orders, bonuses]);

  useEffect(() => {
    boot();
  }, []);

  async function boot() {
    setChecking(true);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        window.location.href = "/admin-login";
        return;
      }

      const discordId = getDiscordIdFromSession(session);

      if (!discordId) {
        alert("無法取得 Discord ID，請重新登入。");
        await supabase.auth.signOut();
        window.location.href = "/admin-login";
        return;
      }

      const { data: admin, error } = await supabase
        .from("admins")
        .select("*")
        .eq("discord_id", discordId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) {
        console.error("check admin error:", error);
        alert("檢查後台權限失敗");
        window.location.href = "/staff";
        return;
      }

      if (!admin) {
        alert("你沒有後台管理權限");
        window.location.href = "/staff";
        return;
      }

      await loadAll();
    } catch (error) {
      console.error("admin salary boot error:", error);
      alert("檢查後台權限失敗");
      window.location.href = "/staff";
    } finally {
      setChecking(false);
    }
  }

  async function loadAll() {
    setLoading(true);

    await Promise.all([loadStaff(), loadSalaryData()]);

    setLoading(false);
  }

  async function loadStaff() {
    const { data, error } = await supabase
      .from("players")
      .select(
        "id, discord_id, discord_name, display_name, real_name, is_active, commission_tier, commission_note"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("load staff error:", error);
      alert("讀取員工資料失敗");
      return;
    }

    setStaffList((data || []) as Staff[]);
  }

  async function loadSalaryData() {
    const startIso = dateToStartIso(startDate);
    const endIso = dateToEndIso(endDate);

    let orderQuery = supabase
      .from("play_orders")
      .select("*")
      .or(DEEPNIGHT_PLAY_ORDER_FILTER)
      .or("is_deleted.eq.false,is_deleted.is.null")
      .order("order_finished_at", { ascending: false });

    if (startIso) {
      orderQuery = orderQuery.gte("order_finished_at", startIso);
    }

    if (endIso) {
      orderQuery = orderQuery.lte("order_finished_at", endIso);
    }

    if (filterStaffId !== "all") {
      orderQuery = orderQuery.eq("discord_id", filterStaffId);
    }

    const { data: orderData, error: orderError } = await orderQuery;

    if (orderError) {
      console.error("load salary orders error:", orderError);
      setOrders([]);
    } else {
      setOrders((orderData || []) as SalaryOrder[]);
    }

    let bonusQuery = supabase
      .from("players_bonus")
      .select("*")
      .order("created_at", { ascending: false });

    if (startIso) {
      bonusQuery = bonusQuery.gte("created_at", startIso);
    }

    if (endIso) {
      bonusQuery = bonusQuery.lte("created_at", endIso);
    }

    if (filterStaffId !== "all") {
      bonusQuery = bonusQuery.eq("discord_id", filterStaffId);
    }

    const { data: bonusData, error: bonusError } = await bonusQuery;

    if (bonusError) {
      console.error("load bonus error:", bonusError);
      setBonuses([]);
    } else {
      setBonuses((bonusData || []) as Bonus[]);
    }
  }

  function updateOrderForm<K extends keyof OrderForm>(
    key: K,
    value: OrderForm[K]
  ) {
    setOrderForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function updateBonusForm<K extends keyof BonusForm>(
    key: K,
    value: BonusForm[K]
  ) {
    setBonusForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function updateDeductionForm<K extends keyof DeductionForm>(
    key: K,
    value: DeductionForm[K]
  ) {
    setDeductionForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function resetOrderForm() {
    setEditingOrderId(null);
    setOrderForm({
      discord_id: "",
      service_name: "",
      order_amount: "",
      salary_rate: "90",
      bonus_amount: "0",
      order_finished_at: getNowInput(),
      status: "未發薪",
    });
  }

  function editOrder(order: SalaryOrder) {
    setEditingOrderId(order.id);
    setOrderForm({
      discord_id: order.discord_id || "",
      service_name: getOrderService(order) === "-" ? "" : getOrderService(order),
      order_amount: String(getOrderAmount(order) || ""),
      salary_rate: String(
        getStaffRate(staffList.find((item) => item.discord_id === order.discord_id))
      ),
      bonus_amount: String(order.bonus_amount || 0),
      order_finished_at: order.order_finished_at
        ? new Date(order.order_finished_at).toISOString().slice(0, 16)
        : getNowInput(),
      status: order.status || "未發薪",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function saveOrder() {
    if (!orderForm.discord_id) {
      alert("請選擇員工");
      return;
    }

    const orderAmount = Number(orderForm.order_amount || 0);
    const bonusAmount = Number(orderForm.bonus_amount || 0);

    if (orderAmount <= 0 || Number.isNaN(orderAmount)) {
      alert("請輸入正確訂單金額");
      return;
    }

    if (Number.isNaN(bonusAmount)) {
      alert("請輸入正確訂單獎金");
      return;
    }

    const selectedStaff = staffList.find(
      (item) => item.discord_id === orderForm.discord_id
    );

    const salaryRate = getStaffRate(
      selectedStaff,
      orderForm.order_finished_at,
      orders
    );

    const staffName = getStaffNameByDiscordId(staffList, orderForm.discord_id);
    const staffSalary = Math.round(orderAmount * (salaryRate / 100));
    const finishedAt = datetimeToIso(orderForm.order_finished_at);
    const manualOrderNo = `MANUAL-${Date.now()}`;

    setSavingOrder(true);

    if (editingOrderId) {
      const { error } = await supabase
        .from("play_orders")
        .update({
          discord_id: orderForm.discord_id,
          staff_name: staffName,
          assigned_player: orderForm.discord_id,
          service_name: orderForm.service_name || null,
          service: orderForm.service_name || null,
          order_amount: orderAmount,
          price: orderAmount,
          completed_at: finishedAt,
          staff_salary: staffSalary,
          bonus_amount: bonusAmount,
          salary_rate: salaryRate,
          salary_level: `${salaryRate}%`,
          platform_income: orderAmount,
          platform_expense: staffSalary + bonusAmount,
          status: orderForm.status || "未發薪",
          order_finished_at: finishedAt,
        })
        .eq("id", editingOrderId)
        .or(DEEPNIGHT_PLAY_ORDER_FILTER);

      setSavingOrder(false);

      if (error) {
        console.error("update order error:", error);
        alert(
          "更新訂單失敗：\n" +
            (error.message || "未知錯誤") +
            "\n\n請把這段錯誤貼給我。"
        );
        return;
      }

      alert("訂單已更新");
      resetOrderForm();
      await loadSalaryData();
      return;
    }

   const payload = {
      guild_id: DEEPNIGHT_GUILD_ID,
      order_id: manualOrderNo,
      order_no: manualOrderNo,
      discord_id: orderForm.discord_id,
      staff_name: staffName,
      assigned_player: orderForm.discord_id,
      customer_id: "manual",
      customer_name: "手動新增",
      service_name: orderForm.service_name || null,
      service: orderForm.service_name || null,
      order_amount: orderAmount,
      price: orderAmount,
      staff_salary: staffSalary,
      bonus_amount: bonusAmount,
      salary_rate: salaryRate,
      salary_level: `${salaryRate}%`,
      platform_income: orderAmount,
      platform_expense: staffSalary + bonusAmount,
      status: orderForm.status || "未發薪",
      order_finished_at: finishedAt,
      completed_at: finishedAt,
      created_at: finishedAt,
      is_deleted: false,
    };

    const { error } = await supabase.from("play_orders").insert(payload);

    setSavingOrder(false);

    if (error) {
      console.error("insert order error:", error, payload);
      alert(
        "新增訂單失敗：\n" +
          (error.message || "未知錯誤") +
          "\n\n請把這段錯誤貼給我。"
      );
      return;
    }

    alert(`訂單已新增\n抽成：${salaryRate}%\n薪資：${staffSalary}`);
    resetOrderForm();
    await loadSalaryData();
  }

  async function saveBonus() {
    if (!bonusForm.discord_id) {
      alert("請選擇員工");
      return;
    }

    const amount = Number(bonusForm.amount || 0);

    if (amount <= 0) {
      alert("請輸入獎金金額");
      return;
    }

    const staffName = getStaffNameByDiscordId(staffList, bonusForm.discord_id);
    const createdAt = datetimeToIso(bonusForm.created_at);

    setSavingBonus(true);

    const { error } = await supabase.from("players_bonus").insert({
      discord_id: bonusForm.discord_id,
      staff_name: staffName,
      bonus_type: bonusForm.bonus_type || null,
      description: bonusForm.description || null,
      amount,
      created_at: createdAt,
    });

    setSavingBonus(false);

    if (error) {
      console.error("insert bonus error:", error);
      alert("新增獎金失敗");
      return;
    }

    alert("獎金已新增");
    setBonusForm({
      discord_id: "",
      bonus_type: "",
      description: "",
      amount: "",
      created_at: getNowInput(),
    });
    await loadSalaryData();
  }

  async function saveDeduction() {
    if (!deductionForm.discord_id) {
      alert("請選擇員工");
      return;
    }

    const amount = Number(deductionForm.amount || 0);

    if (amount <= 0) {
      alert("請輸入扣除金額");
      return;
    }

    if (!deductionForm.description.trim()) {
      alert("請填寫扣除備註");
      return;
    }

    const staffName = getStaffNameByDiscordId(
      staffList,
      deductionForm.discord_id
    );
    const createdAt = datetimeToIso(deductionForm.created_at);

    setSavingDeduction(true);

    const { error } = await supabase.from("players_bonus").insert({
      discord_id: deductionForm.discord_id,
      staff_name: staffName,
      bonus_type: "薪水扣除",
      description: deductionForm.description.trim(),
      amount: -Math.abs(amount),
      created_at: createdAt,
    });

    setSavingDeduction(false);

    if (error) {
      console.error("insert salary deduction error:", error);
      alert("新增薪水扣除失敗");
      return;
    }

    alert("薪水扣除已新增");
    setDeductionForm({
      discord_id: "",
      amount: "",
      description: "",
      created_at: getNowInput(),
    });
    await loadSalaryData();
  }

  async function markOrderPaid(order: SalaryOrder) {
    const ok = confirm(
      `確定要將「${order.staff_name || order.discord_id}」這筆訂單標記為已發薪嗎？`
    );

    if (!ok) return;

    const { error } = await supabase
      .from("play_orders")
      .update({
        status: "已發薪",
      })
      .eq("id", order.id)
      .or(DEEPNIGHT_PLAY_ORDER_FILTER);

    if (error) {
      console.error("mark paid error:", error);
      alert("標記發薪失敗");
      return;
    }

    await loadSalaryData();
  }

  async function deleteOrder(order: SalaryOrder) {
    const ok = confirm("確定要刪除這筆訂單嗎？");

    if (!ok) return;

    const { error } = await supabase
      .from("play_orders")
      .update({
        is_deleted: true,
      })
      .eq("id", order.id)
      .or(DEEPNIGHT_PLAY_ORDER_FILTER);

    if (error) {
      console.error("delete order error:", error);
      alert("刪除訂單失敗");
      return;
    }

    await loadSalaryData();
  }

  async function bulkMarkPaid() {
    const startIso = dateToStartIso(payForm.start_date);
    const endIso = dateToEndIso(payForm.end_date);

    if (!startIso || !endIso) {
      alert("請選擇發薪時間範圍");
      return;
    }

    const label =
      payForm.discord_id === "all"
        ? "全部員工"
        : getStaffNameByDiscordId(staffList, payForm.discord_id);

    const ok = confirm(
      `確定要將「${label}」在指定時間內的未發薪訂單全部標記為已發薪嗎？`
    );

    if (!ok) return;

    setPaying(true);

    let query = supabase
      .from("play_orders")
      .update({
        status: "已發薪",
      })
      .or(DEEPNIGHT_PLAY_ORDER_FILTER)
      .gte("order_finished_at", startIso)
      .lte("order_finished_at", endIso)
      .neq("status", "已發薪");

    if (payForm.discord_id !== "all") {
      query = query.eq("discord_id", payForm.discord_id);
    }

    const { error } = await query;

    setPaying(false);

    if (error) {
      console.error("bulk pay error:", error);
      alert("批次發薪失敗");
      return;
    }

    alert("批次發薪完成");
    await loadSalaryData();
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef7fd]">
        <div className="rounded-[28px] border border-sky-100 bg-white px-8 py-7 text-center shadow-sm shadow-sky-100">
          <Loader2 className="mx-auto animate-spin text-sky-500" size={34} />
          <p className="mt-4 text-sm font-semibold text-slate-600">
            正在檢查後台權限...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef7fd] px-5 py-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-[30px] border border-sky-100 bg-white px-6 py-5 shadow-sm shadow-sky-100">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 text-sm font-bold text-sky-600 hover:text-sky-700"
              >
                <ArrowLeft size={16} />
                回管理後台
              </Link>

              <p className="mt-4 text-sm font-bold text-sky-600">
                DeepNight Admin
              </p>

              <h1 className="mt-1 text-2xl font-black text-slate-900 md:text-3xl">
                薪資總表
              </h1>

              <p className="mt-2 text-sm text-slate-500">
                管理訂單薪資、獎金、收入支出與批次發薪。
              </p>
            </div>

            <button
              onClick={loadAll}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-sky-200 hover:bg-sky-600 disabled:opacity-60"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              重新整理
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard title="總收入" value={money(totalIncome)} />
          <StatCard title="薪資支出" value={money(totalSalary)} />
          <StatCard title="獎金 / 扣除" value={money(totalBonus)} />
          <StatCard title="未發薪" value={money(unpaidTotal)} />
        </section>

        <section className="rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100">
          <div className="grid gap-4 md:grid-cols-5">
            <Field label="開始日期">
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </Field>

            <Field label="結束日期">
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </Field>

            <Field label="員工">
              <select
                value={filterStaffId}
                onChange={(event) => setFilterStaffId(event.target.value)}
              >
                <option value="all">全部員工</option>
                {staffList.map((staff) => (
                  <option key={staff.id} value={staff.discord_id}>
                    {getDisplayStaffName(staff)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="搜尋">
              <div className="flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/60 px-3">
                <Search size={16} className="text-sky-500" />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜尋訂單、員工、服務"
                  className="min-h-0 flex-1 border-none bg-transparent p-0 focus:shadow-none"
                />
              </div>
            </Field>

            <div className="flex items-end">
              <button
                onClick={loadSalaryData}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-600"
              >
                <CalendarDays size={16} />
                查詢
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                  <Plus size={20} className="text-sky-500" />
                  {editingOrderId ? "編輯訂單" : "新增訂單"}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  可手動補登訂單，薪資會依抽成比例自動計算。
                </p>
              </div>

              {editingOrderId ? (
                <button
                  onClick={resetOrderForm}
                  className="rounded-full border border-sky-100 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-sky-50"
                >
                  取消編輯
                </button>
              ) : null}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="員工">
                <select
                  value={orderForm.discord_id}
                  onChange={(event) =>
                    updateOrderForm("discord_id", event.target.value)
                  }
                >
                  <option value="">選擇員工</option>
                  {staffList.map((staff) => (
                    <option key={staff.id} value={staff.discord_id}>
                      {getDisplayStaffName(staff)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="服務名稱">
                <input
                  value={orderForm.service_name}
                  onChange={(event) =>
                    updateOrderForm("service_name", event.target.value)
                  }
                  placeholder="例如：娛樂陪玩"
                />
              </Field>

              <Field label="訂單金額">
                <input
                  type="number"
                  value={orderForm.order_amount}
                  onChange={(event) =>
                    updateOrderForm("order_amount", event.target.value)
                  }
                  placeholder="例如：1000"
                />
              </Field>

              <Field label="員工抽成">
                <div className="flex min-h-[40px] items-center rounded-xl border border-sky-100 bg-sky-50/60 px-3 text-sm font-black text-sky-700">
                  {orderForm.discord_id
                    ? `${getStaffRate(
                        staffList.find((item) => item.discord_id === orderForm.discord_id),
                        orderForm.order_finished_at,
                        orders
                      )}%`
                    : "請先選擇員工"}
                </div>
              </Field>

              <Field label="訂單獎金">
                <input
                  type="number"
                  value={orderForm.bonus_amount}
                  onChange={(event) =>
                    updateOrderForm("bonus_amount", event.target.value)
                  }
                  placeholder="沒有則填 0"
                />
              </Field>

              <Field label="完成時間">
                <input
                  type="datetime-local"
                  value={orderForm.order_finished_at}
                  onChange={(event) =>
                    updateOrderForm("order_finished_at", event.target.value)
                  }
                />
              </Field>

              <Field label="狀態">
                <select
                  value={orderForm.status}
                  onChange={(event) =>
                    updateOrderForm("status", event.target.value)
                  }
                >
                  <option value="未發薪">未發薪</option>
                  <option value="已發薪">已發薪</option>
                  <option value="completed">completed</option>
                  <option value="accepted">accepted</option>
                </select>
              </Field>

              <div className="flex items-end">
                <button
                  onClick={saveOrder}
                  disabled={savingOrder}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-sky-500 px-5 py-3 text-sm font-bold text-white hover:bg-sky-600 disabled:opacity-60"
                >
                  <Save size={16} />
                  {savingOrder
                    ? "儲存中..."
                    : editingOrderId
                      ? "更新訂單"
                      : "新增訂單"}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100">
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                <Gift size={20} className="text-sky-500" />
                新增獎金
              </h2>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="員工">
                  <select
                    value={bonusForm.discord_id}
                    onChange={(event) =>
                      updateBonusForm("discord_id", event.target.value)
                    }
                  >
                    <option value="">選擇員工</option>
                    {staffList.map((staff) => (
                      <option key={staff.id} value={staff.discord_id}>
                        {getDisplayStaffName(staff)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="獎金類型">
                  <input
                    value={bonusForm.bonus_type}
                    onChange={(event) =>
                      updateBonusForm("bonus_type", event.target.value)
                    }
                    placeholder="例如：活動獎金"
                  />
                </Field>

                <Field label="獎金金額">
                  <input
                    type="number"
                    value={bonusForm.amount}
                    onChange={(event) =>
                      updateBonusForm("amount", event.target.value)
                    }
                    placeholder="例如：300"
                  />
                </Field>

                <Field label="建立時間">
                  <input
                    type="datetime-local"
                    value={bonusForm.created_at}
                    onChange={(event) =>
                      updateBonusForm("created_at", event.target.value)
                    }
                  />
                </Field>

                <div className="md:col-span-2">
                  <Field label="說明">
                    <textarea
                      value={bonusForm.description}
                      onChange={(event) =>
                        updateBonusForm("description", event.target.value)
                      }
                      placeholder="可填寫獎金原因"
                    />
                  </Field>
                </div>

                <div className="md:col-span-2">
                  <button
                    onClick={saveBonus}
                    disabled={savingBonus}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-sky-500 px-5 py-3 text-sm font-bold text-white hover:bg-sky-600 disabled:opacity-60"
                  >
                    <Save size={16} />
                    {savingBonus ? "儲存中..." : "新增獎金"}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-red-100 bg-white p-5 shadow-sm shadow-red-100">
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                <MinusCircle size={20} className="text-red-500" />
                新增薪水扣除
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                扣除金額會以負數列入薪資明細。
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="員工">
                  <select
                    value={deductionForm.discord_id}
                    onChange={(event) =>
                      updateDeductionForm("discord_id", event.target.value)
                    }
                  >
                    <option value="">選擇員工</option>
                    {staffList.map((staff) => (
                      <option key={staff.id} value={staff.discord_id}>
                        {getDisplayStaffName(staff)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="扣除金額">
                  <input
                    type="number"
                    min="1"
                    value={deductionForm.amount}
                    onChange={(event) =>
                      updateDeductionForm("amount", event.target.value)
                    }
                    placeholder="例如：300"
                  />
                </Field>

                <Field label="扣除時間">
                  <input
                    type="datetime-local"
                    value={deductionForm.created_at}
                    onChange={(event) =>
                      updateDeductionForm("created_at", event.target.value)
                    }
                  />
                </Field>

                <div className="md:col-span-2">
                  <Field label="備註">
                    <textarea
                      value={deductionForm.description}
                      onChange={(event) =>
                        updateDeductionForm("description", event.target.value)
                      }
                      placeholder="例如：遲到、請假扣款、手動修正"
                    />
                  </Field>
                </div>

                <div className="md:col-span-2">
                  <button
                    onClick={saveDeduction}
                    disabled={savingDeduction}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-red-500 px-5 py-3 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-60"
                  >
                    <Save size={16} />
                    {savingDeduction ? "儲存中..." : "新增扣除"}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100">
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                <CheckCircle2 size={20} className="text-sky-500" />
                批次發薪
              </h2>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <Field label="員工">
                  <select
                    value={payForm.discord_id}
                    onChange={(event) =>
                      setPayForm((prev) => ({
                        ...prev,
                        discord_id: event.target.value,
                      }))
                    }
                  >
                    <option value="all">全部員工</option>
                    {staffList.map((staff) => (
                      <option key={staff.id} value={staff.discord_id}>
                        {getDisplayStaffName(staff)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="開始">
                  <input
                    type="date"
                    value={payForm.start_date}
                    onChange={(event) =>
                      setPayForm((prev) => ({
                        ...prev,
                        start_date: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label="結束">
                  <input
                    type="date"
                    value={payForm.end_date}
                    onChange={(event) =>
                      setPayForm((prev) => ({
                        ...prev,
                        end_date: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>

              <button
                onClick={bulkMarkPaid}
                disabled={paying}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
              >
                <CheckCircle2 size={16} />
                {paying ? "處理中..." : "將指定範圍標記為已發薪"}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-sky-100 bg-white shadow-sm shadow-sky-100">
          <div className="border-b border-sky-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
              <WalletCards size={20} className="text-sky-500" />
              訂單薪資列表
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              目前顯示 {filteredOrders.length} 筆訂單。
            </p>
          </div>

          {loading ? (
            <div className="px-5 py-12 text-center text-sm font-semibold text-slate-400">
              讀取中...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm font-semibold text-slate-400">
              沒有符合條件的訂單
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>完成時間</th>
                    <th>員工</th>
                    <th>客人</th>
                    <th>服務</th>
                    <th>訂單金額</th>
                    <th>抽成</th>
                    <th>薪資</th>
                    <th>獎金</th>
                    <th>狀態</th>
                    <th>操作</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        {formatDateTime(
                          order.order_finished_at ||
                            order.completed_at ||
                            order.created_at
                        )}
                      </td>
                      <td>
                        <p className="font-bold text-slate-800">
                          {order.staff_name || order.discord_id}
                        </p>
                        <p className="text-xs text-slate-400">
                          {order.discord_id}
                        </p>
                      </td>
                      <td>{getOrderCustomer(order)}</td>
                      <td>{getOrderService(order)}</td>
                      <td className="font-bold text-slate-700">
                        {money(getOrderAmount(order))}
                      </td>
                      <td>{order.salary_rate || "-"}%</td>
                      <td className="font-bold text-sky-600">
                        {money(order.staff_salary)}
                      </td>
                      <td>{money(order.bonus_amount)}</td>
                      <td>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            order.status === "已發薪"
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-amber-50 text-amber-600"
                          }`}
                        >
                          {order.status || "未發薪"}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => editOrder(order)}
                            className="rounded-full border border-sky-100 bg-white px-3 py-1.5 text-xs font-bold text-sky-600 hover:bg-sky-50"
                          >
                            <Edit3 size={14} />
                          </button>

                          {order.status !== "已發薪" ? (
                            <button
                              onClick={() => markOrderPaid(order)}
                              className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-600 hover:bg-emerald-100"
                            >
                              <CheckCircle2 size={14} />
                            </button>
                          ) : null}

                          <button
                            onClick={() => deleteOrder(order)}
                            className="rounded-full border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-sky-100 bg-white shadow-sm shadow-sky-100">
          <div className="border-b border-sky-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
              <BadgeDollarSign size={20} className="text-sky-500" />
              獎金 / 扣除列表
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              目前顯示 {filteredBonuses.length} 筆獎金 / 扣除。
            </p>
          </div>

          {filteredBonuses.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm font-semibold text-slate-400">
              沒有符合條件的獎金或扣除
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>時間</th>
                    <th>員工</th>
                    <th>類型</th>
                    <th>說明</th>
                    <th>金額</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredBonuses.map((bonus) => (
                    <tr key={bonus.id}>
                      <td>{formatDateTime(bonus.created_at)}</td>
                      <td>
                        <p className="font-bold text-slate-800">
                          {bonus.staff_name || bonus.discord_id}
                        </p>
                        <p className="text-xs text-slate-400">
                          {bonus.discord_id}
                        </p>
                      </td>
                      <td>{bonus.bonus_type || "-"}</td>
                      <td>{bonus.description || "-"}</td>
                      <td
                        className={`font-bold ${
                          Number(bonus.amount || 0) < 0
                            ? "text-red-500"
                            : "text-sky-600"
                        }`}
                      >
                        {money(bonus.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100">
      <p className="text-sm font-bold text-sky-600">{title}</p>
      <p className="mt-3 text-2xl font-black text-slate-900">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-600">
        {label}
      </span>

      {children}
    </label>
  );
}
