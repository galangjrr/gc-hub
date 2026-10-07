// Command gc-input is the GC Hub remote-assist input helper. The operator at the cashier console
// can take over a booth station to help a customer; this helper applies the pointer and keyboard
// events the operator sends, relayed by the server to the booth client.
//
// It is a resident daemon spawned by the Electron client over stdin, reading one command per line.
// It replaces a C# helper the client used to compile with csc.exe at runtime (fragile: needed the
// .NET Framework compiler on every booth PC). The command protocol is unchanged.
//
// It must run in the booth user's session (where the client spawns it): a service in session 0
// cannot inject into the interactive desktop, so this does not belong in the SYSTEM agent.
//
// Protocol (whitespace-separated, one per line):
//
//	M x y              move cursor
//	MD|MU left|right|middle   button down / up
//	CLICK left|right|double   full click (double = two clicks)
//	W delta            mouse wheel
//	KD|KU vk           virtual-key down / up
//	COMBO vk vk ...    press all down then release in reverse (e.g. Ctrl+Alt+Del assist)
//	BOTTOM hwnd        send a window to the bottom of the z-order (the floating widget)
//	TEXT ...           type the rest of the line as Unicode text
package main

import (
	"bufio"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/sys/windows"
)

const (
	mouseLeftDown   = 0x0002
	mouseLeftUp     = 0x0004
	mouseRightDown  = 0x0008
	mouseRightUp    = 0x0010
	mouseMiddleDown = 0x0020
	mouseMiddleUp   = 0x0040
	mouseWheel      = 0x0800

	keyUp      = 0x0002
	keyUnicode = 0x0004

	swNoMoveSizeNoActivate = 0x0001 | 0x0002 | 0x0010
	hwndBottom             = 1
)

var (
	user32           = windows.NewLazySystemDLL("user32.dll")
	procSetCursorPos = user32.NewProc("SetCursorPos")
	procMouseEvent   = user32.NewProc("mouse_event")
	procKeybdEvent   = user32.NewProc("keybd_event")
	procSetWindowPos = user32.NewProc("SetWindowPos")
)

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 0, 4096), 1<<16)
	for scanner.Scan() {
		handle(scanner.Text())
	}
}

func handle(line string) {
	line = strings.TrimRight(line, "\r")
	if line == "" {
		return
	}
	parts := strings.Fields(line)
	switch strings.ToUpper(parts[0]) {
	case "M":
		if len(parts) >= 3 {
			procSetCursorPos.Call(uintptr(atoi(parts[1])), uintptr(atoi(parts[2])))
		}
	case "MD":
		if len(parts) >= 2 {
			mouseButton(parts[1], true)
		}
	case "MU":
		if len(parts) >= 2 {
			mouseButton(parts[1], false)
		}
	case "CLICK":
		if len(parts) >= 2 {
			click(parts[1])
		}
	case "W":
		if len(parts) >= 2 {
			procMouseEvent.Call(mouseWheel, 0, 0, uintptr(uint32(int32(atoi(parts[1])))), 0)
		}
	case "KD":
		if len(parts) >= 2 {
			procKeybdEvent.Call(uintptr(byte(atoi(parts[1]))), 0, 0, 0)
		}
	case "KU":
		if len(parts) >= 2 {
			procKeybdEvent.Call(uintptr(byte(atoi(parts[1]))), 0, keyUp, 0)
		}
	case "COMBO":
		combo(parts[1:])
	case "BOTTOM":
		if len(parts) >= 2 {
			if h, err := strconv.ParseUint(parts[1], 10, 64); err == nil {
				procSetWindowPos.Call(uintptr(h), hwndBottom, 0, 0, 0, 0, swNoMoveSizeNoActivate)
			}
		}
	case "TEXT":
		if len(line) > 5 {
			typeText(line[5:])
		}
	}
}

func mouseButton(btn string, down bool) {
	var flag uintptr
	switch strings.ToLower(btn) {
	case "left":
		flag = pick(down, mouseLeftDown, mouseLeftUp)
	case "right":
		flag = pick(down, mouseRightDown, mouseRightUp)
	case "middle":
		flag = pick(down, mouseMiddleDown, mouseMiddleUp)
	default:
		return
	}
	procMouseEvent.Call(flag, 0, 0, 0, 0)
}

func click(btn string) {
	if strings.ToLower(btn) == "double" {
		leftClick()
		time.Sleep(50 * time.Millisecond)
		leftClick()
		return
	}
	mouseButton(btn, true)
	mouseButton(btn, false)
}

func leftClick() {
	procMouseEvent.Call(mouseLeftDown, 0, 0, 0, 0)
	procMouseEvent.Call(mouseLeftUp, 0, 0, 0, 0)
}

func combo(vks []string) {
	if len(vks) == 0 {
		return
	}
	for _, s := range vks {
		procKeybdEvent.Call(uintptr(byte(atoi(s))), 0, 0, 0)
	}
	time.Sleep(50 * time.Millisecond)
	for i := len(vks) - 1; i >= 0; i-- {
		procKeybdEvent.Call(uintptr(byte(atoi(vks[i]))), 0, keyUp, 0)
	}
}

// typeText sends each UTF-16 code unit as a Unicode key event, so symbols and non-ASCII work
// without depending on the booth keyboard layout.
func typeText(text string) {
	for _, u := range windows.StringToUTF16(text) {
		if u == 0 {
			continue
		}
		procKeybdEvent.Call(0, uintptr(u), keyUnicode, 0)
		procKeybdEvent.Call(0, uintptr(u), keyUnicode|keyUp, 0)
	}
}

func atoi(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

func pick(cond bool, a, b uintptr) uintptr {
	if cond {
		return a
	}
	return b
}
