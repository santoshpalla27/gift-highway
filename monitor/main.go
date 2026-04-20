package main

import (
	"embed"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"
)

//go:embed static
var staticFiles embed.FS

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "9090"
	}

	sub, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(sub)))
	mux.HandleFunc("/api/system", handleSystem)
	mux.HandleFunc("/api/containers", handleContainers)
	mux.HandleFunc("/api/volumes", handleVolumes)
	mux.HandleFunc("/api/logs/", handleLogs)
	mux.HandleFunc("/api/errors", handleErrors)
	mux.HandleFunc("/api/backup", handleBackup)

	log.Printf("monitor listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}

func handleSystem(w http.ResponseWriter, r *http.Request) {
	stats, err := collectSystem()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	respond(w, stats)
}

func handleContainers(w http.ResponseWriter, r *http.Request) {
	list, err := collectContainers()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	respond(w, list)
}

func handleVolumes(w http.ResponseWriter, r *http.Request) {
	list, err := collectVolumes()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	respond(w, list)
}

func handleErrors(w http.ResponseWriter, r *http.Request) {
	lines, err := collectErrors()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	respond(w, lines)
}

func handleLogs(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/logs/")
	if id == "" {
		http.Error(w, "missing container id", http.StatusBadRequest)
		return
	}
	lines, err := fetchLogs(id, 300)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	respond(w, map[string]any{"logs": lines})
}

func handleBackup(w http.ResponseWriter, r *http.Request) {
	status, err := collectBackupStatus()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	respond(w, status)
}

func respond(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(v)
}
