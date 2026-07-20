package middleware

import (
	"log"
	"net/http"
	"sync"
	"time"

	"dms/backend/internal/config"
	"dms/backend/internal/utils"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// CORS allows the configured frontend origins.
func CORS(cfg *config.Config) gin.HandlerFunc {
	allowed := make(map[string]bool, len(cfg.CORSOrigins))
	for _, o := range cfg.CORSOrigins {
		allowed[o] = true
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if allowed[origin] {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Content-Length, Accept, Authorization")
		c.Header("Access-Control-Expose-Headers", "Content-Disposition")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

// SecurityHeaders sets baseline hardening headers.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Next()
	}
}

// BodyLimit caps request bodies before multipart parsing can spill an
// arbitrarily large upload to temporary disk. One extra MiB leaves room for
// multipart boundaries and form fields around the configured file limit.
func BodyLimit(maxUploadMB int64) gin.HandlerFunc {
	maxBytes := (maxUploadMB + 1) << 20
	return func(c *gin.Context) {
		if c.Request.ContentLength > maxBytes {
			utils.Error(c, http.StatusRequestEntityTooLarge, "Request body is too large")
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		c.Next()
	}
}

// ─── Rate limiting ────────────────────────────────────────────────────────

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

type rateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	r        rate.Limit
	burst    int
}

func newRateLimiter(r rate.Limit, burst int) *rateLimiter {
	rl := &rateLimiter{visitors: make(map[string]*visitor), r: r, burst: burst}
	go rl.cleanup()
	return rl
}

func (rl *rateLimiter) get(key string) *rate.Limiter {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	v, ok := rl.visitors[key]
	if !ok {
		lim := rate.NewLimiter(rl.r, rl.burst)
		rl.visitors[key] = &visitor{limiter: lim, lastSeen: time.Now()}
		return lim
	}
	v.lastSeen = time.Now()
	return v.limiter
}

// cleanup evicts idle visitors so the map does not grow without bound.
func (rl *rateLimiter) cleanup() {
	for {
		time.Sleep(5 * time.Minute)
		rl.mu.Lock()
		for k, v := range rl.visitors {
			if time.Since(v.lastSeen) > 15*time.Minute {
				delete(rl.visitors, k)
			}
		}
		rl.mu.Unlock()
	}
}

// RateLimit throttles per client IP. rps is sustained rate, burst is the bucket.
func RateLimit(rps float64, burst int) gin.HandlerFunc {
	rl := newRateLimiter(rate.Limit(rps), burst)
	return func(c *gin.Context) {
		if !rl.get(utils.ClientIP(c)).Allow() {
			utils.Error(c, http.StatusTooManyRequests, "Too many requests. Please slow down and try again shortly.")
			return
		}
		c.Next()
	}
}

// Recovery converts panics into a 500 without killing the process.
func Recovery() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered interface{}) {
		log.Printf("panic recovered: %v", recovered)
		utils.ServerError(c, "An unexpected error occurred")
	})
}
