package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"golang.org/x/sys/windows"
)

// Process termination for the booth. The client already closes user apps at user level; this
// runs with SYSTEM rights so it can also end an app the booth user launched elevated. Every
// request still passes the same guard the Electron SystemService uses, so the privilege never
// becomes "kill anything": Windows-critical processes, the billing stack, and this agent itself
// are never terminated, whoever asks.
//
// The pipe is open to every local user, so nothing in the request is trusted: the name checked
// against the protected list is read from the process itself, and only processes in the
// interactive console session are reachable (services in session 0 and other users never are).

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

func baseName(name string) string {
	return strings.TrimSuffix(strings.ToLower(filepath.Base(name)), ".exe")
}

// validateRequest rejects a malformed request before any handle is opened.
func validateRequest(pid uint32, name string) error {
	if pid <= 4 || int(pid) == os.Getpid() {
		return fmt.Errorf("PID tidak valid: %d", pid)
	}
	if !procNameRe.MatchString(name) {
		return fmt.Errorf("nama proses tidak valid")
	}
	return nil
}

// checkTarget decides on facts read from the live process, never on what the caller claims.
// requested is the name the caller sent, actualImage the exe path of that PID, procSession and
// consoleSession the Terminal Services sessions of the process and of the console user.
func checkTarget(requested, actualImage string, procSession, consoleSession uint32) error {
	actual := baseName(actualImage)
	if protectedNames[actual] {
		return fmt.Errorf("proses %s diproteksi dan tidak dapat dimatikan", actual)
	}
	if actual != baseName(requested) {
		return fmt.Errorf("PID bukan milik proses %s", requested)
	}
	if procSession == 0 || procSession != consoleSession {
		return fmt.Errorf("proses %s bukan milik sesi pengguna bilik", actual)
	}
	return nil
}

// imagePath returns the full exe path of an open process handle. The handle needs
// PROCESS_QUERY_LIMITED_INFORMATION.
func imagePath(h windows.Handle) (string, error) {
	buf := make([]uint16, windows.MAX_LONG_PATH)
	size := uint32(len(buf))
	if err := windows.QueryFullProcessImageName(h, 0, &buf[0], &size); err != nil {
		return "", err
	}
	return windows.UTF16ToString(buf[:size]), nil
}

func killProcess(pid uint32, name string) error {
	if err := validateRequest(pid, name); err != nil {
		return err
	}
	// The open handle pins the process, so the checks below and TerminateProcess hit the same
	// process even if the PID is reused meanwhile.
	h, err := windows.OpenProcess(windows.PROCESS_TERMINATE|windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return fmt.Errorf("tidak bisa membuka proses %d: %w", pid, err)
	}
	defer windows.CloseHandle(h)

	image, err := imagePath(h)
	if err != nil {
		return fmt.Errorf("tidak bisa membaca proses %d: %w", pid, err)
	}
	var session uint32
	if err := windows.ProcessIdToSessionId(pid, &session); err != nil {
		return fmt.Errorf("tidak bisa membaca sesi proses %d: %w", pid, err)
	}
	if err := checkTarget(name, image, session, windows.WTSGetActiveConsoleSessionId()); err != nil {
		return err
	}
	if err := windows.TerminateProcess(h, 1); err != nil {
		return fmt.Errorf("gagal menutup proses %s (%d): %w", name, pid, err)
	}
	return nil
}
