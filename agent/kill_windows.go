package main

import (
	"fmt"
	"os"
	"regexp"
	"strings"

	"golang.org/x/sys/windows"
)

// Process termination for the booth. The client already closes user apps at user level; this
// runs with SYSTEM rights so it can also end an app the booth user launched elevated. Every
// request still passes the same guard the Electron SystemService uses, so the privilege never
// becomes "kill anything": Windows-critical processes, the billing stack, and this agent itself
// are never terminated, whoever asks.

// protectedNames are process names (lower-case, no .exe) that must never be killed.
var protectedNames = map[string]bool{
	// GC Hub stack: killing these would drop billing or the lock itself.
	"gc-agent": true, "gc-hub": true, "gc-hub-server": true, "gc-hub-client": true,
	"gchub": true, "electron": true, "node": true,
	// Windows-critical: ending these bluescreens or destabilises the machine.
	"system": true, "registry": true, "smss": true, "csrss": true, "wininit": true,
	"services": true, "lsass": true, "winlogon": true, "fontdrvhost": true, "dwm": true,
	"svchost": true, "explorer": true, "ctfmon": true, "sihost": true, "taskhostw": true,
	"audiodg": true, "dllhost": true, "spoolsv": true,
}

var procNameRe = regexp.MustCompile(`^[\w .()+-]{1,64}(\.exe)?$`)

// canKill rejects a request before any handle is opened. A made-up PID or a protected name never
// reaches TerminateProcess, so a bad request from the pipe cannot hit an unrelated process.
func canKill(pid uint32, name string) error {
	if pid <= 4 || int(pid) == os.Getpid() {
		return fmt.Errorf("PID tidak valid: %d", pid)
	}
	if !procNameRe.MatchString(name) {
		return fmt.Errorf("nama proses tidak valid")
	}
	clean := strings.ToLower(strings.TrimSuffix(name, ".exe"))
	if protectedNames[clean] {
		return fmt.Errorf("proses %s diproteksi dan tidak dapat dimatikan", name)
	}
	return nil
}

func killProcess(pid uint32, name string) error {
	if err := canKill(pid, name); err != nil {
		return err
	}
	h, err := windows.OpenProcess(windows.PROCESS_TERMINATE, false, pid)
	if err != nil {
		return fmt.Errorf("tidak bisa membuka proses %d: %w", pid, err)
	}
	defer windows.CloseHandle(h)
	if err := windows.TerminateProcess(h, 1); err != nil {
		return fmt.Errorf("gagal menutup proses %s (%d): %w", name, pid, err)
	}
	return nil
}
