package main

import (
	"crypto/sha1"
	"encoding/xml"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
	"golang.org/x/sys/windows/svc/mgr"
)

// Exe allowlist for the booth user, enforced by AppLocker.
//
// The HKLM policies only hide Windows tools; anyone who can run their own exe walks past them.
// AppLocker closes that: for everyone except administrators, an exe may start only from Windows,
// Program Files, the game folders, the client folder, and the extra paths the operator allowed.
// A program brought on a flash drive or downloaded by the browser does not start.
//
// AppLocker over the alternatives: Software Restriction Policies no longer work out of the box on
// Windows 11 22H2+, and App Control for Business is device-wide (it would bind administrators too)
// and refuses path rules on folders users can write, which the game folders must be.
//
// The allowlist follows the kiosk switch: kiosk off means no exe restriction either.

const (
	exeModeOff     = "off"     // no AppLocker policy
	exeModeAudit   = "audit"   // log what would be blocked, block nothing
	exeModeEnforce = "enforce" // block
)

const (
	exeModeValue    = "ExeMode"
	exePathsValue   = "ExeAllowPaths"
	exeAppliedValue = "ExeApplied" // 1 while a policy this agent wrote is live
	maxAllowPaths   = 32
)

// ExePolicy is the operator's allowlist setting, stored under the agent key.
type ExePolicy struct {
	Mode       string   `json:"mode"`
	AllowPaths []string `json:"allowPaths"`
}

const (
	sidEveryone = "S-1-1-0"
	sidAdmins   = "S-1-5-32-544" // LocalSystem carries this group too, so services are never blocked
)

// gameDirs match the folders 1-Click Setup opens to the booth user (windowsProvisioner.ts). Only the
// game folders, not a whole drive: setup may grant the user all of D:\, and allowing that would let
// an exe dropped anywhere on D: run.
var gameDirs = []string{`C:\Games`, `D:\Games`, `E:\Games`}

// windowsWritable are folders under Windows that a standard user can write to. Without these
// exceptions the %WINDIR% rule would let a user copy an exe into one of them and run it.
//
// ponytail: fixed list of the known user-writable folders on Windows 10/11. A new Windows build
// may add one; the upgrade path is scanning %WINDIR% for folders writable by Users at apply time.
var windowsWritable = []string{
	`%WINDIR%\Tasks\*`,
	`%WINDIR%\Temp\*`,
	`%WINDIR%\tracing\*`,
	`%WINDIR%\debug\*`,
	`%WINDIR%\Registration\CRMLog\*`,
	`%WINDIR%\PLA\*`,
	`%WINDIR%\ServiceState\*`,
	`%SYSTEM32%\Tasks\*`,
	`%SYSTEM32%\Tasks_Migrated\*`,
	`%SYSTEM32%\com\dmp\*`,
	`%SYSTEM32%\FxsTmp\*`,
	`%SYSTEM32%\Microsoft\Crypto\RSA\MachineKeys\*`,
	`%SYSTEM32%\spool\PRINTERS\*`,
	`%SYSTEM32%\spool\SERVERS\*`,
	`%SYSTEM32%\spool\drivers\color\*`,
	`%SYSTEM32%\LogFiles\WMI\*`,
}

// AppLocker understands only these path variables (%SYSTEM32% also covers SysWOW64 and
// %PROGRAMFILES% both Program Files folders). Per-user ones such as %LOCALAPPDATA% are not
// supported, so an AppData folder is written as %OSDRIVE%\Users\*\AppData\Local\<app>\*.
var allowPathRe = regexp.MustCompile(`(?i)^(%(WINDIR|SYSTEM32|OSDRIVE|PROGRAMFILES)%|[a-z]:)(\\[^\\/:"<>|?]+)+$`)

