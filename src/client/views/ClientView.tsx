import React, { useState, useEffect, useRef } from 'react';
import { X, KeyRound, User, RefreshCw, Power, Ticket, WifiOff, Network, Shield, CheckCircle, AlertTriangle, Zap, RotateCcw, Wrench, Check, LogIn, Eye, EyeOff } from 'lucide-react';
import { FloatingCapsule, type ClientCatalog, type OverlayLayout, type WidgetToast } from '../components/FloatingCapsule';
import { AfkUnlockForm } from '../components/AfkUnlockForm';
import { LockLayout, formatClock } from '../components/LockLayout';
import { ClientTaskManagerModal } from '../components/ClientTaskManagerModal';
import { ClientSecurityBridge } from '../security/securityBridge';
import { ProcessWatcherGuard } from '../security/processGuard';
import { ClientNetworkService } from '../network/clientNetwork';
import { OpCode, Packet, RemoteCommandPayload, SessionData, KillProcessPayload, AdminAuthResult } from '../../shared/protocol';

import { GCHubDialog, DialogType } from '../components/GCHubDialog';
import { Switch } from '../../shared/ui/primitives';
import { applyTheme, getTheme, type Theme } from '../../shared/theme';

type AdminAction = 'config' | 'tech' | 'exit';

export const ClientView: React.FC = () => {
  const [activeSession, setActiveSession] = useState<SessionData | null>(null);
  const [isAfkLocked, setIsAfkLocked] = useState(false);
  const [afkPin, setAfkPin] = useState('');
  const [showClientPassword, setShowClientPassword] = useState(false);
  const [isTaskManagerOpen, setIsTaskManagerOpen] = useState(false);
  const [isConnectedToServer, setIsConnectedToServer] = useState(false);
  const [workstationInfo, setWorkstationInfo] = useState(ClientNetworkService.getWorkstationConfig());

  // LAN Workstation Config Modal & Admin Auth (Protected)
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showAdminAuthModal, setShowAdminAuthModal] = useState(false);
  const [adminUserInput, setAdminUserInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminAuthError, setAdminAuthError] = useState('');
  const [adminAuthPending, setAdminAuthPending] = useState(false);
  const adminActionRef = useRef<AdminAction>('config');
  // Mode Teknisi: pembatasan Windows dilepas sementara setelah akun admin terverifikasi
  const [isTechMode, setIsTechMode] = useState(false);
  // Kunci LAN yang tersimpan di client-config: dipakai memverifikasi admin saat server tidak terjangkau
  const savedLanSecretRef = useRef('');
  // Tebakan Kunci LAN offline tidak dibatasi server, jadi dibatasi di sini: 5 salah = tunggu 60 detik
  const offlineAuthFailRef = useRef({ count: 0, lockedUntil: 0 });
  const [cfgServerIp, setCfgServerIp] = useState(ClientNetworkService.getServerUrl().replace(/^ws:\/\//, '').replace(/:7894$/, ''));
  const [cfgPcId, setCfgPcId] = useState(workstationInfo.pcId);
  const [machineHostname, setMachineHostname] = useState('');
  const [cfgLanSecret, setCfgLanSecret] = useState('');
  const [theme, setTheme] = useState<Theme>(getTheme);
  const [configTab, setConfigTab] = useState<'network' | 'provision'>('network');
  const [provisionStatus, setProvisionStatus] = useState<any>(null);
  // Saklar Mode Kiosk dari gc-agent: undefined = sedang dibaca, null = agent belum terpasang
  const [kiosk, setKiosk] = useState<boolean | null | undefined>(undefined);
  const [kioskPending, setKioskPending] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);

  // Custom Dialog Popup State
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: DialogType;
    onConfirm: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    onConfirm: () => {},
  });

  const showCustomAlert = (title: string, message: string, type: DialogType = 'info') => {
    try {
      (window as any).electronAPI?.showNativeNotification?.(title, message);
    } catch (e) {}
    setDialogConfig({
      isOpen: true,
      title,
      message,
      type,
      onConfirm: () => setDialogConfig(prev => ({ ...prev, isOpen: false })),
    });
  };

  // Notifikasi selama sesi: toast di widget supaya game tidak tertutup dialog layar penuh.
  // Tanpa widget (layar kunci, modal admin) tetap dialog. Dibaca lewat ref karena listener
  // jaringan dipasang sekali dan menyimpan closure render pertama.
  const [toasts, setToasts] = useState<WidgetToast[]>([]);
  const widgetVisibleRef = useRef(false);
  const dismissToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));
  const notify = (title: string, message: string, type: DialogType = 'info') => {
    if (!widgetVisibleRef.current) return showCustomAlert(title, message, type);
    try {
      (window as any).electronAPI?.showNativeNotification?.(title, message);
    } catch {
      // notifikasi Windows opsional
    }
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev.slice(-2), { id, title, message, type }]);
    // peringatan dan error lebih lama supaya sempat terbaca di tengah game
    setTimeout(() => dismissToast(id), type === 'warning' || type === 'error' ? 8000 : 3000);
  };

  const showCustomConfirm = (title: string, message: string, onConfirm: () => void) => {
    setDialogConfig({
      isOpen: true,
      title,
      message,
      type: 'confirm',
      onConfirm: () => {
        setDialogConfig(prev => ({ ...prev, isOpen: false }));
        onConfirm();
      },
      onCancel: () => setDialogConfig(prev => ({ ...prev, isOpen: false })),
    });
  };

  // Form input & inline confirmation state ('none' | 'restart' | 'shutdown')
  const [loginTab, setLoginTab] = useState<'member' | 'voucher'>('member');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [inlineAction, setInlineAction] = useState<'none' | 'restart' | 'shutdown'>('none');
  const [loginError, setLoginError] = useState('');
  // Server menjawab login yang ditolak dengan SESSION_END juga. Ref ini menandai
  // SESSION_END berikutnya sebagai penolakan login, bukan akhir sesi yang sedang jalan.
  const awaitingAuthRef = useRef(false);
  // Sesi di-pause kasir: server berhenti menagih, jadi timer lokal juga berhenti
  const pausedRef = useRef(false);
  const sendAuthRequest = (payload: { username: string; password: string; userType: string; pcId: string }) => {
    awaitingAuthRef.current = true;
    ClientNetworkService.send(OpCode.AUTH_REQUEST, payload);
  };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pcLabel = workstationInfo.pcName || workstationInfo.pcId || 'PC-01';

  // Server tidak menjawab login/voucher: lepas tombol supaya pemain bisa coba lagi
  useEffect(() => {
    if (!isSubmitting) return;
    const t = setTimeout(() => {
      setIsSubmitting(false);
      setLoginError('Server kasir tidak menjawab. Coba lagi.');
    }, 8000);
    return () => clearTimeout(t);
  }, [isSubmitting]);

  // Peringatan sisa 5 dan 1 menit: sekali per ambang, siap lagi kalau paket ditambah
  const warnedRef = useRef({ five: false, one: false });

  // Web Audio tone synthesizer for 5m/1m warnings (No external audio file dependency)
  const playWarningAlertSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.30);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.warn('[AUDIO SYNTH] Audio playback not permitted:', e);
    }
  };

  // 1. DUAL-TIMER TICKER: Local independent 1s interval that gracefully reconciles with server ticks
  const hasActiveSession = Boolean(activeSession);

  useEffect(() => {
    if (!hasActiveSession) return;

    const timer = setInterval(() => {
      if (pausedRef.current) return;
      setActiveSession(prev => {
        if (!prev) return null;

        const isPrepaid = prev.billingType === 'prepaid' || prev.billingType === 'prepaid' || prev.billingType === 'package' || prev.billingType === 'member';
        const currentRem = prev.remainingSeconds !== undefined ? prev.remainingSeconds : (prev.timeRemainingMinutes ? prev.timeRemainingMinutes * 60 : undefined);
        const currentElap = prev.elapsedSeconds !== undefined ? prev.elapsedSeconds : (prev.timeUsedMinutes * 60);

        let nextRem = currentRem;
        let nextElap = currentElap + 1;

        if (isPrepaid && currentRem !== undefined) {
          nextRem = Math.max(0, currentRem - 1);
        }

        return {
          ...prev,
          remainingSeconds: nextRem,
          elapsedSeconds: nextElap,
          timeRemainingMinutes: nextRem !== undefined ? Math.ceil(nextRem / 60) : undefined,
          timeUsedMinutes: Math.floor(nextElap / 60)
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [hasActiveSession]);

  // 2. Peringatan waktu: di luar updater state supaya tidak terpicu ganda
  const remainingSeconds = activeSession?.remainingSeconds;
  const isPrepaidSession = ['prepaid', 'package', 'member'].includes(activeSession?.billingType as string);
  useEffect(() => {
    if (!isPrepaidSession || remainingSeconds === undefined) return;
    const warned = warnedRef.current;
    if (remainingSeconds > 300) warned.five = false;
    if (remainingSeconds > 60) warned.one = false;
    if (remainingSeconds <= 60 && remainingSeconds > 0 && !warned.one) {
      warned.one = warned.five = true;
      playWarningAlertSound();
      notify('Sisa waktu 1 menit', 'PC terkunci saat waktu habis. Simpan progres game sekarang.', 'error');
    } else if (remainingSeconds <= 300 && remainingSeconds > 60 && !warned.five) {
      warned.five = true;
      playWarningAlertSound();
      notify('Sisa waktu 5 menit', 'Tambah paket di kasir supaya PC tidak terkunci.', 'warning');
    }
  }, [remainingSeconds, isPrepaidSession]);

  // 1b. OFFLINE AUTONOMY: simpan snapshot tiap tick, kunci sendiri jika paket habis saat server/LAN putus
  useEffect(() => {
    if (!activeSession) return;
    ClientNetworkService.saveSessionSnapshot({
      username: activeSession.username,
      elapsedSeconds: activeSession.elapsedSeconds ?? activeSession.timeUsedMinutes * 60,
      remainingSeconds: activeSession.remainingSeconds,
    });

    const isPrepaid = activeSession.billingType === 'prepaid' || activeSession.billingType === 'package' || activeSession.billingType === 'member';
    if (!isPrepaid || isConnectedToServer || activeSession.remainingSeconds !== 0) return;

    // Server tidak terjangkau: kunci lokal. Snapshot (sisa 0) tetap disimpan untuk rekonsiliasi saat server kembali.
    ClientSecurityBridge.lockWorkstation();
    setIsTechMode(false);
    setActiveSession(null);
    setIsAfkLocked(false);
    showCustomAlert('Sesi Berakhir', 'Waktu sewa Anda telah habis.', 'warning');
  }, [activeSession, isConnectedToServer]);

  // Synchronize window size & overlay mode between Fullscreen Lock and Floating Widget
  widgetVisibleRef.current = Boolean(activeSession && !isAfkLocked);
  // toast sesi lama tidak boleh muncul lagi di sesi berikutnya
  useEffect(() => {
    if (!activeSession) setToasts([]);
  }, [activeSession === null]);

  const isOverlayMode = Boolean(
    activeSession && 
    !isAfkLocked && 
    !isTaskManagerOpen && 
    !dialogConfig.isOpen && 
    !showConfigModal && 
    !showAdminAuthModal
  );

  // Ukuran widget terakhir dari FloatingCapsule; dipakai lagi setiap kali kembali ke mode overlay
  const overlayLayoutRef = useRef<OverlayLayout | undefined>(undefined);
  const isOverlayModeRef = useRef(isOverlayMode);
  isOverlayModeRef.current = isOverlayMode;

  useEffect(() => {
    (window as any).electronAPI?.setDesktopOverlayMode?.(isOverlayMode, isOverlayMode ? overlayLayoutRef.current : undefined);
  }, [isOverlayMode]);

  const handleCapsuleLayout = (layout: OverlayLayout) => {
    overlayLayoutRef.current = layout;
    if (isOverlayModeRef.current) (window as any).electronAPI?.setDesktopOverlayMode?.(true, layout);
  };

  // Katalog F&B dari server (dikirim saat register dan setiap kasir mengubah menu)
  const [catalog, setCatalog] = useState<ClientCatalog | null>(null);

  // Network Integration & Packet Listeners
  useEffect(() => {
    const initClientConfig = async () => {
      const api = (window as any).electronAPI;
      let hostname = '';
      try {
        const info = await api?.getMachineInfo?.();
        if (info) ClientNetworkService.setMachineInfo(info);
        hostname = (info?.hostname || '').trim();
        setMachineHostname(hostname);
      } catch (e) {
        console.warn('[CLIENT] Gagal membaca identitas mesin:', e);
      }
      if (api?.getClientConfig) {
        try {
          const cfg = await api.getClientConfig();
          if (cfg) {
            const url = cfg.serverUrl || (cfg.serverIp ? `ws://${cfg.serverIp}:${cfg.serverPort || 7894}` : undefined);
            if (url) {
              ClientNetworkService.setServerUrl(url);
              setCfgServerIp(url.replace(/^ws:\/\//, '').replace(/:7894$/, ''));
            }
            if (cfg.lanSecret) {
              savedLanSecretRef.current = cfg.lanSecret;
              ClientNetworkService.setLanSecret(cfg.lanSecret);
              setCfgLanSecret(cfg.lanSecret);
            }
            // Manual name from config wins; otherwise follow the Windows computer name.
            const pcId = (cfg.pcId || '').trim() || hostname;
            if (pcId) {
              const pcName = (cfg.pcId && cfg.pcName) || pcId;
              ClientNetworkService.setWorkstationConfig(pcId, pcName);
              setWorkstationInfo(prev => ({ ...prev, pcId, pcName }));
            }
            setCfgPcId((cfg.pcId || '').trim());
          }
        } catch (e) {
          console.warn('[CLIENT VIEW] Error reading client-config.json:', e);
        }
      }
      ClientNetworkService.connect();
    };

    initClientConfig();

    const unsubConnection = ClientNetworkService.onConnectionStateChange((connected) => {
      setIsConnectedToServer(connected);
    });

    // Listener Auth Success dari Server
    const unsubAuthSuccess = ClientNetworkService.on(OpCode.SESSION_BEGIN, (packet: Packet<SessionData>) => {
      awaitingAuthRef.current = false;
      pausedRef.current = false; // sesi yang di-pause dikirim ulang dengan SCREEN_LOCK sesudahnya
      setIsSubmitting(false);
      if (packet.payload) {
        const isAdmin = packet.payload.userType === 'admin' || packet.payload.username?.toUpperCase() === 'ADMIN';
        ClientSecurityBridge.unlockWorkstation(isAdmin);
        setActiveSession(packet.payload);
        setIsAfkLocked(false);
        warnedRef.current = { five: false, one: false };
        setUsername('');
        setPassword('');
      }
    });

    // Listener Authoritative Session Tick Realtime dari Server (Dual-Timer Reconciliation)
    const unsubSessionTick = ClientNetworkService.on(OpCode.SESSION_TICK, (packet: Packet<any>) => {
      if (packet.payload) {
        if (packet.payload.isGlobalTimeSync) {
          return;
        }
        setActiveSession(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            remainingSeconds: packet.payload.remainingSeconds,
            elapsedSeconds: packet.payload.elapsedSeconds,
            timeRemainingMinutes: packet.payload.timeRemainingMinutes,
            timeUsedMinutes: packet.payload.timeUsedMinutes,
            moneyUsed: packet.payload.totalCost ?? packet.payload.moneyUsed ?? prev.moneyUsed,
            totalSpent: packet.payload.totalCost ?? prev.totalSpent,
          };
        });
      }
    });

    // Listener Coupon Redeem Result
    const unsubCouponRes = ClientNetworkService.on(OpCode.COUPON_REDEEM, (packet: Packet<{ success: boolean; message: string; coupon?: any }>) => {
      setIsSubmitting(false);
      if (packet.payload?.success) {
        showCustomAlert('Voucher Berhasil', packet.payload.message || 'Kupon berhasil digunakan.', 'success');
        setVoucherCode('');
      } else {
        showCustomAlert('Voucher Gagal', packet.payload?.message || 'Kode voucher tidak valid atau sudah kadaluarsa.', 'error');
      }
    });

    // SESSION_END: login ditolak, atau sesi diakhiri server (waktu habis / admin stop) + AUTO CLEANUP WIPE
    const unsubSessionEnd = ClientNetworkService.on(OpCode.SESSION_END, async (packet: Packet<{ reason?: string }>) => {
      setIsSubmitting(false);
      if (awaitingAuthRef.current) {
        awaitingAuthRef.current = false;
        showCustomAlert('Login Gagal', packet.payload?.reason || 'Autentikasi ditolak oleh server kasir.', 'error');
        return;
      }
      if (typeof window !== 'undefined' && (window as any).electronAPI?.cleanupSession) {
        try {
          await (window as any).electronAPI.cleanupSession();
        } catch (e) {}
      }
      ClientNetworkService.saveSessionSnapshot(null);
      ClientSecurityBridge.lockWorkstation();
      setIsTechMode(false);
      setActiveSession(null);
      setIsAfkLocked(false);
      warnedRef.current = { five: false, one: false };
      showCustomAlert('Sesi Berakhir', packet.payload?.reason || 'Waktu sewa Anda telah habis.', 'warning');
    });

    // Listener Lock / Unlock Remote Workstation
    // Kunci dari kasir = sesi di-pause server: tampilkan layar AFK mode operator, timer berhenti
    const unsubLock = ClientNetworkService.on(OpCode.SCREEN_LOCK, () => {
      ClientSecurityBridge.lockWorkstation();
      setIsTechMode(false);
      pausedRef.current = true;
      setAfkPin(''); // PIN AFK lama pemain tidak boleh membuka kunci operator
      setIsAfkLocked(true);
    });

    // Dikirim saat sesi mulai, kasir buka kunci, atau operator membuka kunci di bilik
    const unsubUnlock = ClientNetworkService.on(OpCode.SCREEN_UNLOCK, () => {
      ClientSecurityBridge.unlockWorkstation();
      awaitingAuthRef.current = false;
      pausedRef.current = false;
      setIsAfkLocked(false);
    });

    // Listener Remote Command (Restart, Shutdown, Message, Broadcast, Volume, Screenshot)
    const unsubRemoteCmd = ClientNetworkService.on(OpCode.REMOTE_COMMAND, async (packet: Packet<RemoteCommandPayload>) => {
      const action = packet.payload?.action;
      const params = packet.payload?.params;
      const api = (window as any).electronAPI;

      const sendProcessList = async (includeSystem: boolean) => {
        // A failed scan reports an empty list; the server shows it as no data and can retry
        const processes = await ProcessWatcherGuard.getRunningUserProcesses(includeSystem).catch(() => []);
        ClientNetworkService.send(OpCode.REMOTE_COMMAND, {
          action: 'process_list',
          params: {
            pcId: workstationInfo.pcId,
            processes,
            totalMemoryUsedMb: processes.reduce((acc, p) => acc + p.memoryMb, 0),
            includeSystem,
          },
        });
      };

      if (action === 'sync_catalog') {
        setCatalog({
          products: Array.isArray(params?.products) ? params.products : [],
          categories: Array.isArray(params?.categories) ? params.categories : [],
        });
      } else if (action === 'fetch_processes') {
        await sendProcessList(params?.includeSystem ?? true);
      } else if (action === 'kill_process' && params?.pid) {
        const kill = params as KillProcessPayload;
        const result = await ProcessWatcherGuard.killRemoteProcess(kill.pid, kill.processName || '', kill.isClientRequest ?? false);
        ClientNetworkService.send(OpCode.REMOTE_COMMAND, {
          action: 'kill_process_result',
          params: { pid: kill.pid, processName: kill.processName, success: result.success, message: result.message },
        });
        await sendProcessList(true);
      } else if (action === 'set_kiosk' && typeof params?.enabled === 'boolean') {
        const res = await api?.setKioskEnabled?.(params.enabled);
        if (res?.success) setKiosk(params.enabled);
        else console.warn('[KIOSK] Saklar dari kasir gagal:', res?.message);
        await ClientNetworkService.sendTelemetry();
      } else if (action === 'restart') {
        notify('PC akan restart', 'Kasir me-restart PC ini.', 'warning');
        setTimeout(async () => {
          if (api?.executeRestart) {
            await api.executeRestart(true);
          }
        }, 1500);
      } else if (action === 'shutdown') {
        notify('PC akan dimatikan', 'Kasir mematikan PC ini.', 'warning');
        setTimeout(async () => {
          if (api?.executeShutdown) {
            await api.executeShutdown(true);
          }
        }, 1500);
      } else if (action === 'send_message') {
        // Chat operator ditangani langsung oleh FloatingCapsule (badge animasi + chime sound tanpa popup msgbox)
      } else if (action === 'broadcast_message') {
        playWarningAlertSound();
        const sender = params?.sender || 'Server Kasir';
        const title = params?.title || 'Pengumuman';
        const priority = params?.priority || 'normal';
        notify(
          `${title} dari ${sender}`,
          params?.message || '',
          priority === 'urgent' ? 'error' : priority === 'warning' ? 'warning' : 'info'
        );
      } else if (action === 'set_volume') {
        const vol = params?.volume ?? 80;
        const isMuted = params?.isMuted ?? false;
        if (api?.setSystemVolume) {
          await api.setSystemVolume(vol, isMuted);
        }
        notify('Volume diatur kasir', isMuted ? 'Suara disenyapkan.' : `Volume sekarang ${vol}%.`, 'info');
      } else if (action === 'capture_screen') {
        let screenDataUrl: string | null = null;
        if (api?.captureScreen) {
          try {
            screenDataUrl = await api.captureScreen({ width: 1280, height: 720 });
          } catch (e) {
            console.warn('[CLIENT] Failed to capture screen:', e);
          }
        }
        ClientNetworkService.send(OpCode.REMOTE_COMMAND, {
          action: 'screen_capture_response',
          params: {
            pcId: workstationInfo.pcId,
            imageBase64: screenDataUrl,
            error: screenDataUrl ? undefined : 'PC gagal mengambil layar.',
            timestamp: Date.now(),
            requestId: params?.requestId
          }
        });
      } else if (action === 'remote_mouse_move') {
        if (api?.injectRemoteInput && params) {
          api.injectRemoteInput('move', { x: params.x, y: params.y });
        }
      } else if (action === 'remote_mouse_click') {
        if (api?.injectRemoteInput && params) {
          if (params.type === 'down') {
            api.injectRemoteInput('down', { button: params.button });
          } else if (params.type === 'up') {
            api.injectRemoteInput('up', { button: params.button });
          } else {
            api.injectRemoteInput('click', { button: params.button, doubleClick: params.doubleClick });
          }
        }
      } else if (action === 'remote_mouse_scroll') {
        if (api?.injectRemoteInput && params) {
          api.injectRemoteInput('scroll', { deltaY: params.deltaY });
        }
      } else if (action === 'remote_key_event') {
        if (api?.injectRemoteInput && params) {
          if (params.type === 'down') {
            api.injectRemoteInput('keydown', { keyCode: params.keyCode });
          } else {
            api.injectRemoteInput('keyup', { keyCode: params.keyCode });
          }
        }
      } else if (action === 'remote_key_combo') {
        if (api?.injectRemoteInput && params) {
          api.injectRemoteInput('combo', { keyCodes: params.keyCodes });
        }
      } else if (action === 'remote_text_input') {
        if (api?.injectRemoteInput && params) {
          api.injectRemoteInput('text', { text: params.text });
        }
      }
    });

    // Balasan verifikasi admin untuk pengaturan bilik
    const unsubAdminAuth = ClientNetworkService.on(OpCode.ADMIN_AUTH, (packet: Packet<AdminAuthResult>) => {
      setAdminAuthPending(false);
      if (!packet.payload?.success) {
        setAdminPasswordInput('');
        setAdminAuthError(packet.payload?.message || 'Akun admin ditolak server kasir.');
        return;
      }
      runAdminActionRef.current();
    });

    // Listener Order Status Update
    const unsubOrderStatus = ClientNetworkService.on(OpCode.ORDER_STATUS_UPDATE, (packet: Packet<{ orderId: string; status: string; message?: string }>) => {
      if (packet.payload) {
        const rejected = packet.payload.status === 'Ditolak';
        notify(rejected ? 'Pesanan ditolak' : 'Pesanan', packet.payload.message || `Pesanan ${packet.payload.orderId} ${packet.payload.status}.`, rejected ? 'error' : 'info');
      }
    });

    return () => {
      unsubConnection();
      unsubAuthSuccess();
      unsubSessionTick();
      unsubCouponRes();
      unsubSessionEnd();
      unsubLock();
      unsubUnlock();
      unsubRemoteCmd();
      unsubOrderStatus();
      unsubAdminAuth();
    };
  }, []);

  // Buka Sesi dari Lockscreen Standby (Admin Offline Bypass & Server Integration)
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const inputUser = username.trim();
    const inputPass = password.trim();

    if (!inputUser) {
      setLoginError('Isi ID member dulu.');
      return;
    }
    // offline sudah dijelaskan panel merah di atas tombol
    if (!isConnectedToServer || isSubmitting) return;

    setIsSubmitting(true);
    sendAuthRequest({
      username: inputUser,
      password: inputPass,
      userType: 'member',
      pcId: workstationInfo.pcId
    });
  };

  // Redeem Voucher Code Submit
  const handleVoucherSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = voucherCode.trim();
    if (!cleanCode) {
      setLoginError('Isi kode voucher dulu.');
      return;
    }
    if (!isConnectedToServer || isSubmitting) return;

    setIsSubmitting(true);
    ClientNetworkService.send(OpCode.COUPON_REDEEM, {
      code: cleanCode,
      username: `User_${workstationInfo.pcId}`
    });
  };

  // Restart / matikan dari lock screen: langsung eksekusi di mesin ini
  const handlePowerAction = async (action: 'restart' | 'shutdown') => {
    setInlineAction('none');
    const api = (window as any).electronAPI;
    const run = action === 'restart' ? api?.executeRestart : api?.executeShutdown;
    if (!run) {
      showCustomAlert('Mode Preview', 'Restart dan matikan hanya jalan di aplikasi client Windows.', 'info');
      return;
    }
    const res = await run(true);
    if (res && !res.success) {
      showCustomAlert(action === 'restart' ? 'Restart Gagal' : 'Gagal Mematikan', res.message || 'Perintah Windows ditolak.', 'error');
    }
  };

  // Logout / Tutup Sesi & Auto Privacy Wipe
  const handleLogoutSession = async () => {
    if (isConnectedToServer) {
      ClientNetworkService.send(OpCode.SESSION_END);
    }
    if (typeof window !== 'undefined' && (window as any).electronAPI?.cleanupSession) {
      try {
        await (window as any).electronAPI.cleanupSession();
      } catch (e) {
        console.warn('[CLIENT] Cleanup error:', e);
      }
    }
    // Logout saat offline: tandai ended agar server menutup sesi begitu tersambung lagi
    ClientNetworkService.saveSessionSnapshot(isConnectedToServer || !activeSession ? null : {
      username: activeSession.username,
      elapsedSeconds: activeSession.elapsedSeconds ?? activeSession.timeUsedMinutes * 60,
      remainingSeconds: activeSession.remainingSeconds,
      ended: true,
    });
    ClientSecurityBridge.lockWorkstation();
    setIsTechMode(false);
    setActiveSession(null);
    setIsAfkLocked(false);
    warnedRef.current = { five: false, one: false };
    setUsername('');
    setPassword('');
    setVoucherCode('');
  };

  // Mulai Kunci AFK
  const handleTriggerAfkLock = (pin: string) => {
    setIsTechMode(false);
    setAfkPin(pin);
    setIsAfkLocked(true);
    ClientSecurityBridge.lockWorkstation();
  };

  // Buka Kunci AFK dengan PIN
  const handleAfkUnlock = (enteredPin: string) => {
    // PIN kosong = dikunci operator; tidak boleh terbuka dengan input kosong
    if (!afkPin || enteredPin !== afkPin) return false;
    setIsAfkLocked(false);
    ClientSecurityBridge.unlockWorkstation();
    return true;
  };



  const fetchProvisionStatus = async () => {
    const api = (window as any).electronAPI;
    setKiosk(undefined);
    api?.getKioskEnabled?.().then((on: boolean | undefined) => setKiosk(on ?? null)).catch(() => setKiosk(null));
    if (api?.getProvisionStatus) {
      try {
        const res = await api.getProvisionStatus();
        setProvisionStatus(res);
      } catch (err) {
        console.warn('[PROVISION] Error fetching status:', err);
      }
    }
  };

  const handleToggleKiosk = async (enabled: boolean) => {
    const api = (window as any).electronAPI;
    setKioskPending(true);
    const res = await api?.setKioskEnabled?.(enabled).catch((e: any) => ({ success: false, message: e?.message }));
    setKioskPending(false);
    if (!res?.success) {
      showCustomAlert('Mode Kiosk Gagal Diubah', res?.message || 'gc-agent tidak menjawab. Coba lagi.', 'error');
      return;
    }
    setKiosk(enabled);
    ClientNetworkService.sendTelemetry();
  };

  const handleRunProvision = async () => {
    setIsProvisioning(true);
    const api = (window as any).electronAPI;
    if (api?.provisionClient) {
      try {
        const res = await api.provisionClient();
        if (res?.success) {
          showCustomAlert(
            '1-Click Setup Berhasil',
            `${res.message}\n\nLangkah Selesai:\n${(res.steps || []).map((s: string) => `• ${s}`).join('\n')}`,
            'success'
          );
        } else {
          showCustomAlert('Setup Gagal', res?.message || 'Gagal menerapkan konfigurasi Windows.', 'error');
        }
        await fetchProvisionStatus();
      } catch (err: any) {
        showCustomAlert('Error Provisioning', err?.message || String(err), 'error');
      } finally {
        setIsProvisioning(false);
      }
    } else {
      setIsProvisioning(false);
      showCustomAlert('Mode Preview', 'Fitur 1-Click Setup hanya berjalan di runtime Electron Windows.', 'info');
    }
  };

  const handleRevertProvision = () => {
    showCustomConfirm(
      'Revert Konfigurasi Windows?',
      'Apakah Anda yakin ingin mengembalikan Windows ke settingan awal sebelum GC-Hub? Akun "GC Net" akan dihapus dan login dikembalikan ke Administrator.',
      async () => {
        setIsProvisioning(true);
        const api = (window as any).electronAPI;
        if (api?.revertProvision) {
          try {
            const res = await api.revertProvision();
            if (res?.success) {
              showCustomAlert(
                'Revert Selesai',
                `${res.message}\n\nLangkah Pemulihan:\n${(res.steps || []).map((s: string) => `• ${s}`).join('\n')}`,
                'success'
              );
            } else {
              showCustomAlert('Revert Gagal', res?.message || 'Gagal memulihkan konfigurasi awal.', 'error');
            }
            await fetchProvisionStatus();
          } catch (err: any) {
            showCustomAlert('Error Revert', err?.message || String(err), 'error');
          } finally {
            setIsProvisioning(false);
          }
        }
      }
    );
  };

  const endTechMode = () => {
    setIsTechMode(false);
    ClientSecurityBridge.unlockWorkstation(false);
  };

  // Aksi yang wajib akun admin: pengaturan bilik, Mode Teknisi (lepas pembatasan Windows), tutup app
  const runAdminAction = (action: AdminAction) => {
    setShowAdminAuthModal(false);
    setAdminUserInput('');
    setAdminPasswordInput('');
    setAdminAuthError('');
    if (action === 'config') {
      fetchProvisionStatus();
      setShowConfigModal(true);
    } else if (action === 'tech') {
      ClientSecurityBridge.unlockWorkstation(true);
      setIsTechMode(true);
    } else {
      ClientSecurityBridge.exitApp();
    }
  };
  // listener jaringan dipasang sekali; ref ini selalu menunjuk versi terbaru
  const runAdminActionRef = useRef(() => runAdminAction(adminActionRef.current));
  runAdminActionRef.current = () => runAdminAction(adminActionRef.current);

  const requireAdmin = (action: AdminAction) => {
    adminActionRef.current = action;
    // Client baru (belum pernah diisi Kunci LAN dan belum tersambung): tidak ada yang bisa memverifikasi.
    // Pengaturan tetap dibuka supaya setup pertama bisa jalan; aksi lain ditolak.
    if (!isConnectedToServer && !savedLanSecretRef.current) {
      if (action === 'config') return runAdminAction(action);
      notify('Butuh verifikasi admin', 'Sambungkan PC ke server kasir atau isi Kunci LAN di pengaturan bilik dulu.', 'warning');
      return;
    }
    setAdminUserInput('');
    setAdminPasswordInput('');
    setAdminAuthError('');
    setAdminAuthPending(false);
    setShowAdminAuthModal(true);
  };

  const handleVerifyAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminAuthPending) return;
    const user = adminUserInput.trim();
    const secret = adminPasswordInput.trim();

    if (isConnectedToServer) {
      if (!user || !secret) return setAdminAuthError('Isi username dan password admin.');
      setAdminAuthError('');
      setAdminAuthPending(true);
      ClientNetworkService.send(OpCode.ADMIN_AUTH, { username: user, password: secret });
      return;
    }

    // Offline: cocokkan dengan Kunci LAN yang tersimpan
    const fail = offlineAuthFailRef.current;
    if (fail.lockedUntil > Date.now()) {
      return setAdminAuthError('Terlalu banyak percobaan salah. Tunggu 1 menit.');
    }
    if (!secret) return setAdminAuthError('Isi Kunci LAN.');
    if (secret !== savedLanSecretRef.current) {
      fail.count++;
      if (fail.count >= 5) {
        fail.count = 0;
        fail.lockedUntil = Date.now() + 60_000;
      }
      setAdminPasswordInput('');
      return setAdminAuthError('Kunci LAN salah.');
    }
    offlineAuthFailRef.current = { count: 0, lockedUntil: 0 };
    runAdminAction(adminActionRef.current);
  };

  // Server tidak menjawab verifikasi admin: lepas tombol
  useEffect(() => {
    if (!adminAuthPending) return;
    const t = setTimeout(() => {
      setAdminAuthPending(false);
      setAdminAuthError('Server kasir tidak menjawab. Coba lagi.');
    }, 8000);
    return () => clearTimeout(t);
  }, [adminAuthPending]);

  // Simpan Konfigurasi Jaringan LAN (Server IP & PC ID)
  const handleSaveNetworkConfig = (e: React.FormEvent) => {
    e.preventDefault();
    let rawIp = cfgServerIp.trim();
    if (!rawIp) rawIp = '127.0.0.1';
    const formattedUrl = rawIp.startsWith('ws://') || rawIp.startsWith('wss://') ? rawIp : `ws://${rawIp}:7894`;
    // Empty field = follow the Windows computer name.
    const manualPcId = cfgPcId.trim();
    const cleanPcId = manualPcId || machineHostname || 'PC-01';

    const cleanSecret = cfgLanSecret.trim();
    savedLanSecretRef.current = cleanSecret;
    ClientNetworkService.setLanSecret(cleanSecret);
    ClientNetworkService.setServerUrl(formattedUrl);
    ClientNetworkService.setWorkstationConfig(cleanPcId, cleanPcId);
    setWorkstationInfo({ pcId: cleanPcId, pcName: cleanPcId, mac: workstationInfo.mac });
    setShowConfigModal(false);

    const api = (window as any).electronAPI;
    if (api?.saveClientConfig) {
      Promise.resolve(api.saveClientConfig({
        serverIp: rawIp.replace(/^ws:\/\//, '').replace(/:7894$/, ''),
        serverPort: 7894,
        serverUrl: formattedUrl,
        ...(manualPcId ? { pcId: manualPcId, pcName: manualPcId } : {}),
        lanSecret: cleanSecret
      })).then(ok => {
        if (!ok) notify('Konfigurasi belum tersimpan', 'File client-config.json gagal ditulis. Setelan ini hilang saat app dibuka ulang.', 'error');
      });
    }

    notify('Konfigurasi disimpan', `Menghubungkan ke ${formattedUrl} (${cleanPcId})...`, 'info');
    ClientNetworkService.connect(formattedUrl);
  };

  return (
    <div className="w-full h-full overflow-hidden font-sans select-none bg-transparent">
      
      {/* 1. KONDISI: SESI AKTIF (Desktop Floating Widget) */}
      {activeSession && !isAfkLocked && (
        <div className="w-full h-full bg-transparent">
          <FloatingCapsule
            session={activeSession}
            catalog={catalog}
            toasts={toasts}
            onDismissToast={dismissToast}
            onLayout={handleCapsuleLayout}
            onTriggerAfkLock={handleTriggerAfkLock}
            onLogout={handleLogoutSession}
            onOpenTaskManager={() => setIsTaskManagerOpen(true)}
            // Sesi staf bisa milik kasir non-admin, jadi aksi ini selalu minta akun admin
            onOpenConfig={() => requireAdmin('config')}
            onCloseApp={() => requireAdmin('exit')}
            isTechMode={isTechMode}
            onStartTechMode={() => requireAdmin('tech')}
            onEndTechMode={endTechMode}
          />
        </div>
      )}

      {/* 2. KONDISI: SESI TERKUNCI AFK — sesi tetap jalan, buka dengan PIN atau akun operator */}
      {activeSession && isAfkLocked && (() => {
        const isPrepaid = ['prepaid', 'package', 'member'].includes(activeSession.billingType as string);
        const showRemaining = isPrepaid && activeSession.remainingSeconds !== undefined;
        const seconds = showRemaining
          ? activeSession.remainingSeconds!
          : activeSession.elapsedSeconds ?? activeSession.timeUsedMinutes * 60;
        return (
          <LockLayout
            pcLabel={pcLabel}
            isConnected={isConnectedToServer}
            serverIp={cfgServerIp || '127.0.0.1'}
            info={
              <>
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-secondary">
                  Sesi <span className="normal-case tracking-normal">{activeSession.username}</span>
                </p>
                <p className={`font-mono tabular text-[56px] leading-tight font-medium ${showRemaining && seconds <= 300 ? 'text-warning' : 'text-text-primary'}`}>
                  {formatClock(seconds)}
                </p>
                <p className="text-sm text-text-secondary">{showRemaining ? 'sisa waktu' : 'waktu terpakai'}{!afkPin && ', dijeda kasir'}</p>
              </>
            }
          >
            <AfkUnlockForm
              key={afkPin ? 'pin' : 'operator'}
              operatorLocked={!afkPin}
              onUnlock={handleAfkUnlock}
              onAdminOverride={(u, p) =>
                sendAuthRequest({ username: u, password: p, userType: 'admin_local', pcId: workstationInfo.pcId })
              }
            />
          </LockLayout>
        );
      })()}

      {/* 3. KONDISI: STANDBY LOCKSCREEN — kolom login kiri, info bilik kanan (DESIGN.md bagian 6) */}
      {!activeSession && (
        <LockLayout
          pcLabel={pcLabel}
          isConnected={isConnectedToServer}
          serverIp={cfgServerIp || '127.0.0.1'}
          onOpenSettings={() => requireAdmin('config')}
          info={
            <>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-secondary">Kamu di</p>
              <p className="text-[48px] leading-tight font-semibold tracking-tight text-text-primary truncate" title={pcLabel}>{pcLabel}</p>
            </>
          }
          footer={
            <>
              <button
                type="button"
                onClick={() => setInlineAction('restart')}
                className="h-11 px-3 flex items-center gap-2 rounded-sm text-sm text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors duration-150"
              >
                <RefreshCw className="w-4 h-4" />
                Restart
              </button>
              <button
                type="button"
                onClick={() => setInlineAction('shutdown')}
                className="h-11 px-3 flex items-center gap-2 rounded-sm text-sm text-text-muted hover:text-error hover:bg-surface-3 transition-colors duration-150"
              >
                <Power className="w-4 h-4" />
                Matikan
              </button>
            </>
          }
        >
          {inlineAction === 'none' ? (
            <>
              <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">Masuk untuk mulai main</h1>
              <p className="mt-1 text-sm text-text-muted">Pakai akun member atau kode voucher dari kasir.</p>

              <div role="tablist" aria-label="Cara masuk" className="mt-6 grid grid-cols-2 border-b border-hairline">
                {([['member', 'Member', User], ['voucher', 'Voucher', Ticket]] as const).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={loginTab === key}
                    onClick={() => { setLoginTab(key); setLoginError(''); }}
                    className={`h-11 -mb-px flex items-center justify-center gap-2 text-sm font-medium border-b-2 transition-colors duration-150 ${
                      loginTab === key
                        ? 'border-primary text-text-primary'
                        : 'border-transparent text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>

              <form className="mt-6 space-y-4" onSubmit={loginTab === 'member' ? handleLoginSubmit : handleVoucherSubmit} noValidate>
                {loginTab === 'member' ? (
                  <>
                    <div className="space-y-1.5">
                      <label htmlFor="login-user" className="block text-sm font-medium text-text-secondary">ID member</label>
                      <input
                        id="login-user"
                        type="text"
                        autoFocus
                        autoComplete="off"
                        value={username}
                        onChange={(e) => { setUsername(e.target.value); setLoginError(''); }}
                        className="w-full h-11 px-3 bg-surface-3 border border-hairline rounded-sm text-sm text-text-primary outline-none focus:border-primary transition-colors duration-150"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="login-pass" className="block text-sm font-medium text-text-secondary">Password</label>
                      <div className="relative">
                        <input
                          id="login-pass"
                          type={showClientPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => { setPassword(e.target.value); setLoginError(''); }}
                          className="w-full h-11 pl-3 pr-11 bg-surface-3 border border-hairline rounded-sm text-sm font-mono text-text-primary outline-none focus:border-primary transition-colors duration-150"
                        />
                        <button
                          type="button"
                          onClick={() => setShowClientPassword(v => !v)}
                          aria-label={showClientPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                          className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-text-muted hover:text-text-primary"
                        >
                          {showClientPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <label htmlFor="login-voucher" className="block text-sm font-medium text-text-secondary">Kode voucher</label>
                    <input
                      id="login-voucher"
                      type="text"
                      autoFocus
                      autoComplete="off"
                      value={voucherCode}
                      onChange={(e) => { setVoucherCode(e.target.value.toUpperCase()); setLoginError(''); }}
                      className="w-full h-11 px-3 bg-surface-3 border border-hairline rounded-sm font-mono tabular text-base tracking-[0.12em] uppercase text-text-primary outline-none focus:border-primary transition-colors duration-150"
                    />
                  </div>
                )}

                {loginError && (
                  <p role="alert" className="text-sm text-error">{loginError}</p>
                )}

                {!isConnectedToServer && (
                  <div className="flex items-start gap-3 p-3 rounded-sm bg-error/10 border border-error/30">
                    <WifiOff className="w-4 h-4 mt-0.5 flex-none text-error" />
                    <div className="text-sm">
                      <p className="font-medium text-text-primary">Server kasir tidak terhubung</p>
                      <p className="text-text-muted">Login belum bisa dipakai. Panggil operator untuk cek jaringan.</p>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 flex items-center justify-center gap-2 rounded-sm bg-primary hover:bg-primary-hover text-on-primary text-sm font-semibold transition-colors duration-150 active:translate-y-px disabled:opacity-60 disabled:cursor-wait"
                >
                  {loginTab === 'member' ? <LogIn className="w-4 h-4" /> : <Ticket className="w-4 h-4" />}
                  {isSubmitting ? 'Memeriksa...' : loginTab === 'member' ? 'Masuk' : 'Pakai voucher'}
                </button>
              </form>
            </>
          ) : (
            <div role="alertdialog" aria-labelledby="power-title" aria-describedby="power-desc">
              <h1 id="power-title" className="text-[22px] font-semibold tracking-tight text-text-primary">
                {inlineAction === 'restart' ? 'Restart komputer ini?' : 'Matikan komputer ini?'}
              </h1>
              <p id="power-desc" className="mt-1 text-sm text-text-muted">
                {inlineAction === 'restart'
                  ? 'Komputer dimuat ulang dan kembali ke layar ini.'
                  : 'Komputer dimatikan. Nyalakan lagi dari tombol power di CPU.'}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setInlineAction('none')}
                  className="h-11 rounded-sm bg-surface-2 border border-hairline text-sm font-medium text-text-secondary hover:bg-surface-3 transition-colors duration-150 active:translate-y-px"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => handlePowerAction(inlineAction)}
                  className={`h-11 rounded-sm text-sm font-semibold transition-colors duration-150 active:translate-y-px ${
                    inlineAction === 'restart'
                      ? 'bg-primary hover:bg-primary-hover text-on-primary'
                      : 'bg-error hover:bg-error/90 text-white'
                  }`}
                >
                  {inlineAction === 'restart' ? 'Ya, restart' : 'Ya, matikan'}
                </button>
              </div>
            </div>
          )}
        </LockLayout>
      )}

      {/* GC Hub Custom Dialog Popup */}
      {dialogConfig.isOpen && (
        <div className="fixed inset-0 z-50 pointer-events-auto flex items-center justify-center">
          <GCHubDialog 
            isOpen={dialogConfig.isOpen}
            title={dialogConfig.title}
            message={dialogConfig.message}
            type={dialogConfig.type}
            onConfirm={dialogConfig.onConfirm}
            onCancel={dialogConfig.onCancel}
          />
        </div>
      )}

      {/* Admin Authentication Modal for LAN & PC Configuration */}
      {showAdminAuthModal && (
        <div 
          onClick={() => setShowAdminAuthModal(false)}
          className="fixed inset-0 z-50 pointer-events-auto flex items-center justify-center bg-black/70 p-4 select-none"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[380px] rounded-md overflow-hidden shadow-modal border border-hairline bg-surface-2"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-hairline bg-surface-2">
              <div className="flex items-center space-x-2.5">
                <KeyRound className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold text-text-primary">
                  {adminActionRef.current === 'tech' ? 'Buka Mode Teknisi' : adminActionRef.current === 'exit' ? 'Tutup Aplikasi Client' : 'Pengaturan Bilik'}
                </span>
              </div>
              <button 
                onClick={() => setShowAdminAuthModal(false)}
                className="w-7 h-7 rounded-sm flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-3 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleVerifyAdminAuth} className="p-5 space-y-4" noValidate>
              {isConnectedToServer ? (
                <>
                  <p className="text-[13px] text-text-muted">
                    {adminActionRef.current === 'tech'
                      ? 'Pembatasan Windows dilepas sementara untuk perbaikan. Masuk dengan akun admin server kasir.'
                      : 'Masuk dengan akun admin server kasir.'}
                  </p>
                  <div className="space-y-1.5">
                    <label htmlFor="cfg-admin-user" className="block text-xs font-semibold text-text-secondary">Username admin</label>
                    <input
                      id="cfg-admin-user"
                      type="text"
                      autoFocus
                      autoComplete="off"
                      value={adminUserInput}
                      onChange={e => { setAdminUserInput(e.target.value); setAdminAuthError(''); }}
                      className="w-full h-10 px-3 bg-surface-3 border border-hairline focus:border-primary rounded-sm text-sm text-text-primary outline-none transition-colors duration-150"
                    />
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-text-muted">Server kasir tidak terhubung. Masukkan Kunci LAN dari Server: Pengaturan &gt; Keamanan Klien.</p>
              )}
              <div className="space-y-1.5">
                <label htmlFor="cfg-admin-secret" className="block text-xs font-semibold text-text-secondary">
                  {isConnectedToServer ? 'Password admin' : 'Kunci LAN'}
                </label>
                <input
                  id="cfg-admin-secret"
                  type="password"
                  autoFocus={!isConnectedToServer}
                  autoComplete="off"
                  value={adminPasswordInput}
                  onChange={e => { setAdminPasswordInput(e.target.value); setAdminAuthError(''); }}
                  className="w-full h-10 px-3 bg-surface-3 border border-hairline focus:border-primary rounded-sm text-sm font-mono text-text-primary outline-none transition-colors duration-150"
                />
              </div>
              {adminAuthError && <p role="alert" className="text-[13px] text-error">{adminAuthError}</p>}

              <div className="flex space-x-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdminAuthModal(false)}
                  className="flex-1 h-10 rounded-sm text-xs font-semibold bg-surface-2 border border-hairline-strong text-text-secondary hover:bg-surface-3 transition-colors duration-150"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={adminAuthPending}
                  className="flex-1 h-10 rounded-sm text-xs font-bold bg-primary hover:bg-primary-hover text-on-primary transition-colors duration-150 active:translate-y-px disabled:opacity-60 disabled:cursor-wait"
                >
                  {adminAuthPending ? 'Memeriksa...' : adminActionRef.current === 'exit' ? 'Tutup Aplikasi' : 'Lanjut'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GC Hub Workstation LAN Config & 1-Click Provisioning Modal */}
      {showConfigModal && (
        <div 
          onClick={() => setShowConfigModal(false)}
          className="fixed inset-0 z-50 pointer-events-auto flex items-center justify-center bg-black/70 p-4"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[420px] rounded-md overflow-hidden shadow-modal border border-hairline"
            style={{ background: 'rgb(var(--gc-surface-1))' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-hairline bg-surface-2">
              <div className="flex items-center space-x-2">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-[13px] font-bold text-text-primary">Pengaturan Workstation &amp; OS Bilik</span>
              </div>
              <button 
                onClick={() => setShowConfigModal(false)}
                className="w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-3 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-hairline bg-surface-1 px-3 pt-2 space-x-1">
              <button
                type="button"
                onClick={() => setConfigTab('network')}
                className={`flex-1 py-2 rounded-t text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                  configTab === 'network'
                    ? 'bg-surface-3 text-primary border-t border-x border-hairline-strong'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Network className="w-3.5 h-3.5" />
                <span>Jaringan LAN</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfigTab('provision');
                  fetchProvisionStatus();
                }}
                className={`flex-1 py-2 rounded-t text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                  configTab === 'provision'
                    ? 'bg-surface-3 text-primary border-t border-x border-hairline-strong'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>1-Click Setup OS</span>
              </button>
            </div>

            {/* TAB 1: JARINGAN LAN */}
            {configTab === 'network' && (
              <form onSubmit={handleSaveNetworkConfig} className="p-4 space-y-3.5">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-text-muted">IP Server Kasir:</label>
                  <div className="flex items-center px-3 py-2 bg-surface-2 border border-hairline rounded">
                    <input 
                      type="text"
                      value={cfgServerIp}
                      onChange={e => setCfgServerIp(e.target.value)}
                      placeholder="Contoh: 192.168.1.100 atau localhost"
                      className="w-full bg-transparent text-[13px] font-mono text-text-primary focus:outline-none placeholder:text-text-disabled"
                      autoFocus
                    />
                  </div>
                  <p className="text-[10px] text-text-muted">Isi dengan IP LAN komputer kasir / server port 7894.</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="cfg-pc-id" className="text-[11px] font-semibold text-text-muted">Nama Workstation:</label>
                  <div className="flex items-center px-3 py-2 bg-surface-2 border border-hairline rounded">
                    <input
                      id="cfg-pc-id"
                      type="text"
                      value={cfgPcId}
                      onChange={e => setCfgPcId(e.target.value)}
                      placeholder={machineHostname || 'PC-01'}
                      maxLength={24}
                      className="w-full bg-transparent text-[13px] font-mono font-bold text-primary focus:outline-none placeholder:text-text-disabled"
                    />
                  </div>
                  <p className="text-[10px] text-text-muted">Kosongkan untuk pakai nama komputer Windows{machineHostname ? ` (${machineHostname})` : ''}.</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="cfg-lan-secret" className="text-[11px] font-semibold text-text-muted">Kunci LAN:</label>
                  <div className="flex items-center px-3 py-2 bg-surface-2 border border-hairline rounded">
                    <input
                      id="cfg-lan-secret"
                      type="password"
                      value={cfgLanSecret}
                      onChange={e => setCfgLanSecret(e.target.value)}
                      placeholder="Salin dari Server: Pengaturan > Keamanan Klien"
                      autoComplete="off"
                      className="w-full bg-transparent text-[13px] font-mono text-text-primary focus:outline-none placeholder:text-text-disabled"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-semibold text-text-muted">Tema layar bilik:</span>
                  <div role="group" aria-label="Tema layar bilik" className="flex border border-hairline rounded-sm overflow-hidden">
                    {(['dark', 'light'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={theme === t}
                        onClick={() => { applyTheme(t); setTheme(t); }}
                        className={`h-8 px-3 text-xs font-medium transition-colors duration-150 ${theme === t ? 'bg-primary/15 text-primary' : 'text-text-muted hover:bg-surface-3'}`}
                      >
                        {t === 'dark' ? 'Gelap' : 'Terang'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(false)}
                    className="flex-1 py-2 rounded text-xs font-semibold bg-surface-2 border border-hairline-strong text-text-secondary hover:bg-surface-3 transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded text-xs font-bold bg-primary text-on-primary hover:bg-primary-hover transition shadow"
                  >
                    Simpan &amp; Konek
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: 1-CLICK PROVISIONING & REVERT */}
            {configTab === 'provision' && (
              <div className="p-4 space-y-3.5">
                {/* Status Box */}
                <div className={`p-3 rounded-sm border flex items-start space-x-3 ${
                  provisionStatus?.isProvisioned 
                    ? 'bg-primary/10 border-primary/40 text-text-primary'
                    : 'bg-warning/10 border-warning/40 text-text-primary'
                }`}>
                  {provisionStatus?.isProvisioned ? (
                    <CheckCircle className="w-5 h-5 text-primary flex-none mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-warning flex-none mt-0.5" />
                  )}
                  <div className="space-y-0.5 text-xs">
                    <div className="font-bold">
                      {provisionStatus?.isProvisioned 
                        ? `Status: Terkonfigurasi (${provisionStatus.standardUserName})`
                        : 'Status: Belum Di-Setup (Akun Standar Belum Aktif)'}
                    </div>
                    <div className="text-[11px] opacity-80">
                      {provisionStatus?.isProvisioned
                        ? 'AutoLogon aktif, Firewall LAN dibuka, Folder Game Full Access, kebal instalasi adware/antivirus liar.'
                        : 'PC masih berjalan di akun default. Klik tombol di bawah untuk 1-Click otomasi Windows Warnet.'}
                    </div>
                  </div>
                </div>

                {/* Features List */}
                <div className="bg-surface-2 p-3 rounded border border-hairline space-y-2 text-[11px] text-text-secondary">
                  <div className="font-bold text-text-primary text-xs flex items-center space-x-1.5">
                    <Wrench className="w-3.5 h-3.5 text-primary" />
                    <span>Fitur Otomasi Provisioning:</span>
                  </div>
                  <ul className="space-y-1.5 pl-1 text-text-muted">
                    <li className="flex items-center space-x-2">
                      <Check className="w-3.5 h-3.5 text-primary flex-none" />
                      <span>Buat akun Standard User <strong>"GC Net"</strong> (Non-Admin).</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <Check className="w-3.5 h-3.5 text-primary flex-none" />
                      <span>Aktifkan Windows <strong>AutoAdminLogon</strong> instan ke GC Net.</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <Check className="w-3.5 h-3.5 text-primary flex-none" />
                      <span>Set permission ACL <strong>D:\Games</strong> Full Control (Game &amp; Roblox bebas update).</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <Check className="w-3.5 h-3.5 text-primary flex-none" />
                      <span>Buka Firewall LAN (Billing WS 7894, WoL UDP 9, FTP, ICMP).</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <Check className="w-3.5 h-3.5 text-primary flex-none" />
                      <span>Matikan Sticky Keys Shift &amp; error popup Windows.</span>
                    </li>
                  </ul>
                </div>

                {/* Saklar Mode Kiosk: lepas semua pembatasan Windows untuk perawatan atau update client */}
                <div className="flex items-start gap-3 p-3 rounded-sm border border-hairline bg-surface-2">
                  <div className="flex-1 min-w-0 text-xs">
                    <div className="font-bold text-text-primary">Mode Kiosk</div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      {kiosk === undefined && 'Membaca status gc-agent...'}
                      {kiosk === null && 'gc-agent belum terpasang. Jalankan 1-Click Setup dulu.'}
                      {kiosk === true && 'Nyala. Task Manager, Run, Control Panel, dan Regedit dikunci. Aplikasi bilik dibuka lagi kalau ditutup.'}
                      {kiosk === false && 'Mati. Windows bebas dipakai dan aplikasi bilik boleh ditutup. Nyalakan lagi setelah perawatan.'}
                    </div>
                  </div>
                  {kiosk === undefined ? (
                    <div className="h-5 w-9 flex-none rounded-sm bg-surface-3 animate-pulse" aria-hidden />
                  ) : (
                    <Switch
                      checked={kiosk === true}
                      disabled={kiosk === null || kioskPending}
                      onChange={handleToggleKiosk}
                      label="Mode Kiosk"
                    />
                  )}
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    disabled={isProvisioning}
                    onClick={handleRunProvision}
                    className="w-full py-2.5 rounded text-xs font-bold bg-primary text-on-primary hover:bg-primary-hover transition shadow flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                  >
                    <Zap className="w-4 h-4" />
                    <span>{isProvisioning ? 'Sedang Memproses OS...' : '1-Click Setup PC Klien Warnet'}</span>
                  </button>

                  {provisionStatus?.snapshotExists && (
                    <button
                      type="button"
                      disabled={isProvisioning}
                      onClick={handleRevertProvision}
                      className="w-full py-2 rounded text-xs font-semibold bg-error/10 border border-error/40 text-error hover:bg-error/15 transition flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Revert / Kembalikan ke State Awal Semula</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. CLIENT TASK MANAGER MODAL (Admin Process Guard) */}
      <ClientTaskManagerModal
        isOpen={isTaskManagerOpen}
        onClose={() => setIsTaskManagerOpen(false)}
      />
    </div>
  );
};
