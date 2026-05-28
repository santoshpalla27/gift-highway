package main

import (
	"bufio"
	"os"
	"regexp"
	"strings"
	"time"
)

// Primary log paths (written by backup scripts when running as root via cron).
// The scripts fall back to /tmp/ when the /var/log/ path cannot be created, so
// resolveLogPath() checks both and returns whichever has real content.
const backupLogPath   = "/var/log/app-backup.log"
const s3BackupLogPath = "/var/log/app-backup-s3.log"

// fallback paths used by the backup scripts when /var/log/ is unavailable
var backupLogFallbacks = map[string]string{
	backupLogPath:   "/tmp/app-backup.log",
	s3BackupLogPath: "/tmp/app-backup-s3.log",
}

var logTsRe = regexp.MustCompile(`^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\]`)

type BackupStatus struct {
	Status  string `json:"status"`   // "ok" | "failed" | "running" | "never"
	LastRun int64  `json:"last_run"` // unix ts of last attempt start (0 = never)
	LastOK  int64  `json:"last_ok"`  // unix ts of last successful completion (0 = never)
	LogPath string `json:"log_path"` // resolved path actually being read (for debugging)
}

// resolveLogPath returns the best available log file path.
// It prefers the primary path; if that file is missing or empty it tries the
// /tmp/ fallback that the backup script uses when running without full root
// access to /var/log/.
func resolveLogPath(primary string) string {
	if info, err := os.Stat(primary); err == nil && info.Size() > 0 {
		return primary
	}
	if fallback, ok := backupLogFallbacks[primary]; ok {
		if info, err := os.Stat(fallback); err == nil && info.Size() > 0 {
			return fallback
		}
	}
	// Return primary so callers get a clear "not found" message rather than
	// silently returning nothing.
	return primary
}

func collectBackupLogs(logPath string, n int) ([]string, error) {
	resolved := resolveLogPath(logPath)
	f, err := os.Open(resolved)
	if os.IsNotExist(err) {
		return []string{"(backup log not found — no backup has run yet)"}, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var lines []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return lines, nil
}

func collectBackupStatus(logPath string) (*BackupStatus, error) {
	resolved := resolveLogPath(logPath)
	f, err := os.Open(resolved)
	if os.IsNotExist(err) {
		return &BackupStatus{Status: "never", LogPath: resolved}, nil
	}
	if err != nil {
		return &BackupStatus{Status: "never", LogPath: resolved}, nil
	}
	defer f.Close()

	var lastStart, lastDone int64

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		m := logTsRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		t, err := time.Parse("2006-01-02T15:04:05Z", m[1])
		if err != nil {
			continue
		}
		unix := t.Unix()
		if strings.Contains(line, "Starting backup") || strings.Contains(line, "Starting S3 backup") {
			lastStart = unix
		}
		if strings.Contains(line, "Done.") {
			lastDone = unix
		}
	}

	if lastStart == 0 && lastDone == 0 {
		return &BackupStatus{Status: "never", LogPath: resolved}, nil
	}

	out := &BackupStatus{LastRun: lastStart, LastOK: lastDone, LogPath: resolved}

	switch {
	case lastDone > 0 && lastDone >= lastStart:
		out.Status = "ok"
	case lastStart > 0 && time.Now().Unix()-lastStart < 300:
		out.Status = "running"
	default:
		out.Status = "failed"
	}

	return out, nil
}
