package main

import (
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	psnet "github.com/shirou/gopsutil/v3/net"
)

type SystemStats struct {
	Hostname string   `json:"hostname"`
	Uptime   uint64   `json:"uptime"`
	CPU      CPUStat  `json:"cpu"`
	Memory   MemStat  `json:"memory"`
	Disk     DiskStat `json:"disk"`
	Network  NetStat  `json:"network"`
	Load     LoadStat `json:"load"`
	Time     int64    `json:"time"`
}

type CPUStat struct {
	Percent float64 `json:"percent"`
	Cores   int     `json:"cores"`
}

type MemStat struct {
	Total   uint64  `json:"total"`
	Used    uint64  `json:"used"`
	Free    uint64  `json:"free"`
	Percent float64 `json:"percent"`
}

type DiskStat struct {
	Total   uint64  `json:"total"`
	Used    uint64  `json:"used"`
	Free    uint64  `json:"free"`
	Percent float64 `json:"percent"`
}

type NetStat struct {
	BytesSent uint64 `json:"bytes_sent"`
	BytesRecv uint64 `json:"bytes_recv"`
}

type LoadStat struct {
	Load1  float64 `json:"load1"`
	Load5  float64 `json:"load5"`
	Load15 float64 `json:"load15"`
}

func collectSystem() (*SystemStats, error) {
	s := &SystemStats{Time: time.Now().Unix()}

	if hi, err := host.Info(); err == nil {
		s.Hostname = hi.Hostname
		s.Uptime = hi.Uptime
	}

	// Sample CPU over 500ms for an accurate reading
	if pcts, err := cpu.Percent(500*time.Millisecond, false); err == nil && len(pcts) > 0 {
		s.CPU.Percent = r2(pcts[0])
	}
	if n, err := cpu.Counts(true); err == nil {
		s.CPU.Cores = n
	}

	if v, err := mem.VirtualMemory(); err == nil {
		s.Memory = MemStat{
			Total:   v.Total,
			Used:    v.Used,
			Free:    v.Free,
			Percent: r2(v.UsedPercent),
		}
	}

	if d, err := disk.Usage("/"); err == nil {
		s.Disk = DiskStat{
			Total:   d.Total,
			Used:    d.Used,
			Free:    d.Free,
			Percent: r2(d.UsedPercent),
		}
	}

	if ctrs, err := psnet.IOCounters(false); err == nil && len(ctrs) > 0 {
		s.Network = NetStat{
			BytesSent: ctrs[0].BytesSent,
			BytesRecv: ctrs[0].BytesRecv,
		}
	}

	if l, err := load.Avg(); err == nil {
		s.Load = LoadStat{
			Load1:  r2(l.Load1),
			Load5:  r2(l.Load5),
			Load15: r2(l.Load15),
		}
	}

	return s, nil
}

// r2 rounds a float to 2 decimal places.
func r2(f float64) float64 {
	return float64(int(f*100)) / 100
}
