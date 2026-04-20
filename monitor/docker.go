package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

const dockerAPI = "http://localhost/v1.43"

// sharedDockerClient is a package-level singleton that reuses Unix socket connections.
var sharedDockerClient = &http.Client{
	Timeout: 15 * time.Second,
	Transport: &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "unix", "/var/run/docker.sock")
		},
		MaxIdleConns:    10,
		IdleConnTimeout: 30 * time.Second,
	},
}

// dockerClient returns the shared Docker HTTP client.
func dockerClient() *http.Client {
	return sharedDockerClient
}

// ── Types decoded from the Docker REST API ───────────────────────────────────

type dockerContainer struct {
	ID      string   `json:"Id"`
	Names   []string `json:"Names"`
	Image   string   `json:"Image"`
	State   string   `json:"State"`
	Status  string   `json:"Status"`
	Created int64    `json:"Created"`
}

type dockerStats struct {
	CPUStats struct {
		CPUUsage struct {
			TotalUsage  uint64   `json:"total_usage"`
			PercpuUsage []uint64 `json:"percpu_usage"`
		} `json:"cpu_usage"`
		SystemUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs  uint32 `json:"online_cpus"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64            `json:"usage"`
		Limit uint64            `json:"limit"`
		Stats map[string]uint64 `json:"stats"`
	} `json:"memory_stats"`
	Networks map[string]struct {
		RxBytes uint64 `json:"rx_bytes"`
		TxBytes uint64 `json:"tx_bytes"`
	} `json:"networks"`
	BlkioStats struct {
		IoServiceBytesRecursive []struct {
			Op    string `json:"op"`
			Value uint64 `json:"value"`
		} `json:"io_service_bytes_recursive"`
	} `json:"blkio_stats"`
}

// ── Public API ───────────────────────────────────────────────────────────────

type ContainerStat struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Image      string  `json:"image"`
	State      string  `json:"state"`
	Status     string  `json:"status"`
	CPUPercent float64 `json:"cpu_percent"`
	MemUsed    uint64  `json:"mem_used"`
	MemLimit   uint64  `json:"mem_limit"`
	MemPercent float64 `json:"mem_percent"`
	DiskRead   uint64  `json:"disk_read"`
	DiskWrite  uint64  `json:"disk_write"`
	NetRx      uint64  `json:"net_rx"`
	NetTx      uint64  `json:"net_tx"`
	Created    int64   `json:"created"`
}

type VolumeStat struct {
	Name  string `json:"name"`
	Links int    `json:"links"`
	Size  int64  `json:"size"`
}

func collectVolumes() ([]VolumeStat, error) {
	cli := dockerClient()

	resp, err := cli.Get(dockerAPI + "/system/df")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var state struct {
		Volumes []struct {
			Name      string `json:"Name"`
			UsageData struct {
				RefCount int   `json:"RefCount"`
				Size     int64 `json:"Size"`
			} `json:"UsageData"`
		} `json:"Volumes"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&state); err != nil {
		return nil, err
	}

	out := make([]VolumeStat, 0, len(state.Volumes))
	for _, v := range state.Volumes {
		out = append(out, VolumeStat{
			Name:  v.Name,
			Links: v.UsageData.RefCount,
			Size:  v.UsageData.Size,
		})
	}
	return out, nil
}

func collectContainers() ([]ContainerStat, error) {
	cli := dockerClient()

	resp, err := cli.Get(dockerAPI + "/containers/json?all=1")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var list []dockerContainer
	if err := json.NewDecoder(resp.Body).Decode(&list); err != nil {
		return nil, err
	}

	out := make([]ContainerStat, 0, len(list))
	for _, c := range list {
		cs := ContainerStat{
			ID:      c.ID[:12],
			Image:   c.Image,
			State:   c.State,
			Status:  c.Status,
			Created: c.Created,
		}
		if len(c.Names) > 0 {
			cs.Name = strings.TrimPrefix(c.Names[0], "/")
		}
		if c.State == "running" {
			if raw, err := getContainerStats(cli, c.ID); err == nil {
				cs.CPUPercent = raw.cpu
				cs.MemUsed = raw.memUsed
				cs.MemLimit = raw.memLimit
				cs.MemPercent = raw.memPct
				cs.DiskRead = raw.diskRead
				cs.DiskWrite = raw.diskWrite
				cs.NetRx = raw.netRx
				cs.NetTx = raw.netTx
			}
		}
		out = append(out, cs)
	}
	return out, nil
}

