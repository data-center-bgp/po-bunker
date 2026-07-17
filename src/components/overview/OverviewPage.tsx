import { useMemo } from "react";
import type { PurchaseOrder } from "@/services/api";
import {
  dummyOrders,
  formatIDR,
  formatCompactIDR,
  DASHBOARD_REFERENCE_DATE,
} from "./dummyData";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ClipboardList,
  CircleDollarSign,
  Clock,
  XCircle,
  type LucideIcon,
} from "lucide-react";

type StateKey = "draft" | "to approve" | "purchase" | "done" | "cancel";

interface StateMeta {
  label: string;
  variant: "info" | "warning" | "success" | "destructive";
  color: string;
}

const STATE_META: Record<StateKey, StateMeta> = {
  draft: { label: "Draft", variant: "info", color: "#3b82f6" },
  "to approve": {
    label: "Pending Approval",
    variant: "warning",
    color: "#f59e0b",
  },
  purchase: { label: "Approved", variant: "success", color: "#10b981" },
  done: { label: "Completed", variant: "success", color: "#16a34a" },
  cancel: { label: "Cancelled", variant: "destructive", color: "#ef4444" },
};

const getStateMeta = (state: string): StateMeta =>
  STATE_META[state as StateKey] ?? {
    label: state,
    variant: "secondary" as StateMeta["variant"],
    color: "#9ca3af",
  };

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

interface KpiCardProps {
  title: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
}

const KpiCard = ({ title, value, sub, icon: Icon }: KpiCardProps) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">
        {title}
      </CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </CardContent>
  </Card>
);

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

