package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

func TestCheckTarget(t *testing.T) {
	const console = 1
	cases := []struct {
		name      string
		requested string
		image     string
		session   uint32
		ok        bool
	}{
		{"user app in console session", "notepad.exe", `C:\Windows\notepad.exe`, console, true},
		{"name compared case-insensitively", "NOTEPAD", `C:\Windows\notepad.exe`, console, true},
		{"lying about the name", "notepad.exe", `C:\Windows\System32\lsass.exe`, console, false},
		{"protected even when named honestly", "csrss.exe", `C:\Windows\System32\csrss.exe`, console, false},
		{"name mismatch", "chrome.exe", `C:\Games\game.exe`, console, false},
		{"service in session 0", "updater.exe", `C:\Program Files\X\updater.exe`, 0, false},
		{"another user's session", "notepad.exe", `C:\Windows\notepad.exe`, 2, false},
	}
	for _, c := range cases {
		err := checkTarget(c.requested, c.image, c.session, console)
		if (err == nil) != c.ok {
			t.Errorf("%s: got err=%v, want ok=%v", c.name, err, c.ok)
		}
	}
}

// TestKillProcessUsesRealName starts a real process and checks the agent kills it only when the
// request names it truthfully, and only when it lives in the console session.
func TestKillProcessUsesRealName(t *testing.T) {
	cmd := exec.Command("ping", "-n", "30", "127.0.0.1")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer cmd.Process.Kill()
	pid := uint32(cmd.Process.Pid)

	if err := killProcess(pid, "notepad.exe"); err == nil {
		t.Fatal("killed a process requested under a false name")
	}

	var mine uint32
	if err := windows.ProcessIdToSessionId(pid, &mine); err != nil {
		t.Fatal(err)
	}
	err := killProcess(pid, "PING.EXE")
	if mine == windows.WTSGetActiveConsoleSessionId() {
		if err != nil {
			t.Fatalf("console-session process not killed: %v", err)
		}
		_ = cmd.Wait()
	} else if err == nil {
		t.Fatal("killed a process outside the console session")
	}
}

func TestIsRunningMatchesFullPath(t *testing.T) {
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	if !isRunning(self) {
		t.Fatal("own process not found by full path")
	}
	decoy := filepath.Join(os.TempDir(), "elsewhere", filepath.Base(self))
	if isRunning(decoy) {
		t.Fatal("same exe name in another folder counted as the client")
	}
}

// TestKioskSwitchFailsClosed checks the kiosk switch reads "on" unless it was explicitly switched
// off. It runs against HKCU so it needs no admin rights.
func TestKioskSwitchFailsClosed(t *testing.T) {
	kioskRoot = registry.CURRENT_USER
	defer func() {
		_ = registry.DeleteKey(kioskRoot, kioskKey)
		kioskRoot = registry.LOCAL_MACHINE
	}()
	_ = registry.DeleteKey(kioskRoot, kioskKey)

	if !kioskEnabled() {
		t.Fatal("missing key must read as kiosk on")
	}
	if err := setOrDeleteDword(kioskRoot, kioskKey, kioskValue, true); err != nil {
		t.Fatal(err)
	}
	if kioskEnabled() {
		t.Fatal("kiosk still on after switching it off")
	}
	k, err := registry.OpenKey(kioskRoot, kioskKey, registry.SET_VALUE)
	if err != nil {
		t.Fatal(err)
	}
	err = k.SetStringValue(kioskValue, "1")
	k.Close()
	if err != nil {
		t.Fatal(err)
	}
	if !kioskEnabled() {
		t.Fatal("a value of the wrong type must not unlock the booth")
	}
	if err := setOrDeleteDword(kioskRoot, kioskKey, kioskValue, false); err != nil {
		t.Fatal(err)
	}
	if !kioskEnabled() {
		t.Fatal("kiosk not back on after switching it on")
	}
}
