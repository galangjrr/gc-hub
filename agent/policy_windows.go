package main

import (
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/registry"
)

// PolicyConfig mirrors KioskPolicy in src/main/agentClient.ts, the shape the client sends.
// A field left out defaults to false (policy not applied), which is the same as asking the
// agent to clear it.
type PolicyConfig struct {
	DisableTaskMgr       bool `json:"disableTaskMgr"`
	DisableControlPanel  bool `json:"disableControlPanel"`
	DisableRunDialog     bool `json:"disableRunDialog"`
	DisableRegistryTools bool `json:"disableRegistryTools"`
}

// Machine-wide kiosk policies. These live under HKLM, so the standard booth user cannot change
// them (that is exactly what the Electron client could not do on its own). Windows honours the
// HKLM Policies hive for every interactive user on the machine.
const (
	policySystemKey   = `SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System`
	policyExplorerKey = `SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer`
)

type policyValue struct {
	key  string
	name string
	want func(PolicyConfig) bool
}

var policyValues = []policyValue{
	{policySystemKey, "DisableTaskMgr", func(c PolicyConfig) bool { return c.DisableTaskMgr }},
	{policySystemKey, "DisableRegistryTools", func(c PolicyConfig) bool { return c.DisableRegistryTools }},
	{policyExplorerKey, "NoControlPanel", func(c PolicyConfig) bool { return c.DisableControlPanel }},
	{policyExplorerKey, "NoRun", func(c PolicyConfig) bool { return c.DisableRunDialog }},
}

// applyPolicy sets each policy value to 1 when its config flag is on and deletes it when off, so
// a single call fully reconciles machine state to the requested config (apply and partial-clear
// both go through here). Returns the names actually set.
func applyPolicy(c PolicyConfig) ([]string, error) {
	var applied []string
	for _, pv := range policyValues {
		on := pv.want(c)
		if err := setOrDeleteDword(registry.LOCAL_MACHINE, pv.key, pv.name, on); err != nil {
			return applied, fmt.Errorf("%s: %w", pv.name, err)
		}
		if on {
			applied = append(applied, pv.name)
		}
	}
	return applied, nil
}

// clearPolicy removes every value this agent manages, returning the machine to an unlocked state.
func clearPolicy() error {
	_, err := applyPolicy(PolicyConfig{})
	return err
}

// The kiosk switch. Off means the operator has taken the booth out of kiosk mode (maintenance,
// a client update): the policy is cleared, apply-policy clears instead of locking, and the
// watchdog stops relaunching the client. It lives under HKLM so it survives reboots and only
// SYSTEM or an administrator can write it directly. A missing or unreadable value means on, so a
// fresh install is locked and a damaged value never unlocks the booth by accident.
var kioskRoot = registry.LOCAL_MACHINE

const (
	kioskKey   = `SOFTWARE\GC Hub Agent`
	kioskValue = "KioskDisabled"
)

func kioskEnabled() bool {
	k, err := registry.OpenKey(kioskRoot, kioskKey, registry.QUERY_VALUE)
	if err != nil {
		return true
	}
	defer k.Close()
	v, _, err := k.GetIntegerValue(kioskValue)
	return err != nil || v == 0
}

func setKioskEnabled(on bool) error {
	if err := setOrDeleteDword(kioskRoot, kioskKey, kioskValue, !on); err != nil {
		return err
	}
	if on {
		return nil // the client re-applies the policy on its next lock
	}
	return clearPolicy()
}

func setOrDeleteDword(root registry.Key, keyPath, name string, on bool) error {
	k, _, err := registry.CreateKey(root, keyPath, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()
	if on {
		return k.SetDWordValue(name, 1)
	}
	if err := k.DeleteValue(name); err != nil && err != registry.ErrNotExist {
		return err
	}
	return nil
}

func exePath() (string, error) {
	p, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Clean(p), nil
}
