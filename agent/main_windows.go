// Command gc-agent is the GC Hub privileged helper for booth (client) PCs.
//
// The GC Hub client UI runs as the standard auto-logon booth user ("GC Net"), which cannot
// write machine-wide kiosk policy. This agent runs as a LocalSystem Windows service so it can
// apply and clear those policies under HKLM on request from the local client over a named pipe.
//
// It is operator software for an internet cafe: the cafe owner installs it on their own booth
// PCs, and WindowsProvisioner.revertClient uninstalls it and clears every policy it set.
//
// Commands:
//
//	gc-agent install     copy itself to Program Files, install and start the service (run elevated,
//	                     e.g. during 1-click setup); reinstalls over an existing service
//	gc-agent uninstall   stop and remove the service
//	gc-agent debug       run in the foreground for development
//	(no args)            launched by the Service Control Manager
package main

import (
	"fmt"
	"os"
	"strings"

	"golang.org/x/sys/windows/svc"
)

const serviceName = "GCHubAgent"
const serviceDesc = "GC Hub Agent (booth kiosk policy helper)"

// clientFlag carries the booth client exe path into the service. It is fixed at install time
// (by the elevated provisioner) and stored in the service config, which only admins can change.
const clientFlag = "--client="

func main() {
	client := ""
	if len(os.Args) > 1 {
		arg := os.Args[1]
		switch {
		case strings.EqualFold(arg, "install"):
			exit(installService())
		case strings.EqualFold(arg, "uninstall"):
			exit(uninstallService())
		case strings.EqualFold(arg, "debug"):
			runService(true, clientExePath())
			return
		case strings.HasPrefix(arg, clientFlag):
			client = strings.TrimPrefix(arg, clientFlag)
		default:
			fmt.Fprintf(os.Stderr, "perintah tidak dikenal: %s\n", arg)
			os.Exit(2)
		}
	}

	isService, err := svc.IsWindowsService()
	if err != nil {
		exit(fmt.Errorf("gagal mendeteksi mode service: %w", err))
	}
	if !isService {
		fmt.Fprintln(os.Stderr, "jalankan sebagai service, atau pakai 'gc-agent debug'")
		os.Exit(1)
	}
	runService(false, client)
}

func exit(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	os.Exit(0)
}
