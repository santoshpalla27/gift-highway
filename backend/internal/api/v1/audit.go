package v1

import (
	"net/http"

	"github.com/company/app/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type AuditHandler struct {
	auditSvc *services.AuditService
}

func NewAuditHandler(auditSvc *services.AuditService) *AuditHandler {
	return &AuditHandler{auditSvc: auditSvc}
}

func (h *AuditHandler) GetStatus(c *gin.Context) {
	ctx := c.Request.Context()
	status := h.auditSvc.Status(ctx)
	c.JSON(http.StatusOK, status)
}

func (h *AuditHandler) DownloadCSV(c *gin.Context) {
	ctx := c.Request.Context()
	rangeParam := c.DefaultQuery("range", "all") // all | today | month | custom
	fromDate := c.Query("from")                  // YYYY-MM-DD, used when range=custom
	toDate := c.Query("to")                      // YYYY-MM-DD, used when range=custom

	data, filename, err := h.auditSvc.GetCSVBytesFiltered(ctx, rangeParam, fromDate, toDate)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Header("Content-Type", "text/csv")
	c.Data(http.StatusOK, "text/csv", data)
}

func (h *AuditHandler) TestWrite(c *gin.Context) {
	ctx := c.Request.Context()
	if err := h.auditSvc.TestWrite(ctx); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "R2 read/write verified successfully"})
}