// validateAllowPath guards against operator mistakes that would open the whole booth: it is not a
// security boundary, since anyone who can reach the pipe can also switch the kiosk off.
func validateAllowPath(p string) error {
	if len(p) > 260 || !allowPathRe.MatchString(p) {
		return fmt.Errorf("path tidak valid: %s", p)
	}
	segs := strings.Split(p, `\`)[1:]
	named := 0
	for _, s := range segs {
		if s == "." || s == ".." {
			return fmt.Errorf("path tidak boleh memakai . atau ..: %s", p)
		}
		if !strings.Contains(s, "*") {
			named++
		}
	}
	if strings.Contains(segs[0], "*") || named < minNamedFolders(segs[0]) {
		return fmt.Errorf("path terlalu luas: %s", p)
	}
	return nil
}

// minNamedFolders is how many folders must be named outright, by the top folder. D:\Steam\* is a
// fine launcher folder, but under Users an app folder sits four names deep
// (Users\*\AppData\Local\Roblox\*), and anything shorter opens every profile's AppData.
func minNamedFolders(top string) int {
	switch strings.ToLower(top) {
	case "users":
		return 4
	case "programdata":
		return 2
	}
	return 1
}

func validateExePolicy(p ExePolicy) error {
	switch p.Mode {
	case exeModeOff, exeModeAudit, exeModeEnforce:
	default:
		return fmt.Errorf("mode tidak dikenal: %q", p.Mode)
	}
	if len(p.AllowPaths) > maxAllowPaths {
		return fmt.Errorf("maksimal %d path tambahan", maxAllowPaths)
	}
	for _, path := range p.AllowPaths {
		if err := validateAllowPath(path); err != nil {
			return err
		}
	}
	return nil
}

// AppLocker policy XML, as accepted by Set-AppLockerPolicy.
type alPolicy struct {
	XMLName     xml.Name       `xml:"AppLockerPolicy"`
	Version     int            `xml:"Version,attr"`
	Collections []alCollection `xml:"RuleCollection"`
}

type alCollection struct {
	Type  string   `xml:"Type,attr"`
	Mode  string   `xml:"EnforcementMode,attr"`
	Rules []alRule `xml:"FilePathRule"`
}

type alRule struct {
	ID          string   `xml:"Id,attr"`
	Name        string   `xml:"Name,attr"`
	Description string   `xml:"Description,attr"`
	SID         string   `xml:"UserOrGroupSid,attr"`
	Action      string   `xml:"Action,attr"`
	Path        alPath   `xml:"Conditions>FilePathCondition"`
	Exceptions  []alPath `xml:"Exceptions>FilePathCondition"`
}

type alPath struct {
	Path string `xml:"Path,attr"`
}

// ruleID derives a stable GUID-shaped id from the rule's identity, so the same config always
// produces the same XML.
func ruleID(sid, path string) string {
	h := sha1.Sum([]byte(sid + "|" + strings.ToLower(path)))
	return fmt.Sprintf("%x-%x-%x-%x-%x", h[0:4], h[4:6], h[6:8], h[8:10], h[10:16])
}

func allowRule(name, sid, path string, exceptions ...string) alRule {
	r := alRule{ID: ruleID(sid, path), Name: name, SID: sid, Action: "Allow", Path: alPath{path}}
	for _, e := range exceptions {
		r.Exceptions = append(r.Exceptions, alPath{e})
	}
	return r
}

// buildAppLockerXML renders the exe allowlist. client is the booth client exe recorded at install
// time; its folder (with bin\ helpers) is always allowed. Mode off renders an empty, not-configured
// collection, which is how a previous policy is removed.
func buildAppLockerXML(p ExePolicy, client string) ([]byte, error) {
	col := alCollection{Type: "Exe", Mode: "NotConfigured"}
	switch p.Mode {
	case exeModeAudit:
		col.Mode = "AuditOnly"
	case exeModeEnforce:
		col.Mode = "Enabled"
	}
	if p.Mode != exeModeOff {
		col.Rules = append(col.Rules,
			allowRule("GC Hub: administrator bebas", sidAdmins, "*"),
			allowRule("GC Hub: Windows", sidEveryone, `%WINDIR%\*`, windowsWritable...),
			allowRule("GC Hub: Program Files", sidEveryone, `%PROGRAMFILES%\*`),
		)
		for _, dir := range gameDirs {
			col.Rules = append(col.Rules, allowRule("GC Hub: folder game", sidEveryone, dir+`\*`))
		}
		if client != "" {
			col.Rules = append(col.Rules, allowRule("GC Hub: aplikasi bilik", sidEveryone, filepath.Dir(client)+`\*`))
		}
		for _, path := range p.AllowPaths {
			col.Rules = append(col.Rules, allowRule("GC Hub: izin operator", sidEveryone, path))
		}
	}
	out, err := xml.MarshalIndent(alPolicy{Version: 1, Collections: []alCollection{col}}, "", "  ")
	if err != nil {
		return nil, err
	}
	return out, nil
}

func loadExePolicy() ExePolicy {
	p := ExePolicy{Mode: exeModeOff}
	k, err := registry.OpenKey(agentRoot, agentKey, registry.QUERY_VALUE)
	if err != nil {
		return p
	}
	defer k.Close()
	if mode, _, err := k.GetStringValue(exeModeValue); err == nil {
		p.Mode = mode
	}
	if validateExePolicy(ExePolicy{Mode: p.Mode}) != nil {
		p.Mode = exeModeEnforce // a damaged mode keeps the booth restricted, never opens it
	}
	paths, _, _ := k.GetStringsValue(exePathsValue)
	for _, path := range paths {
		if validateAllowPath(path) == nil && len(p.AllowPaths) < maxAllowPaths {
			p.AllowPaths = append(p.AllowPaths, path)
		}
	}
	return p
}

func saveExePolicy(p ExePolicy) error {
	k, _, err := registry.CreateKey(agentRoot, agentKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()
	if err := k.SetStringValue(exeModeValue, p.Mode); err != nil {
		return err
	}
	if len(p.AllowPaths) == 0 {
		if err := k.DeleteValue(exePathsValue); err != nil && err != registry.ErrNotExist {
			return err
		}
		return nil
	}
	return k.SetStringsValue(exePathsValue, p.AllowPaths)
}

// effectiveExePolicy is what should be live right now: the stored setting, or off while the
// kiosk switch is off.
func effectiveExePolicy() ExePolicy {
	if !kioskEnabled() {
		return ExePolicy{Mode: exeModeOff}
	}
	return loadExePolicy()
}

// syncExePolicy puts p live. It only ever touches AppLocker once this agent has applied a policy:
// switching "off" on a machine where the allowlist was never enabled is a no-op, so an install or a
// reboot never spawns PowerShell or wipes an AppLocker policy the owner set up themselves.
func syncExePolicy(p ExePolicy, client string) error {
	if p.Mode == exeModeOff && !exePolicyApplied() {
		return nil
	}
	if err := applyExePolicy(p, client); err != nil {
		return err
	}
	return setOrDeleteDword(agentRoot, agentKey, exeAppliedValue, p.Mode != exeModeOff)
}

func exePolicyApplied() bool {
	k, err := registry.OpenKey(agentRoot, agentKey, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()
	v, _, err := k.GetIntegerValue(exeAppliedValue)
	return err == nil && v == 1
}

// applyExePolicy writes the policy XML next to the agent (Program Files, admin-only: never a
// folder the booth user can swap the file in) and hands it to Set-AppLockerPolicy. Without -Merge
// the call replaces the local AppLocker policy, so the machine ends up exactly as configured.
func applyExePolicy(p ExePolicy, client string) error {
	doc, err := buildAppLockerXML(p, client)
	if err != nil {
		return err
	}
	dir, err := installDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	file := filepath.Join(dir, "applocker.xml")
	if err := os.WriteFile(file, doc, 0o644); err != nil {
		return err
	}
	if err := setAppIDSvc(p.Mode != exeModeOff); err != nil {
		return fmt.Errorf("gagal mengatur service AppIDSvc: %w", err)
	}
	sysDir, err := windows.GetSystemDirectory()
	if err != nil {
		return err
	}
	ps := filepath.Join(sysDir, `WindowsPowerShell\v1.0\powershell.exe`)
	cmd := exec.Command(ps, "-NoProfile", "-NonInteractive", "-Command",
		"Set-AppLockerPolicy -XmlPolicy '"+strings.ReplaceAll(file, "'", "''")+"' -ErrorAction Stop")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("Set-AppLockerPolicy gagal: %v: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

// setAppIDSvc runs the Application Identity service, which AppLocker needs to evaluate rules, and
// returns it to on-demand start when the policy is off. Its start type is protected from sc.exe,
// so it is set in the service's registry key, which SYSTEM may write.
func setAppIDSvc(on bool) error {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, `SYSTEM\CurrentControlSet\Services\AppIDSvc`, registry.SET_VALUE)
	if err != nil {
		return err
	}
	start := uint32(mgr.StartManual)
	if on {
		start = mgr.StartAutomatic
	}
	err = k.SetDWordValue("Start", start)
	k.Close()
	if err != nil || !on {
		return err
	}
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	s, err := m.OpenService("AppIDSvc")
	if err != nil {
		return err
	}
	defer s.Close()
	if err := s.Start(); err != nil && err != windows.ERROR_SERVICE_ALREADY_RUNNING {
		return err
	}
	return nil
}