func fetchLogs(id string, tail int) ([]string, error) {
	cli := dockerClient()
	url := fmt.Sprintf("%s/containers/%s/logs?stdout=1&stderr=1&tail=%d&timestamps=1", dockerAPI, id, tail)
	resp, err := cli.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	return parseDockerLogs(body), nil
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type rawStat struct {
	cpu       float64
	memUsed   uint64
	memLimit  uint64
	memPct    float64
	netRx     uint64
	netTx     uint64
	diskRead  uint64
	diskWrite uint64
}

func getContainerStats(cli *http.Client, id string) (rawStat, error) {
	resp, err := cli.Get(fmt.Sprintf("%s/containers/%s/stats?stream=0", dockerAPI, id))
	if err != nil {
		return rawStat{}, err
	}
	defer resp.Body.Close()

	var v dockerStats
	if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
		return rawStat{}, err
	}

	// CPU %
	cpuDelta := float64(v.CPUStats.CPUUsage.TotalUsage - v.PreCPUStats.CPUUsage.TotalUsage)
	sysDelta := float64(v.CPUStats.SystemUsage - v.PreCPUStats.SystemUsage)
	numCPU := float64(v.CPUStats.OnlineCPUs)
	if numCPU == 0 {
		numCPU = float64(len(v.CPUStats.CPUUsage.PercpuUsage))
	}
	var cpuPct float64
	if sysDelta > 0 && cpuDelta > 0 {
		cpuPct = (cpuDelta / sysDelta) * numCPU * 100.0
	}

	// Memory — cgroups v1: "cache", cgroups v2: "inactive_file"
	cache := v.MemoryStats.Stats["cache"]
	if cache == 0 {
		cache = v.MemoryStats.Stats["inactive_file"]
	}
	memUsed := v.MemoryStats.Usage
	if cache < memUsed {
		memUsed -= cache
	}
	memLimit := v.MemoryStats.Limit
	var memPct float64
	if memLimit > 0 {
		memPct = float64(memUsed) / float64(memLimit) * 100
	}

	// Network I/O
	var rx, tx uint64
	for _, n := range v.Networks {
		rx += n.RxBytes
		tx += n.TxBytes
	}

	// Disk I/O
	var diskRead, diskWrite uint64
	for _, blk := range v.BlkioStats.IoServiceBytesRecursive {
		op := strings.ToLower(blk.Op)
		if op == "read" {
			diskRead += blk.Value
		} else if op == "write" {
			diskWrite += blk.Value
		}
	}

	return rawStat{
		cpu:       r2(cpuPct),
		memUsed:   memUsed,
		memLimit:  memLimit,
		memPct:    r2(memPct),
		netRx:     rx,
		netTx:     tx,
		diskRead:  diskRead,
		diskWrite: diskWrite,
	}, nil
}

// ── Error collection ─────────────────────────────────────────────────────────

type ErrorLine struct {
	ContainerID   string `json:"container_id"`
	ContainerName string `json:"container_name"`
	Line          string `json:"line"`
}

var errorKeywords = []string{"error", "panic", "fatal", "exception", "traceback", "critical"}

func collectErrors() ([]ErrorLine, error) {
	cli := dockerClient()

	resp, err := cli.Get(dockerAPI + "/containers/json?all=0")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var list []dockerContainer
	if err := json.NewDecoder(resp.Body).Decode(&list); err != nil {
		return nil, err
	}

	var out []ErrorLine
	for _, c := range list {
		name := c.ID[:12]
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		lines, err := fetchLogs(c.ID, 500)
		if err != nil {
			continue
		}
		for _, line := range lines {
			lower := strings.ToLower(line)
			for _, kw := range errorKeywords {
				if strings.Contains(lower, kw) {
					out = append(out, ErrorLine{
						ContainerID:   c.ID[:12],
						ContainerName: name,
						Line:          line,
					})
					break
				}
			}
		}
	}
	if out == nil {
		out = []ErrorLine{}
	}
	return out, nil
}

// parseDockerLogs strips Docker's 8-byte multiplexing frame headers from log output.
// Frame format: [stream(1)] [0 0 0] [size(4 big-endian)] [payload...]
func parseDockerLogs(data []byte) []string {
	var lines []string
	i := 0
	for i+8 <= len(data) {
		size := int(data[i+4])<<24 | int(data[i+5])<<16 | int(data[i+6])<<8 | int(data[i+7])
		i += 8
		end := i + size
		if end > len(data) {
			end = len(data)
		}
		chunk := strings.TrimRight(string(data[i:end]), "\n")
		i = end
		for _, line := range strings.Split(chunk, "\n") {
			if line != "" {
				lines = append(lines, line)
			}
		}
	}
	if len(lines) == 0 {
		return []string{}
	}
	return lines
}
