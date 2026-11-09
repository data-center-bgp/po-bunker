package orders

import (
	"fmt"
	"time"
	_ "time/tzdata" // the Makassar zone must work in a minimal container
)

// wita is Asia/Makassar (UTC+8), the zone PO numbers are counted in.
var wita = func() *time.Location {
	if loc, err := time.LoadLocation("Asia/Makassar"); err == nil {
		return loc
	}
	return time.FixedZone("WITA", 8*60*60)
}()

var romanMonths = [12]string{"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"}

// numberingKind is the code printed in a bunker PO number.
func numberingKind(orderType string) (string, bool) {
	switch orderType {
	case TypeBunkerFuel:
		return "BBM", true
	case TypeBunkerWater:
		return "AIR", true
	}
	return "", false
}

// counterScope names the counter row a new PO number comes from.
//
// Bunker orders count per order type and per month, across every company, in
// the Makassar month in which the PO is created (now, not the order date).
// Logistic orders count per year of the order date.
func counterScope(orderType string, dateOrder, now time.Time) (string, error) {
	switch orderType {
	case TypeLogistic:
		return fmt.Sprintf("logistic:%d", dateOrder.In(wita).Year()), nil
	case TypeBunkerFuel, TypeBunkerWater:
		return orderType + ":" + now.In(wita).Format("2006-01"), nil
	}
	return "", invalid("invalid_order_type", "order_type", "must be bunker_fuel, bunker_water or logistic")
}

// formatNumber builds the PO number from the counter value.
//
//	bunker:   NNN AC/<company general code>-OPS/BBM|AIR/<ROMAN MONTH>-<YEAR>   e.g. 015 AC/IGE-OPS/BBM/III-2025
//	logistic: PO/<YEAR>/NNNN
func formatNumber(orderType, companyCode string, seq int, dateOrder, now time.Time) string {
	if orderType == TypeLogistic {
		return fmt.Sprintf("PO/%d/%04d", dateOrder.In(wita).Year(), seq)
	}
	kind, _ := numberingKind(orderType)
	local := now.In(wita)
	return fmt.Sprintf("%03d AC/%s-OPS/%s/%s-%d", seq, companyCode, kind, romanMonths[local.Month()-1], local.Year())
}
