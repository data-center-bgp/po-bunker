// Indonesian "terbilang" (amount in words), e.g. 1250000 -> "Satu juta dua ratus
// lima puluh ribu rupiah". Used on the PO form ("Terbilang / In number").

const UNITS = [
  "",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
];

const SCALES: [number, string][] = [
  [1e12, "triliun"],
  [1e9, "miliar"],
  [1e6, "juta"],
  [1e3, "ribu"],
];

const say = (n: number): string => {
  if (n < 12) return UNITS[n];
  if (n < 20) return `${say(n - 10)} belas`;
  if (n < 100) {
    return `${say(Math.floor(n / 10))} puluh${n % 10 ? ` ${say(n % 10)}` : ""}`;
  }
  if (n < 200) return `seratus${n > 100 ? ` ${say(n - 100)}` : ""}`;
  if (n < 1000) {
    return `${say(Math.floor(n / 100))} ratus${n % 100 ? ` ${say(n % 100)}` : ""}`;
  }
  for (const [size, name] of SCALES) {
    if (n >= size) {
      const head = Math.floor(n / size);
      const rest = n % size;
      // "seribu", not "satu ribu"
      const words = size === 1e3 && head === 1 ? "seribu" : `${say(head)} ${name}`;
      return rest ? `${words} ${say(rest)}` : words;
    }
  }
  return "";
};

export const terbilang = (amount: number): string => {
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const whole = Math.floor(rounded);
  const cents = Math.round((rounded - whole) * 100);

  let words = whole === 0 ? "nol" : say(whole);
  if (cents > 0) {
    const digits = String(cents).padStart(2, "0").replace(/0+$/, "");
    words += ` koma ${digits
      .split("")
      .map((d) => (d === "0" ? "nol" : UNITS[Number(d)]))
      .join(" ")}`;
  }
  words += " rupiah";
  return words.charAt(0).toUpperCase() + words.slice(1);
};
