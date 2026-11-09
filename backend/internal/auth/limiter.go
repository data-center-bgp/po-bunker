package auth

import (
	"math"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// Limiter is an in-memory per-key rate limit for login attempts. One API
// instance runs on the VPS, so in-process state is enough.
type Limiter struct {
	mu      sync.Mutex
	entries map[string]*limiterEntry
	limit   rate.Limit
	burst   int
	now     func() time.Time
	lastGC  time.Time
}

type limiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// NewLimiter allows `burst` attempts at once, then one every `every`.
func NewLimiter(every time.Duration, burst int) *Limiter {
	return &Limiter{
		entries: make(map[string]*limiterEntry),
		limit:   rate.Every(every),
		burst:   burst,
		now:     time.Now,
	}
}

// Allow reports whether the key may try again; if not, how long to wait.
func (l *Limiter) Allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	l.collect(now)

	e, ok := l.entries[key]
	if !ok {
		e = &limiterEntry{limiter: rate.NewLimiter(l.limit, l.burst)}
		l.entries[key] = e
	}
	e.lastSeen = now

	r := e.limiter.ReserveN(now, 1)
	if !r.OK() {
		return false, time.Minute
	}
	if delay := r.DelayFrom(now); delay > 0 {
		r.CancelAt(now) // do not spend a token on a refused attempt
		return false, time.Duration(math.Ceil(delay.Seconds())) * time.Second
	}
	return true, 0
}

// Reset forgets a key, used after a successful login.
func (l *Limiter) Reset(key string) {
	l.mu.Lock()
	delete(l.entries, key)
	l.mu.Unlock()
}

// collect drops idle entries at most once a minute so the map cannot grow forever.
func (l *Limiter) collect(now time.Time) {
	if now.Sub(l.lastGC) < time.Minute {
		return
	}
	l.lastGC = now
	for k, e := range l.entries {
		if now.Sub(e.lastSeen) > 10*time.Minute {
			delete(l.entries, k)
		}
	}
}
