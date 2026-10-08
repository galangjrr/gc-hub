package main

import (
	"bufio"
	"encoding/json"
	"log"
	"net"
	"sync"

	"github.com/Microsoft/go-winio"
)

// pipeName is the local control channel between the booth client UI and this agent.
const pipeName = `\\.\pipe\gc-hub-agent`

// pipeSDDL grants full access to LocalSystem (SY) and Administrators (BA), and read/write to the
// built-in Users group (BU) so the standard booth user running the Electron client can connect.
//
// ponytail: any local process running as the booth user can therefore also send clear-policy and
// unlock the kiosk. That is bounded — escaping the kiosk already requires running arbitrary code,
// which the HKLM policies here are not meant to stop. The upgrade path is to require a
// server-signed unlock token (reuse lanAuth HMAC) on clear-policy; do it when booth bypass via a
// dropped executable becomes a real problem. The same holds for set-kiosk, with one difference:
// switching the kiosk off persists across reboots. It shows up on the cashier's PC panel through
// telemetry, so the operator sees a booth left unlocked and can switch it back on.
const pipeSDDL = "D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;BU)"

type request struct {
	ID     string       `json:"id"`
	Cmd    string       `json:"cmd"`
	Policy PolicyConfig `json:"policy"`
	PID    uint32       `json:"pid"`
	Name   string       `json:"name"`
	// Enabled is a pointer so a set-kiosk without it is rejected instead of read as "off".
	Enabled *bool `json:"enabled"`
}

type response struct {
	ID      string   `json:"id"`
	OK      bool     `json:"ok"`
	Error   string   `json:"error,omitempty"`
	Applied []string `json:"applied,omitempty"`
	Kiosk   *bool    `json:"kioskEnabled,omitempty"`
}

type pipeServer struct {
	mu       sync.Mutex // serialises registry writes across connections
	listener net.Listener
}

func newPipeServer() *pipeServer { return &pipeServer{} }

func (p *pipeServer) serve() {
	l, err := winio.ListenPipe(pipeName, &winio.PipeConfig{SecurityDescriptor: pipeSDDL})
	if err != nil {
		log.Fatalf("gagal membuka named pipe: %v", err)
	}
	p.listener = l
	for {
		conn, err := l.Accept()
		if err != nil {
			return // listener closed on service stop
		}
		go p.handle(conn)
	}
}

func (p *pipeServer) close() {
	if p.listener != nil {
		_ = p.listener.Close()
	}
}

func (p *pipeServer) handle(conn net.Conn) {
	defer conn.Close()
	scanner := bufio.NewScanner(conn)
	scanner.Buffer(make([]byte, 0, 4096), 1<<16)
	enc := json.NewEncoder(conn)

	for scanner.Scan() {
		var req request
		if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
			_ = enc.Encode(response{OK: false, Error: "permintaan tidak valid"})
			continue
		}
		_ = enc.Encode(p.dispatch(req))
	}
}

func (p *pipeServer) dispatch(req request) response {
	switch req.Cmd {
	case "ping":
		on := kioskEnabled()
		return response{ID: req.ID, OK: true, Kiosk: &on}
	case "apply-policy":
		p.mu.Lock()
		cfg := req.Policy
		if !kioskEnabled() {
			cfg = PolicyConfig{} // kiosk switched off: reconcile to unlocked, never lock
		}
		applied, err := applyPolicy(cfg)
		p.mu.Unlock()
		return result(req.ID, applied, err)
	case "set-kiosk":
		if req.Enabled == nil {
			return response{ID: req.ID, OK: false, Error: "field enabled wajib diisi"}
		}
		p.mu.Lock()
		err := setKioskEnabled(*req.Enabled)
		p.mu.Unlock()
		if err != nil {
			return response{ID: req.ID, OK: false, Error: err.Error()}
		}
		return response{ID: req.ID, OK: true, Kiosk: req.Enabled}
	case "clear-policy":
		p.mu.Lock()
		err := clearPolicy()
		p.mu.Unlock()
		return result(req.ID, nil, err)
	case "kill-process":
		return result(req.ID, nil, killProcess(req.PID, req.Name))
	default:
		return response{ID: req.ID, OK: false, Error: "perintah tidak dikenal: " + req.Cmd}
	}
}

func result(id string, applied []string, err error) response {
	if err != nil {
		return response{ID: id, OK: false, Error: err.Error()}
	}
	return response{ID: id, OK: true, Applied: applied}
}
