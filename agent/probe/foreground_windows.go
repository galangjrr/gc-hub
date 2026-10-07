// Command gc-probe is a tiny user-session helper for the GC Hub client. It is spawned by the
// Electron client (which runs in the booth user's session) and prints the name of the process
// that owns the foreground window, then exits.
//
// This replaces a per-tick PowerShell spawn in telemetry.ts: it needs no PowerShell and is a
// native query. It must run in the user session, not the SYSTEM agent — a service in session 0
// cannot see the interactive desktop's foreground window.
//
// Output: "<pid>|<name>" on one line, or nothing when the foreground window cannot be read.
package main

import (
	"fmt"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows"
)

func main() {
	hwnd := windows.GetForegroundWindow()
	if hwnd == 0 {
		return
	}
	var pid uint32
	windows.GetWindowThreadProcessId(hwnd, &pid)
	if pid == 0 {
		return
	}
	name, err := processName(pid)
	if err != nil || name == "" {
		return
	}
	fmt.Printf("%d|%s\n", pid, name)
}

// processName returns the base exe name (without .exe) of a PID via QueryFullProcessImageName,
// which needs only PROCESS_QUERY_LIMITED_INFORMATION and works across integrity levels.
func processName(pid uint32) (string, error) {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return "", err
	}
	defer windows.CloseHandle(h)

	buf := make([]uint16, windows.MAX_PATH)
	size := uint32(len(buf))
	if err := windows.QueryFullProcessImageName(h, 0, &buf[0], &size); err != nil {
		return "", err
	}
	full := windows.UTF16ToString(buf[:size])
	return strings.TrimSuffix(filepath.Base(full), ".exe"), nil
}