const ChartCard = ({
  title,
  description,
  children,
  className,
}: ChartCardProps) => (
  <Card className={className}>
    <CardHeader>
      <CardTitle className="text-base">{title}</CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

const OverviewPage = () => {
  const orders: PurchaseOrder[] = dummyOrders;

  const kpis = useMemo(() => {
    const total = orders.length;
    const totalAmount = orders
      .filter((o) => o.state !== "cancel")
      .reduce((s, o) => s + o.amount_total, 0);
    const pending = orders.filter(
      (o) => o.state === "purchase" || o.state === "to approve",
    ).length;
    const cancelled = orders.filter((o) => o.state === "cancel").length;
    return { total, totalAmount, pending, cancelled };
  }, [orders]);

  const statusData = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const o of orders) {
      buckets[o.state] = (buckets[o.state] || 0) + 1;
    }
    return (Object.keys(STATE_META) as StateKey[]).map((k) => ({
      state: k,
      label: STATE_META[k].label,
      count: buckets[k] || 0,
      color: STATE_META[k].color,
    }));
  }, [orders]);

  const monthlyData = useMemo(() => {
    const ref = new Date(DASHBOARD_REFERENCE_DATE);
    const buckets: Record<string, { month: string; count: number; amount: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets[key] = {
        month: d.toLocaleDateString("en-GB", {
          month: "short",
          year: "2-digit",
        }),
        count: 0,
        amount: 0,
      };
    }
    for (const o of orders) {
      const d = new Date(o.date_create);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (buckets[key]) {
        buckets[key].count += 1;
        buckets[key].amount +=
          o.state === "cancel" ? 0 : o.amount_total;
      }
    }
    return Object.values(buckets);
  }, [orders]);

  const topVendors = useMemo(() => {
    const map = new Map<string, { name: string; amount: number; count: number }>();
    for (const o of orders) {
      if (o.state === "cancel") continue;
      const existing = map.get(o.partner_name) ?? {
        name: o.partner_name,
        amount: 0,
        count: 0,
      };
      existing.amount += o.amount_total;
      existing.count += 1;
      map.set(o.partner_name, existing);
    }
    return Array.from(map.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [orders]);

  const topVessels = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const o of orders) {
      if (o.state === "cancel") continue;
      const seen = new Set<string>();
      for (const l of o.order_lines) {
        if (!l.vessel_name || seen.has(l.vessel_name)) continue;
        seen.add(l.vessel_name);
        const existing = map.get(l.vessel_name) ?? {
          name: l.vessel_name,
          count: 0,
        };
        existing.count += 1;
        map.set(l.vessel_name, existing);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [orders]);

  const buyerData = useMemo(() => {
    const map = new Map<
      string,
      { name: string; count: number; amount: number }
    >();
    for (const o of orders) {
      const existing = map.get(o.user_name) ?? {
        name: o.user_name,
        count: 0,
        amount: 0,
      };
      existing.count += 1;
      existing.amount += o.state === "cancel" ? 0 : o.amount_total;
      map.set(o.user_name, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [orders]);

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort(
        (a, b) =>
          new Date(b.date_create).getTime() -
          new Date(a.date_create).getTime(),
      )
      .slice(0, 5);
  }, [orders]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Aggregated view of purchase orders. Data shown is illustrative
          dummy data following the real PO structure — replace{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            dummyOrders
          </code>{" "}
          with live API output when available.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total POs"
          value={String(kpis.total)}
          sub="All states included"
          icon={ClipboardList}
        />
        <KpiCard
          title="Total Amount"
          value={formatCompactIDR(kpis.totalAmount)}
          sub="Excludes cancelled POs"
          icon={CircleDollarSign}
        />
        <KpiCard
          title="Pending Approval"
          value={String(kpis.pending)}
          sub="purchase + to approve"
          icon={Clock}
        />
        <KpiCard
          title="Cancelled"
          value={String(kpis.cancelled)}
          sub={`${Math.round((kpis.cancelled / kpis.total) * 100)}% of total`}
          icon={XCircle}
        />
      </div>

      {/* Status distribution + Monthly trend */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Status Distribution"
          description="PO count broken down by workflow state"
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={statusData}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            >
              <CartesianGrid
                horizontal={false}
                stroke="hsl(var(--border))"
                strokeDasharray="3 3"
              />
              <XAxis type="number" allowDecimals={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="label"
                width={120}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                formatter={(v) => [`${v} POs`, "Count"]}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {statusData.map((entry) => (
                  <Cell key={entry.state} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Monthly Trend"
          description="PO count (bars) and total amount (line) over the last 6 months"
        >
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart
              data={monthlyData}
              margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
            >
              <CartesianGrid
                stroke="hsl(var(--border))"
                strokeDasharray="3 3"
              />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis
                yAxisId="count"
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="amount"
                orientation="right"
                tickFormatter={(v: number) => formatCompactIDR(v)}
                tickLine={false}
                axisLine={false}
                width={70}
              />
              <Tooltip
                formatter={(v, name) =>
                  name === "amount"
                    ? [formatIDR(Number(v)), "Amount"]
                    : [`${v} POs`, "Count"]
                }
              />
              <Legend />
              <Bar
                yAxisId="count"
                dataKey="count"
                name="PO Count"
                fill="hsl(var(--chart-1))"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="amount"
                type="monotone"
                dataKey="amount"
                name="Amount"
                stroke="hsl(var(--chart-3))"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Top vendors + Top vessels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Top 5 Vendors"
          description="By total PO amount (excluding cancelled)"
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={topVendors}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            >
              <CartesianGrid
                horizontal={false}
                stroke="hsl(var(--border))"
                strokeDasharray="3 3"
              />
              <XAxis
                type="number"
                tickFormatter={(v: number) => formatCompactIDR(v)}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={150}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                formatter={(v) => [formatIDR(Number(v)), "Amount"]}
              />
              <Bar
                dataKey="amount"
                fill="hsl(var(--chart-2))"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Top 5 Vessels"
          description="By number of POs referencing them (excluding cancelled)"
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={topVessels}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            >
              <CartesianGrid
                horizontal={false}
                stroke="hsl(var(--border))"
                strokeDasharray="3 3"
              />
              <XAxis
                type="number"
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={150}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                formatter={(v) => [`${v} POs`, "Count"]}
              />
              <Bar
                dataKey="count"
                fill="hsl(var(--chart-4))"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* POs by buyer + Recent POs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="POs by Buyer"
          description="Count and total amount grouped by requestor"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Buyer</TableHead>
                <TableHead className="text-right">POs</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buyerData.map((b) => (
                <TableRow key={b.name}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="text-right">{b.count}</TableCell>
                  <TableCell className="text-right">
                    {formatCompactIDR(b.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ChartCard>

        <ChartCard
          title="Recent POs"
          description="Five most recently created purchase orders"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Ref</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders.map((o) => {
                const meta = getStateMeta(o.state);
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.name}</TableCell>
                    <TableCell className="max-w-[160px] truncate">
                      {o.partner_name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(o.date_create)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCompactIDR(o.amount_total)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ChartCard>
      </div>
    </div>
  );
};

export default OverviewPage;
