import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dashboardService,
  type DashboardOrder,
} from "@/services/dashboard";
import {
  ORDER_STATE_LABELS,
  ORDER_TYPE_LABELS,
  type OrderState,
  type OrderType,
} from "@/services/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Hourglass,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import type { TabType } from "@/components/Sidebar";

// ---------- formatting ----------

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const idrCompact = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  notation: "compact",
  maximumFractionDigits: 1,
});
const quantity = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

const formatIDR = (n: number) => idr.format(n);
const formatCompactIDR = (n: number) => idrCompact.format(n);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (iso: string, now: Date): string => {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS);
  if (days <= 0) return "Hari ini";
  return `${days} hari lalu`;
};

// ---------- periods ----------

type PeriodKey = "month" | "3m" | "6m" | "year" | "all";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "month", label: "Bulan ini" },
  { key: "3m", label: "3 bulan terakhir" },
  { key: "6m", label: "6 bulan terakhir" },
  { key: "year", label: "Tahun ini" },
  { key: "all", label: "Semua waktu" },
];

const startOfMonth = (d: Date, monthsBack = 0) =>
  new Date(d.getFullYear(), d.getMonth() - monthsBack, 1);

const periodStart = (key: PeriodKey, now: Date): Date | null => {
  switch (key) {
    case "month":
      return startOfMonth(now);
    case "3m":
      return startOfMonth(now, 2);
    case "6m":
      return startOfMonth(now, 5);
    case "year":
      return new Date(now.getFullYear(), 0, 1);
    default:
      return null;
  }
};

// ---------- presentation ----------

const STATE_COLOR: Record<OrderState, string> = {
  submitted: "#3b82f6",
  completed: "#16a34a",
  cancelled: "#ef4444",
};

const STATE_VARIANT: Record<OrderState, "info" | "success" | "destructive"> = {
  submitted: "info",
  completed: "success",
  cancelled: "destructive",
};

const TYPE_COLOR: Record<OrderType, string> = {
  bunker_fuel: "var(--chart-1)",
  bunker_water: "var(--chart-3)",
  logistic: "var(--chart-4)",
};

interface KpiCardProps {
  title: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  tone?: "default" | "alert";
}

const KpiCard = ({ title, value, sub, icon: Icon, tone }: KpiCardProps) => (
  <Card>
    <CardContent className="flex items-start justify-between gap-3 p-5">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="truncate text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <span
        className={
          tone === "alert"
            ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"
            : "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
        }
      >
        <Icon className="h-4.5 w-4.5" />
      </span>
    </CardContent>
  </Card>
);

interface PanelProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

const Panel = ({
  title,
  description,
  action,
  className,
  children,
}: PanelProps) => (
  <Card className={className}>
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div className="space-y-1.5">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </div>
      {action}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="py-10 text-center text-sm text-muted-foreground">{children}</p>
);

interface RankItem {
  key: string | number;
  name: string;
  value: number;
  hint: string;
}

