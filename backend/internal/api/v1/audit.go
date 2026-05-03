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
	rangeParam := c.DefaultQuery("range", "all") // all | today | month

	data, filename, err := h.auditSvc.GetCSVBytesFiltered(ctx, rangeParam)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Header("Content-Type", "text/csv")
	c.Data(http.StatusOK, "text/csv", data)
}
