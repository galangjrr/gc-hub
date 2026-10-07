package main

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
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
	agentRoot = registry.CURRENT_USER
	defer func() {
		_ = registry.DeleteKey(agentRoot, agentKey)
		agentRoot = registry.LOCAL_MACHINE
	}()
	_ = registry.DeleteKey(agentRoot, agentKey)

	if !kioskEnabled() {
		t.Fatal("missing key must read as kiosk on")
	}
	if err := setOrDeleteDword(agentRoot, agentKey, kioskValue, true); err != nil {
		t.Fatal(err)
	}
	if kioskEnabled() {
		t.Fatal("kiosk still on after switching it off")
	}
	k, err := registry.OpenKey(agentRoot, agentKey, registry.SET_VALUE)
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
	if err := setOrDeleteDword(agentRoot, agentKey, kioskValue, false); err != nil {
		t.Fatal(err)
	}
	if !kioskEnabled() {
		t.Fatal("kiosk not back on after switching it on")
	}
}

func TestValidateAllowPath(t *testing.T) {
	ok := []string{
		`%OSDRIVE%\Users\*\AppData\Local\Roblox\*`,
		`D:\Steam\*`,
		`D:\Launchers\Riot Games\*`,
		`%PROGRAMFILES%\Tools\app.exe`,
		`%OSDRIVE%\ProgramData\Battle.net\*`,
	}
	bad := []string{
		`*`,
		`D:\*`,
		`D:\`,
		`%OSDRIVE%\*`,
		`%OSDRIVE%\Users\*`,
		`%OSDRIVE%\Users\*\AppData\*`,
		`%OSDRIVE%\ProgramData\*`,
		`D:\Games\..\*`,
		`Games\*`,
		`%LOCALAPPDATA%\Roblox\*`,
		`D:\a"b\*`,
		`\server\share\*`,
	}
	for _, p := range ok {
		if err := validateAllowPath(p); err != nil {
			t.Errorf("%s: want ok, got %v", p, err)
		}
	}
	for _, p := range bad {
		if validateAllowPath(p) == nil {
			t.Errorf("%s: want rejected", p)
		}
	}
}

func TestBuildAppLockerXML(t *testing.T) {
	doc, err := buildAppLockerXML(ExePolicy{Mode: exeModeAudit, AllowPaths: []string{`D:\R&D\*`}}, `D:\GC Hub\GC-Hub-Client.exe`)
	if err != nil {
		t.Fatal(err)
	}
	var p alPolicy
	if err := xml.Unmarshal(doc, &p); err != nil {
		t.Fatalf("output is not valid XML: %v", err)
	}
	col := p.Collections[0]
	if col.Type != "Exe" || col.Mode != "AuditOnly" {
		t.Fatalf("collection = %s/%s, want Exe/AuditOnly", col.Type, col.Mode)
	}
	allowed := map[string]alRule{}
	for _, r := range col.Rules {
		allowed[r.Path.Path] = r
	}
	if r := allowed["*"]; r.SID != sidAdmins {
		t.Error("administrators must be allowed everything")
	}
	win, found := allowed[`%WINDIR%\*`]
	if !found || win.SID != sidEveryone {
		t.Fatal("Windows folder not allowed for everyone")
	}
	hasTemp := false
	for _, e := range win.Exceptions {
		hasTemp = hasTemp || e.Path == `%WINDIR%\Temp\*`
	}
	if !hasTemp {
		t.Error("user-writable Windows Temp folder must be excepted from the Windows rule")
	}
	for _, want := range []string{`%PROGRAMFILES%\*`, `D:\Games\*`, `D:\GC Hub\*`, `D:\R&D\*`} {
		if _, found := allowed[want]; !found {
			t.Errorf("%s missing from the allowlist", want)
		}
	}
	if _, found := allowed[`D:\*`]; found {
		t.Error("whole D: drive must not be allowed")
	}
	if !bytes.Contains(doc, []byte(`R&amp;D`)) {
		t.Error("operator path not XML-escaped")
	}
	if !strings.Contains(string(doc), `EnforcementMode="AuditOnly"`) {
		t.Error("audit mode not rendered")
	}

	off, err := buildAppLockerXML(ExePolicy{Mode: exeModeOff}, `D:\GC Hub\GC-Hub-Client.exe`)
	if err != nil {
		t.Fatal(err)
	}
	var offPolicy alPolicy
	if err := xml.Unmarshal(off, &offPolicy); err != nil {
		t.Fatal(err)
	}
	if offPolicy.Collections[0].Mode != "NotConfigured" || len(offPolicy.Collections[0].Rules) != 0 {
		t.Error("off must render an empty, not-configured collection")
	}
	enf, _ := buildAppLockerXML(ExePolicy{Mode: exeModeEnforce}, "")
	if !strings.Contains(string(enf), `EnforcementMode="Enabled"`) {
		t.Error("enforce mode not rendered")
	}
}

