package orders

import (
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func d(s string) Dec { return decimal.RequireFromString(s) }

func TestFormatNumberBunker(t *testing.T) {
	now := time.Date(2026, 11, 2, 9, 0, 0, 0, wita)
	for _, tc := range []struct {
		typ, code string
		seq       int
		want      string
	}{
		{TypeBunkerFuel, "ASG", 1, "001 AC/ASG-OPS/BBM/XI-2026"},
		{TypeBunkerWater, "BNI", 2, "002 AC/BNI-OPS/AIR/XI-2026"},
		{TypeBunkerFuel, "IGE", 15, "015 AC/IGE-OPS/BBM/XI-2026"},
		{TypeBunkerFuel, "IGE", 1000, "1000 AC/IGE-OPS/BBM/XI-2026"}, // the old lpad() would have cut this to 100
	} {
		if got := formatNumber(tc.typ, tc.code, tc.seq, now, now); got != tc.want {
			t.Errorf("got %q, want %q", got, tc.want)
		}
	}
}

func TestEveryRomanMonth(t *testing.T) {
	want := []string{"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"}
	for m := 1; m <= 12; m++ {
		now := time.Date(2026, time.Month(m), 15, 12, 0, 0, 0, wita)
		got := formatNumber(TypeBunkerFuel, "X", 1, now, now)
		if wantStr := "001 AC/X-OPS/BBM/" + want[m-1] + "-2026"; got != wantStr {
			t.Errorf("month %d: %q, want %q", m, got, wantStr)
		}
	}
}

func TestLogisticNumbering(t *testing.T) {
	order := time.Date(2026, 3, 5, 10, 0, 0, 0, wita)
	now := time.Date(2027, 1, 2, 10, 0, 0, 0, wita) // a different year: only the order date counts
	if got := formatNumber(TypeLogistic, "", 7, order, now); got != "PO/2026/0007" {
		t.Errorf("got %q", got)
	}
	scope, err := counterScope(TypeLogistic, order, now)
	if err != nil || scope != "logistic:2026" {
		t.Errorf("scope %q %v", scope, err)
	}
}

// The month and year come from Makassar time (UTC+8), not UTC.
func TestMakassarMonthBoundary(t *testing.T) {
	// 31 Oct 2026 23:30 UTC is already 1 Nov 07:30 in Makassar.
	now := time.Date(2026, 10, 31, 23, 30, 0, 0, time.UTC)
	scope, _ := counterScope(TypeBunkerFuel, now, now)
	if scope != "bunker_fuel:2026-11" {
		t.Errorf("scope = %q, want the November counter", scope)
	}
	if got := formatNumber(TypeBunkerFuel, "ASG", 1, now, now); got != "001 AC/ASG-OPS/BBM/XI-2026" {
		t.Errorf("number = %q", got)
	}

	// 31 Dec 2026 16:30 UTC is 1 Jan 2027 00:30 in Makassar: the year changes too.
	ny := time.Date(2026, 12, 31, 16, 30, 0, 0, time.UTC)
	if got := formatNumber(TypeBunkerWater, "BNI", 3, ny, ny); got != "003 AC/BNI-OPS/AIR/I-2027" {
		t.Errorf("new year = %q", got)
	}
	// ... and one minute earlier it is still December.
	before := time.Date(2026, 12, 31, 15, 59, 0, 0, time.UTC)
	if got := formatNumber(TypeBunkerWater, "BNI", 3, before, before); got != "003 AC/BNI-OPS/AIR/XII-2026" {
		t.Errorf("before midnight = %q", got)
	}
}

func TestBunkerScopeIgnoresTheOrderDate(t *testing.T) {
	now := time.Date(2026, 11, 2, 9, 0, 0, 0, wita)
	oldDate := time.Date(2025, 1, 1, 0, 0, 0, 0, wita)
	scope, _ := counterScope(TypeBunkerFuel, oldDate, now)
	if scope != "bunker_fuel:2026-11" {
		t.Errorf("scope %q", scope)
	}
	if s, _ := counterScope(TypeBunkerWater, oldDate, now); s != "bunker_water:2026-11" {
		t.Errorf("water scope %q", s)
	}
	if _, err := counterScope("steel", now, now); err == nil {
		t.Error("an unknown type must be refused")
	}
}

func TestComputeTotals(t *testing.T) {
	for name, tc := range map[string]struct {
		lines, discount, vat string
		untaxed, tax, total  string
	}{
		"real example, 11% VAT":     {"72500000", "0", "11", "72500000", "7975000", "80475000"},
		"with discount":             {"116000000", "500000", "11", "115500000", "12705000", "128205000"},
		"no VAT":                    {"4250000", "0", "0", "4250000", "0", "4250000"},
		"rounds half up":            {"100.05", "0", "10", "100.05", "10.01", "110.06"}, // 10.005 -> 10.01
		"rounds to cents":           {"1", "0", "11", "1", "0.11", "1.11"},
		"tiny":                      {"0.01", "0", "11", "0.01", "0", "0.01"}, // 0.0011 -> 0.00
		"discount equals the lines": {"500", "500", "11", "0", "0", "0"},
		"fractional VAT":            {"1000", "0", "2.5", "1000", "25", "1025"},
		"large":                     {"99999999999999.99", "0.99", "11", "99999999999999", "10999999999999.89", "110999999999998.89"},
	} {
		got, err := ComputeTotals(d(tc.lines), d(tc.discount), d(tc.vat))
		if err != nil {
			t.Errorf("%s: %v", name, err)
			continue
		}
		if !got.Untaxed.Equal(d(tc.untaxed)) || !got.Tax.Equal(d(tc.tax)) || !got.Total.Equal(d(tc.total)) {
			t.Errorf("%s: got %s / %s / %s, want %s / %s / %s", name, got.Untaxed, got.Tax, got.Total, tc.untaxed, tc.tax, tc.total)
		}
	}
}

func TestComputeTotalsRefusals(t *testing.T) {
	_, err := ComputeTotals(d("100"), d("100.01"), d("0"))
	var re *RuleError
	if !errors.As(err, &re) || re.Code != "discount_exceeds_total" || re.Field != "amount_discount" {
		t.Errorf("discount above the total: %v", err)
	}
	if _, err := ComputeTotals(d("100"), d("-1"), d("0")); err == nil {
		t.Error("a negative discount must be refused")
	}
}
