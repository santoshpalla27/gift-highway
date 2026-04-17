package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type rateLimiter struct {
	mu       sync.Mutex
	requests map[string][]time.Time
	rps      int
	burst    int
}

func newRateLimiter(rps, burst int) *rateLimiter {
	rl := &rateLimiter{
		requests: make(map[string][]time.Time),
		rps:      rps,
		burst:    burst,
	}
	go rl.cleanup()
	return rl
}

func (rl *rateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	window := now.Add(-time.Second)

	reqs := rl.requests[ip]
	var valid []time.Time
	for _, t := range reqs {
		if t.After(window) {
			valid = append(valid, t)
		}
	}

	if len(valid) >= rl.burst {
		return false
	}

	rl.requests[ip] = append(valid, now)
	return true
}

func (rl *rateLimiter) cleanup() {
	for range time.Tick(time.Minute) {
		rl.mu.Lock()
		cutoff := time.Now().Add(-time.Minute)
		for ip, reqs := range rl.requests {
			var valid []time.Time
			for _, t := range reqs {
				if t.After(cutoff) {
					valid = append(valid, t)
				}
			}
			if len(valid) == 0 {
				delete(rl.requests, ip)
			} else {
				rl.requests[ip] = valid
			}
		}
		rl.mu.Unlock()
	}
}

func RateLimit(rps, burst int) gin.HandlerFunc {
	rl := newRateLimiter(rps, burst)
	return func(c *gin.Context) {
		if !rl.allow(c.ClientIP()) {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded"})
			c.Abort()
			return
		}
		c.Next()
	}
}