// TestExePolicyStorage checks the stored setting round-trips, a damaged one never opens the booth,
// and switching off a never-enabled allowlist touches nothing. Runs against HKCU, no admin needed.
func TestExePolicyStorage(t *testing.T) {
	agentRoot = registry.CURRENT_USER
	defer func() {
		_ = registry.DeleteKey(agentRoot, agentKey)
		agentRoot = registry.LOCAL_MACHINE
	}()
	_ = registry.DeleteKey(agentRoot, agentKey)

	if got := loadExePolicy(); got.Mode != exeModeOff {
		t.Fatalf("default mode = %s, want off", got.Mode)
	}
	// Never applied: off must be a no-op. Applying for real needs admin and would fail here.
	if err := syncExePolicy(ExePolicy{Mode: exeModeOff}, ""); err != nil {
		t.Fatalf("off on a never-enabled allowlist touched AppLocker: %v", err)
	}

	want := ExePolicy{Mode: exeModeAudit, AllowPaths: []string{`D:\Steam\*`}}
	if err := saveExePolicy(want); err != nil {
		t.Fatal(err)
	}
	if got := loadExePolicy(); got.Mode != want.Mode || len(got.AllowPaths) != 1 || got.AllowPaths[0] != want.AllowPaths[0] {
		t.Fatalf("round trip = %+v, want %+v", got, want)
	}

	k, err := registry.OpenKey(agentRoot, agentKey, registry.SET_VALUE)
	if err != nil {
		t.Fatal(err)
	}
	_ = k.SetStringValue(exeModeValue, "garbage")
	_ = k.SetStringsValue(exePathsValue, []string{`D:\*`, `D:\Steam\*`})
	k.Close()
	got := loadExePolicy()
	if got.Mode != exeModeEnforce {
		t.Errorf("damaged mode = %s, want enforce", got.Mode)
	}
	if len(got.AllowPaths) != 1 || got.AllowPaths[0] != `D:\Steam\*` {
		t.Errorf("damaged paths = %v, want only the valid one", got.AllowPaths)
	}

	if err := setOrDeleteDword(agentRoot, agentKey, kioskValue, true); err != nil {
		t.Fatal(err)
	}
	if effectiveExePolicy().Mode != exeModeOff {
		t.Error("kiosk off must lift the exe allowlist")
	}
}

// TestAppLockerXMLAcceptedByWindows feeds the generated policy to Windows' own AppLocker evaluator.
// Test-AppLockerPolicy only evaluates the XML offline; it never applies a policy to this machine.
// The cmdlet needs files that exist, so user-folder cases use copies of notepad under a temp dir.
func TestAppLockerXMLAcceptedByWindows(t *testing.T) {
	sysDir, err := windows.GetSystemDirectory()
	if err != nil {
		t.Fatal(err)
	}
	notepad := filepath.Join(sysDir, "notepad.exe")
	tmp := t.TempDir()
	place := func(rel string) string {
		p := filepath.Join(tmp, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := copyFile(notepad, p); err != nil {
			t.Fatal(err)
		}
		return p
	}

	// The AppData form operators use: any profile, via a wildcard in the middle of the path.
	home, err := os.UserHomeDir()
	if err != nil || !strings.HasPrefix(strings.ToLower(tmp), strings.ToLower(home)) {
		t.Skipf("temp dir %s is not under the user profile", tmp)
	}
	anyProfile := `%OSDRIVE%\Users\*` + tmp[len(home):] + `\wild\*`
	policy := ExePolicy{Mode: exeModeEnforce, AllowPaths: []string{filepath.Join(tmp, "operator") + `\*`, anyProfile}}
	if err := validateExePolicy(policy); err != nil {
		t.Fatalf("temp operator path should be a valid allow path: %v", err)
	}
	doc, err := buildAppLockerXML(policy, filepath.Join(tmp, "client", clientExeName))
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(tmp, "applocker.xml")
	if err := os.WriteFile(file, doc, 0o644); err != nil {
		t.Fatal(err)
	}
	pf, err := windows.KnownFolderPath(windows.FOLDERID_ProgramFiles, 0)
	if err != nil {
		t.Fatal(err)
	}
	cases := map[string]string{
		notepad: "Allowed",
		filepath.Join(pf, `Windows Defender\MpCmdRun.exe`): "Allowed",
		place(`client\bin\gc-probe.exe`):                   "Allowed",
		place(`operator\launcher\game.exe`):                "Allowed",
		place(`wild\Versions\roblox.exe`):                  "Allowed",
		place(`downloads\evil.exe`):                        "Denied",
	}
	for path, want := range cases {
		script := fmt.Sprintf("(Test-AppLockerPolicy -XmlPolicy '%s' -Path '%s' -User Everyone -ErrorAction Stop).PolicyDecision", file, path)
		out, err := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script).CombinedOutput()
		got := strings.TrimSpace(string(out))
		if err != nil {
			t.Fatalf("Windows rejected the policy XML for %s: %v: %s", path, err, got)
		}
		t.Logf("%s -> %s", path, got)
		// DeniedByDefault means no allow rule matched: blocked, same as an explicit deny.
		if !strings.HasPrefix(got, want) {
			t.Errorf("%s: Windows says %s, want %s", path, got, want)
		}
	}
}
