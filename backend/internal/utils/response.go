package utils

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Meta struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}

func OK(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

func Created(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, gin.H{"success": true, "data": data})
}

func OKMessage(c *gin.Context, message string, data interface{}) {
	c.JSON(http.StatusOK, gin.H{"success": true, "message": message, "data": data})
}

func Paginated(c *gin.Context, data interface{}, meta Meta) {
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data, "meta": meta})
}

func Error(c *gin.Context, status int, message string) {
	c.AbortWithStatusJSON(status, gin.H{"success": false, "message": message})
}

func BadRequest(c *gin.Context, message string) { Error(c, http.StatusBadRequest, message) }
func Unauthorized(c *gin.Context, message string) { Error(c, http.StatusUnauthorized, message) }
func Forbidden(c *gin.Context, message string) { Error(c, http.StatusForbidden, message) }
func NotFound(c *gin.Context, message string)  { Error(c, http.StatusNotFound, message) }
func Conflict(c *gin.Context, message string)  { Error(c, http.StatusConflict, message) }
func ServerError(c *gin.Context, message string) { Error(c, http.StatusInternalServerError, message) }

// Pagination reads ?page= & ?limit= with sane bounds.
func Pagination(c *gin.Context) (page, limit, offset int) {
	page = QueryInt(c, "page", 1)
	limit = QueryInt(c, "limit", 20)
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 20
	}
	if limit > 200 {
		limit = 200
	}
	return page, limit, (page - 1) * limit
}