const RankList = ({ items }: { items: RankItem[] }) => {
  if (items.length === 0) return <Empty>Belum ada data pada periode ini.</Empty>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ol className="space-y-3.5">
      {items.map((item, index) => (
        <li key={item.key} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="w-4 shrink-0 text-xs text-muted-foreground">
                {index + 1}
              </span>
              <span className="truncate font-medium">{item.name}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {formatCompactIDR(item.value)}
            </span>
          </div>
          <div className="flex items-center gap-2 pl-6">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
              {item.hint}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
};

// ---------- aggregation ----------

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

interface OverviewProps {
  onNavigate?: (tab: TabType) => void;
}

const OverviewPage = ({ onNavigate }: OverviewProps) => {
  const [orders, setOrders] = useState<DashboardOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("6m");

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrders(await dashboardService.getOrders());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat dashboard");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const now = useMemo(() => new Date(), []);

  const data = useMemo(() => {
    if (!orders) return null;
    const start = periodStart(period, now);
    const inPeriod = orders.filter(
      (o) => !start || new Date(o.date_order) >= start,
    );
    const live = inPeriod.filter((o) => o.state !== "cancelled");
    const completed = inPeriod.filter((o) => o.state === "completed");
    const cancelled = inPeriod.filter((o) => o.state === "cancelled");

    // Completed orders: what was delivered against what was ordered (both
    // before discount and VAT, so the two sides are comparable).
    const completedLines = completed.flatMap((o) => o.lines);
    const orderedValue = sum(completedLines.map((l) => l.price_subtotal));
    const actualValue = sum(completedLines.map((l) => l.actual_subtotal ?? 0));

    // Everything still open, regardless of the period.
    const open = orders
      .filter((o) => o.state === "submitted")
      .map((o) => ({
        order: o,
        overdue: !!o.date_bunker && new Date(o.date_bunker) < now,
      }))
      .sort(
        (a, b) =>
          Number(b.overdue) - Number(a.overdue) ||
          new Date(a.order.date_order).getTime() -
            new Date(b.order.date_order).getTime(),
      );

    // Monthly trend: one bucket per month of the period.
    const firstMonth = start
      ? start
      : orders.length
        ? startOfMonth(
            new Date(
              Math.min(...orders.map((o) => new Date(o.date_order).getTime())),
            ),
          )
        : startOfMonth(now);
    const months: {
      key: string;
      label: string;
      submitted: number;
      completed: number;
      cancelled: number;
      value: number;
    }[] = [];
    for (
      let d = new Date(firstMonth);
      d <= now && months.length < 36;
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    ) {
      months.push({
        key: monthKey(d),
        label: d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" }),
        submitted: 0,
        completed: 0,
        cancelled: 0,
        value: 0,
      });
    }
    const bucket = new Map(months.map((m) => [m.key, m]));
    for (const o of inPeriod) {
      const m = bucket.get(monthKey(new Date(o.date_order)));
      if (!m) continue;
      m[o.state] += 1;
      if (o.state !== "cancelled") m.value += o.amount_total;
    }

    const byType = (Object.keys(ORDER_TYPE_LABELS) as OrderType[])
      .map((type) => ({
        type,
        label: ORDER_TYPE_LABELS[type],
        count: live.filter((o) => o.order_type === type).length,
        value: sum(
          live.filter((o) => o.order_type === type).map((o) => o.amount_total),
        ),
      }))
      .filter((t) => t.count > 0);

    const vendors = new Map<
      number,
      { name: string; value: number; count: number }
    >();
    for (const o of live) {
      if (!o.partner) continue;
      const v = vendors.get(o.partner.id) ?? {
        name: o.partner.name,
        value: 0,
        count: 0,
      };
      v.value += o.amount_total;
      v.count += 1;
      vendors.set(o.partner.id, v);
    }

    const vessels = new Map<
      number,
      { name: string; value: number; orders: Set<number> }
    >();
    for (const o of live) {
      for (const l of o.lines) {
        if (!l.vessel) continue;
        const v = vessels.get(l.vessel.id) ?? {
          name: l.vessel.name,
          value: 0,
          orders: new Set<number>(),
        };
        v.value += l.price_subtotal;
        v.orders.add(o.id);
        vessels.set(l.vessel.id, v);
      }
    }

    const products = new Map<
      string,
      { name: string; unit: string; ordered: number; actual: number }
    >();
    for (const l of completedLines) {
      if (!l.product) continue;
      const unit = l.uom?.name ?? "";
      const key = `${l.product.id}|${unit}`;
      const p = products.get(key) ?? {
        name: l.product.name,
        unit,
        ordered: 0,
        actual: 0,
      };
      p.ordered += l.product_qty;
      p.actual += l.actual_qty ?? 0;
      products.set(key, p);
    }

    return {
      inPeriod,
      completed,
      cancelled,
      open,
      liveValue: sum(live.map((o) => o.amount_total)),
      orderedValue,
      actualValue,
      months,
      byType,
      vendors: [...vendors.values()].sort((a, b) => b.value - a.value).slice(0, 5),
      vessels: [...vessels.values()].sort((a, b) => b.value - a.value).slice(0, 5),
      products: [...products.values()]
        .sort((a, b) => b.ordered - a.ordered)
        .slice(0, 6),
      recent: orders.slice(0, 6),
    };
  }, [orders, period, now]);

  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "";

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Coba lagi
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Memuat dashboard...
      </div>
    );
  }

  const total = data.inPeriod.length;
  const overdueCount = data.open.filter((o) => o.overdue).length;
  const fulfilment =
    data.orderedValue > 0
      ? Math.round((data.actualValue / data.orderedValue) * 100)
      : null;
  const cancelRate =
    total > 0 ? Math.round((data.cancelled.length / total) * 100) : 0;
  const typeTotal = sum(data.byType.map((t) => t.value));

  return (
    <div className="space-y-6">
      {/* Period */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Menampilkan PO dengan tanggal PO pada{" "}
          <span className="font-medium text-foreground">
            {periodLabel.toLowerCase()}
          </span>
          . Daftar &quot;Perlu diselesaikan&quot; selalu mencakup semua PO yang
          masih diajukan.
        </p>
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Perlu diselesaikan"
          value={`${data.open.length} PO`}
          sub={
            data.open.length === 0
              ? "Semua PO sudah selesai atau dibatalkan"
              : overdueCount > 0
                ? `${overdueCount} melewati tanggal bunker`
                : "Belum ada yang melewati tanggal bunker"
          }
          icon={Hourglass}
          tone={overdueCount > 0 ? "alert" : "default"}
        />
        <KpiCard
          title="Total PO"
          value={`${total} PO`}
          sub={`${data.completed.length} selesai · ${data.cancelled.length} dibatalkan (${cancelRate}%)`}
          icon={ClipboardList}
        />
        <KpiCard
          title="Nilai PO"
          value={formatCompactIDR(data.liveValue)}
          sub="Tidak termasuk PO dibatalkan, sudah dengan PPN dan diskon"
          icon={CircleDollarSign}
        />
        <KpiCard
          title="Realisasi PO selesai"
          value={formatCompactIDR(data.actualValue)}
          sub={
            fulfilment === null
              ? "Belum ada PO selesai"
              : `${fulfilment}% dari ${formatCompactIDR(data.orderedValue)} yang dipesan`
          }
          icon={ClipboardCheck}
        />
      </div>

      {/* Trend + action list */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          title="Tren bulanan"
          description="Jumlah PO per status (batang) dan nilai PO tanpa yang dibatalkan (garis)"
          className="xl:col-span-2"
        >
          {total === 0 ? (
            <Empty>Belum ada PO pada periode ini.</Empty>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart
                data={data.months}
                margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis
                  yAxisId="count"
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <YAxis
                  yAxisId="value"
                  orientation="right"
                  tickFormatter={(v: number) => formatCompactIDR(v)}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  formatter={(v, name) =>
                    name === "Nilai PO"
                      ? [formatIDR(Number(v)), name]
                      : [`${v} PO`, name]
                  }
                />
                <Legend />
                {(["submitted", "completed", "cancelled"] as OrderState[]).map(
                  (state) => (
                    <Bar
                      key={state}
                      yAxisId="count"
                      stackId="status"
                      dataKey={state}
                      name={ORDER_STATE_LABELS[state]}
                      fill={STATE_COLOR[state]}
                      maxBarSize={44}
                    />
                  ),
                )}
                <Line
                  yAxisId="value"
                  type="monotone"
                  dataKey="value"
                  name="Nilai PO"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel
          title="Perlu diselesaikan"
          description="PO berstatus Diajukan: unggah DO dan isi kuantitas aktual"
          action={
            onNavigate && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => onNavigate("orders")}
              >
                Buka daftar
              </Button>
            )
          }
        >
          {data.open.length === 0 ? (
            <Empty>Tidak ada PO yang menunggu penyelesaian.</Empty>
          ) : (
            <ul className="divide-y">
              {data.open.slice(0, 6).map(({ order, overdue }) => (
                <li
                  key={order.id}
                  className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{order.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {order.partner?.name ?? "-"} ·{" "}
                      {daysAgo(order.date_order, now)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums">
                      {formatCompactIDR(order.amount_total)}
                    </p>
                    {overdue ? (
                      <Badge variant="warning" className="mt-0.5 px-1.5 py-0">
                        Lewat tanggal bunker
                      </Badge>
                    ) : order.date_bunker ? (
                      <p className="text-xs text-muted-foreground">
                        Bunker {formatDate(order.date_bunker)}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
              {data.open.length > 6 && (
                <li className="pt-2.5 text-center text-xs text-muted-foreground">
                  +{data.open.length - 6} PO lainnya
                </li>
              )}
            </ul>
          )}
        </Panel>
      </div>

      {/* Type split + quantity fulfilment */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Komposisi nilai PO" description="Berdasarkan jenis PO">
          {data.byType.length === 0 ? (
            <Empty>Belum ada data pada periode ini.</Empty>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="relative h-44 w-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.byType}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={54}
                      outerRadius={82}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {data.byType.map((t) => (
                        <Cell key={t.type} fill={TYPE_COLOR[t.type]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatIDR(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold">
                    {formatCompactIDR(typeTotal)}
                  </span>
                  <span className="text-xs text-muted-foreground">total</span>
                </div>
              </div>
              <ul className="w-full space-y-2 text-sm">
                {data.byType.map((t) => (
                  <li key={t.type} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: TYPE_COLOR[t.type] }}
                    />
                    <span className="flex-1 truncate">{t.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.count} PO
                    </span>
                    <span className="w-20 text-right tabular-nums">
                      {formatCompactIDR(t.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel
          title="Pemenuhan kuantitas"
          description="Dipesan dibanding aktual pada Delivery Order, untuk PO yang sudah selesai"
          className="xl:col-span-2"
        >
          {data.products.length === 0 ? (
            <Empty>Belum ada PO selesai pada periode ini.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Dipesan</TableHead>
                  <TableHead className="text-right">Aktual</TableHead>
                  <TableHead className="w-44">Pemenuhan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.products.map((p) => {
                  const pct = p.ordered > 0 ? (p.actual / p.ordered) * 100 : 0;
                  return (
                    <TableRow key={`${p.name}|${p.unit}`}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {quantity.format(p.ordered)} {p.unit}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {quantity.format(p.actual)} {p.unit}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={
                                pct < 95
                                  ? "h-full rounded-full bg-amber-500"
                                  : "h-full rounded-full bg-green-600"
                              }
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                            {Math.round(pct)}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Panel>
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Vendor teratas"
          description="Berdasarkan nilai PO, tidak termasuk yang dibatalkan"
        >
          <RankList
            items={data.vendors.map((v, i) => ({
              key: `${i}-${v.name}`,
              name: v.name,
              value: v.value,
              hint: `${v.count} PO`,
            }))}
          />
        </Panel>
        <Panel
          title="Kapal teratas"
          description="Berdasarkan nilai baris PO, tidak termasuk yang dibatalkan"
        >
          <RankList
            items={data.vessels.map((v, i) => ({
              key: `${i}-${v.name}`,
              name: v.name,
              value: v.value,
              hint: `${v.orders.size} PO`,
            }))}
          />
        </Panel>
      </div>

      {/* Recent */}
      <Panel
        title="PO terbaru"
        description="Enam PO yang terakhir dibuat"
        action={
          onNavigate && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => onNavigate("orders")}
            >
              Lihat semua
            </Button>
          )
        }
      >
        {data.recent.length === 0 ? (
          <Empty>Belum ada PO. Buat PO pertama dari menu Daftar PO.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. PO</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell>{o.partner?.name ?? "-"}</TableCell>
                  <TableCell>{ORDER_TYPE_LABELS[o.order_type]}</TableCell>
                  <TableCell>{formatDate(o.date_order)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatIDR(o.amount_total)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATE_VARIANT[o.state]}>
                      {ORDER_STATE_LABELS[o.state]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
};

export default OverviewPage;
