package main

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/eventlog"
	"golang.org/x/sys/windows/svc/mgr"
)

// handler implements svc.Handler: it runs the pipe server and stops it on a control request.
type handler struct{ client string }

func (h handler) Execute(_ []string, r <-chan svc.ChangeRequest, s chan<- svc.Status) (bool, uint32) {
	const accepted = svc.AcceptStop | svc.AcceptShutdown
	s <- svc.Status{State: svc.StartPending}

	srv := newPipeServer(h.client)
	go srv.serve()
	go srv.startupReconcile()
	wd := newWatchdog(h.client)
	go wd.run()
	s <- svc.Status{State: svc.Running, Accepts: accepted}

	for c := range r {
		switch c.Cmd {
		case svc.Interrogate:
			s <- c.CurrentStatus
		case svc.Stop:
			// A Stop is deliberate (service uninstall during revert, or an operator): leave the
			// machine unlocked so revert never strands a kiosk policy the user cannot undo.
			s <- svc.Status{State: svc.StopPending}
			_ = clearPolicy()
			_ = syncExePolicy(ExePolicy{Mode: exeModeOff}, "")
			wd.close()
			srv.close()
			return false, 0
		case svc.Shutdown:
			// A reboot keeps the policy: the client re-locks on next boot before the user can act.
			s <- svc.Status{State: svc.StopPending}
			wd.close()
			srv.close()
			return false, 0
		}
	}
	return false, 0
}

func runService(debug bool, client string) {
	if debug {
		log.SetPrefix("[gc-agent] ")
		go newWatchdog(client).run()
		srv := newPipeServer(client)
		go srv.startupReconcile()
		srv.serve() // blocks
		return
	}
	// Best-effort event log; service still runs if the source was never registered.
	if elog, err := eventlog.Open(serviceName); err == nil {
		defer elog.Close()
	}
	if err := svc.Run(serviceName, handler{client: client}); err != nil {
		log.Fatalf("service gagal berjalan: %v", err)
	}
}

// installDir is where the service binary lives. A LocalSystem service must never run from a folder
// the booth user can write to, or replacing the exe there would hand that user SYSTEM on the next
// start. The client folder is often on a drive the booth user fully controls, so the agent copies
// itself under Program Files, which only administrators can modify.
func installDir() (string, error) {
	pf, err := windows.KnownFolderPath(windows.FOLDERID_ProgramFiles, 0)
	if err != nil {
		return "", fmt.Errorf("gagal membaca folder Program Files: %w", err)
	}
	return filepath.Join(pf, "GC Hub Agent"), nil
}

func installService() error {
	client := clientExePath()
	if client == "" {
		return fmt.Errorf("path client tidak diketahui")
	}
	if _, err := os.Stat(client); err != nil {
		return fmt.Errorf("client %s tidak ditemukan: %w", client, err)
	}
	src, err := exePath()
	if err != nil {
		return err
	}
	dir, err := installDir()
	if err != nil {
		return err
	}

	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("gagal konek Service Control Manager (butuh admin): %w", err)
	}
	defer m.Disconnect()

	// Reinstall over an existing service so a newer agent replaces the old one.
	if err := removeService(m); err != nil {
		return err
	}

	dst := filepath.Join(dir, "gc-agent.exe")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("gagal membuat %s: %w", dir, err)
	}
	if err := copyFile(src, dst); err != nil {
		return fmt.Errorf("gagal menyalin agent ke %s: %w", dst, err)
	}

	s, err := m.CreateService(serviceName, dst, mgr.Config{
		DisplayName: serviceDesc,
		Description: serviceDesc,
		StartType:   mgr.StartAutomatic,
	}, clientFlag+client)
	if err != nil {
		return fmt.Errorf("gagal membuat service: %w", err)
	}
	defer s.Close()
	_ = eventlog.InstallAsEventCreate(serviceName, eventlog.Error|eventlog.Warning|eventlog.Info)
	if err := s.Start(); err != nil {
		return fmt.Errorf("service terpasang tapi gagal start: %w", err)
	}
	return nil
}

func uninstallService() error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("gagal konek Service Control Manager (butuh admin): %w", err)
	}
	defer m.Disconnect()
	if err := removeService(m); err != nil {
		return err
	}
	// The Stop above already lifts the exe allowlist; repeat it for a service that was not running,
	// so revert never leaves a booth where only the old allowlist can start.
	if err := syncExePolicy(ExePolicy{Mode: exeModeOff}, ""); err != nil {
		return fmt.Errorf("gagal mencabut AppLocker: %w", err)
	}
	if dir, err := installDir(); err == nil {
		_ = os.RemoveAll(dir)
	}
	// Forget the kiosk switch so a later install starts locked again.
	_ = registry.DeleteKey(registry.LOCAL_MACHINE, agentKey)
	return nil
}

// removeService stops the service, waits for it to exit so its exe is no longer locked, and
// deletes it. A missing service is not an error, so revert and reinstall never fail on it.
func removeService(m *mgr.Mgr) error {
	s, err := m.OpenService(serviceName)
	if err != nil {
		return nil
	}
	defer s.Close()
	_, _ = s.Control(svc.Stop)
	for deadline := time.Now().Add(15 * time.Second); time.Now().Before(deadline); {
		st, err := s.Query()
		if err != nil || st.State == svc.Stopped {
			break
		}
		time.Sleep(300 * time.Millisecond)
	}
	if err := s.Delete(); err != nil {
		return fmt.Errorf("gagal menghapus service: %w", err)
	}
	_ = eventlog.Remove(serviceName)
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
