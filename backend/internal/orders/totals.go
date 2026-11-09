package orders

import "github.com/shopspring/decimal"

var (
	decZero    = decimal.Zero
	decHundred = decimal.NewFromInt(100)
)

// Totals are the money amounts printed at the bottom of a PO.
type Totals struct {
	Untaxed Dec // lines total minus the discount
	Tax     Dec // untaxed * VAT% / 100, rounded to cents
	Total   Dec // untaxed + tax
}

// ComputeTotals applies the order rules to the sum of the lines:
//
//	untaxed = lines total - discount   (the discount may not exceed the lines total)
//	tax     = round(untaxed * VAT% / 100, 2)
//	total   = untaxed + tax
//
// All values are exact decimals; rounding is half away from zero, like Postgres.
func ComputeTotals(linesTotal, discount, vatPercent Dec) (Totals, error) {
	if discount.IsNegative() {
		return Totals{}, invalid("invalid_discount", "amount_discount", "must not be negative")
	}
	if discount.GreaterThan(linesTotal) {
		return Totals{}, invalid("discount_exceeds_total", "amount_discount",
			"The discount ("+discount.StringFixed(2)+") is larger than the order total ("+linesTotal.StringFixed(2)+")")
	}
	untaxed := linesTotal.Sub(discount)
	tax := untaxed.Mul(vatPercent).Div(decHundred).Round(2)
	return Totals{Untaxed: untaxed, Tax: tax, Total: untaxed.Add(tax)}, nil
}
