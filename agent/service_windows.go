package main

import (
	"fmt"
	"log"

	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/eventlog"
	"golang.org/x/sys/windows/svc/mgr"
)

// handler implements svc.Handler: it runs the pipe server and stops it on a control request.
type handler struct{}

func (handler) Execute(_ []string, r <-chan svc.ChangeRequest, s chan<- svc.Status) (bool, uint32) {
	const accepted = svc.AcceptStop | svc.AcceptShutdown
	s <- svc.Status{State: svc.StartPending}

	srv := newPipeServer()
	go srv.serve()
	wd := newWatchdog()
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

func runService(debug bool) {
	if debug {
		log.SetPrefix("[gc-agent] ")
		go newWatchdog().run()
		srv := newPipeServer()
		srv.serve() // blocks
		return
	}
	// Best-effort event log; service still runs if the source was never registered.
	if elog, err := eventlog.Open(serviceName); err == nil {
		defer elog.Close()
	}
	if err := svc.Run(serviceName, handler{}); err != nil {
		log.Fatalf("service gagal berjalan: %v", err)
	}
}

func installService() error {
	exe, err := exePath()
	if err != nil {
		return err
	}
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("gagal konek Service Control Manager (butuh admin): %w", err)
	}
	defer m.Disconnect()

	if s, err := m.OpenService(serviceName); err == nil {
		s.Close()
		return fmt.Errorf("service %s sudah terpasang", serviceName)
	}

	s, err := m.CreateService(serviceName, exe, mgr.Config{
		DisplayName: serviceDesc,
		Description: serviceDesc,
		StartType:   mgr.StartAutomatic,
	})
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

	s, err := m.OpenService(serviceName)
	if err != nil {
		return nil // already gone: uninstall is idempotent so revert never fails on a missing service
	}
	defer s.Close()
	_, _ = s.Control(svc.Stop)
	if err := s.Delete(); err != nil {
		return fmt.Errorf("gagal menghapus service: %w", err)
	}
	_ = eventlog.Remove(serviceName)
	return nil
}
