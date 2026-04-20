package main

import (
	"bufio"
	"os"
	"regexp"
	"strings"
	"time"
)

const backupLogPath = "/var/log/app-backup.log"

var logTsRe = regexp.MustCompile(`^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\]`)

type BackupStatus struct {
	Status  string `json:"status"`   // "ok" | "failed" | "running" | "never"
	LastRun int64  `json:"last_run"` // unix ts of last attempt start (0 = never)
	LastOK  int64  `json:"last_ok"`  // unix ts of last successful completion (0 = never)
}

func collectBackupStatus() (*BackupStatus, error) {
	f, err := os.Open(backupLogPath)
	if os.IsNotExist(err) {
		return &BackupStatus{Status: "never"}, nil
	}
	if err != nil {
		return &BackupStatus{Status: "never"}, nil
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
		if strings.Contains(line, "Starting backup") {
			lastStart = unix
		}
		if strings.Contains(line, "Done.") {
			lastDone = unix
		}
	}

	if lastStart == 0 && lastDone == 0 {
		return &BackupStatus{Status: "never"}, nil
	}

	out := &BackupStatus{LastRun: lastStart, LastOK: lastDone}

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
