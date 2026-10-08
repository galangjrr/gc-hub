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
// Safety: the relaunch target is fixed: the client exe path the elevated provisioner recorded in
// the service config at install time. The watchdog never runs a command supplied over the pipe or
// from anywhere else, so it cannot be turned into "start an arbitrary program as the logged-in
// user". It only ever re-opens the one known UI, and only while a console user is present.

const clientExeName = "GC-Hub-Client.exe"
const watchdogInterval = 5 * time.Second
const relaunchCooldown = 15 * time.Second

// clientExePath derives the UI next to the running agent: <dist>\bin\gc-agent.exe -> <dist>\GC-Hub-Client.exe.
// Used at install time (the agent still runs from the client's bin\ folder then) and in debug mode.
func clientExePath() string {
	exe, err := exePath()
	if err != nil {
		return ""
	}
	return filepath.Join(filepath.Dir(filepath.Dir(exe)), clientExeName)
}

type watchdog struct {
	target       string
	stop         chan struct{}
	lastRelaunch time.Time
}

func newWatchdog(target string) *watchdog {
	return &watchdog{target: target, stop: make(chan struct{})}
}

func (w *watchdog) run() {
	if w.target == "" {
		log.Println("[watchdog] path client tidak dikonfigurasi, watchdog nonaktif")
		return
	}
	t := time.NewTicker(watchdogInterval)
	defer t.Stop()
	for {
		select {
		case <-w.stop:
			return
		case <-t.C:
			w.tick()
		}
	}
}

func (w *watchdog) close() { close(w.stop) }

func (w *watchdog) tick() {
	if !kioskEnabled() {
		return // operator switched the kiosk off: the client may stay closed
	}
	session := windows.WTSGetActiveConsoleSessionId()
	if session == 0xFFFFFFFF {
		return // no console user: nothing to lock, do not launch anything
	}
	if isRunning(w.target) {
		return
	}
	if time.Since(w.lastRelaunch) < relaunchCooldown {
		return // the last launch is still coming up; don't spin
	}
	w.lastRelaunch = time.Now()
	if err := launchInSession(session, w.target); err != nil {
		log.Printf("[watchdog] gagal menghidupkan ulang client: %v", err)
	}
}

// isRunning reports whether a process runs from exactly the given exe path. Matching the full
// path, not the name, means a decoy renamed to GC-Hub-Client.exe cannot keep the watchdog quiet.
func isRunning(target string) bool {
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return true // scan failed: assume alive so we never relaunch blindly on a transient error
	}
	defer windows.CloseHandle(snap)

	want := filepath.Clean(target)
	wantBase := strings.ToLower(filepath.Base(want))
	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	for err := windows.Process32First(snap, &entry); err == nil; err = windows.Process32Next(snap, &entry) {
		if strings.ToLower(windows.UTF16ToString(entry.ExeFile[:])) != wantBase {
			continue
		}
		h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, entry.ProcessID)
		if err != nil {
			continue
		}
		image, err := imagePath(h)
		windows.CloseHandle(h)
		if err == nil && strings.EqualFold(filepath.Clean(image), want) {
			return true
		}
	}
	return false
}

// launchInSession starts the fixed client exe in the interactive console session, as that user.
func launchInSession(session uint32, exe string) error {
	var token windows.Token
	if err := windows.WTSQueryUserToken(session, &token); err != nil {
		return err
	}
	defer token.Close()

	// Without an explicit block the child inherits this service's environment, which is SYSTEM's:
	// APPDATA would point at the systemprofile and the client would lose its user data.
	var env *uint16
	if err := windows.CreateEnvironmentBlock(&env, token, false); err != nil {
		return err
	}
	defer windows.DestroyEnvironmentBlock(env)

	appName, err := windows.UTF16PtrFromString(exe)
	if err != nil {
		return err
	}
	cmdLine, err := windows.UTF16PtrFromString(windows.EscapeArg(exe) + " --mode=client")
	if err != nil {
		return err
	}
	dir, err := windows.UTF16PtrFromString(filepath.Dir(exe))
	if err != nil {
		return err
	}
	desktop, _ := windows.UTF16PtrFromString(`winsta0\default`)
	si := &windows.StartupInfo{Desktop: desktop}
	si.Cb = uint32(unsafe.Sizeof(*si))
	var pi windows.ProcessInformation

	err = windows.CreateProcessAsUser(token, appName, cmdLine, nil, nil, false,
		windows.CREATE_UNICODE_ENVIRONMENT, env, dir, si, &pi)
	if err != nil {
		return err
	}
	windows.CloseHandle(pi.Thread)
	windows.CloseHandle(pi.Process)
	return nil
}
