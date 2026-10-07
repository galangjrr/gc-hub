package main

import (
	"log"
	"path/filepath"
	"strings"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// The watchdog keeps the booth lock screen present: if the GC Hub client UI is closed while a
// booth user is logged in, the session would otherwise be left unlocked. The agent relaunches it.
//
// Safety: the relaunch target is fixed — the GC Hub client exe that ships beside this agent. The
// watchdog never runs a command supplied over the pipe or from anywhere else, so it cannot be
// turned into "start an arbitrary program as the logged-in user". It only ever re-opens the one
// known UI, and only while a console user is present.

const clientExeName = "GC-Hub-Client.exe"
const watchdogInterval = 5 * time.Second
const relaunchCooldown = 15 * time.Second

// clientExePath derives the UI next to the agent: <dist>\bin\gc-agent.exe -> <dist>\GC-Hub-Client.exe.
func clientExePath() string {
	exe, err := exePath()
	if err != nil {
		return ""
	}
	return filepath.Join(filepath.Dir(filepath.Dir(exe)), clientExeName)
}

type watchdog struct {
	stop         chan struct{}
	lastRelaunch time.Time
}

func newWatchdog() *watchdog { return &watchdog{stop: make(chan struct{})} }

func (w *watchdog) run() {
	target := clientExePath()
	if target == "" {
		log.Println("[watchdog] client exe path tak diketahui, watchdog nonaktif")
		return
	}
	t := time.NewTicker(watchdogInterval)
	defer t.Stop()
	for {
		select {
		case <-w.stop:
			return
		case <-t.C:
			w.tick(target)
		}
	}
}

func (w *watchdog) close() { close(w.stop) }

func (w *watchdog) tick(target string) {
	session := windows.WTSGetActiveConsoleSessionId()
	if session == 0xFFFFFFFF {
		return // no console user: nothing to lock, do not launch anything
	}
	if isProcessRunning(clientExeName) {
		return
	}
	if time.Since(w.lastRelaunch) < relaunchCooldown {
		return // the last launch is still coming up; don't spin
	}
	w.lastRelaunch = time.Now()
	if err := launchInSession(session, target); err != nil {
		log.Printf("[watchdog] gagal menghidupkan ulang client: %v", err)
	}
}

// isProcessRunning reports whether any process with the given exe name (case-insensitive) exists.
func isProcessRunning(name string) bool {
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return true // scan failed: assume alive so we never relaunch blindly on a transient error
	}
	defer windows.CloseHandle(snap)

	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	if err := windows.Process32First(snap, &entry); err != nil {
		return false
	}
	want := strings.ToLower(name)
	for {
		if strings.ToLower(windows.UTF16ToString(entry.ExeFile[:])) == want {
			return true
		}
		if err := windows.Process32Next(snap, &entry); err != nil {
			return false
		}
	}
}

// launchInSession starts the fixed client exe in the interactive console session, as that user.
func launchInSession(session uint32, exe string) error {
	var token windows.Token
	if err := windows.WTSQueryUserToken(session, &token); err != nil {
		return err
	}
	defer token.Close()

	appName, err := windows.UTF16PtrFromString(exe)
	if err != nil {
		return err
	}
	desktop, _ := windows.UTF16PtrFromString(`winsta0\default`)
	si := &windows.StartupInfo{Desktop: desktop}
	si.Cb = uint32(unsafe.Sizeof(*si))
	var pi windows.ProcessInformation

	err = windows.CreateProcessAsUser(token, appName, nil, nil, nil, false,
		windows.CREATE_NEW_CONSOLE, nil, nil, si, &pi)
	if err != nil {
		return err
	}
	windows.CloseHandle(pi.Thread)
	windows.CloseHandle(pi.Process)
	return nil
}
