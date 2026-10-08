import React, { useState, useEffect, useCallback } from 'react';
import { Workstation, MemberAccount, CouponAccount, TransactionRecord, BillingPackage, PersonalRateConfig } from '../../shared/types';
import { AppTopBar } from '../components/AppTopBar';
import { AppNavRail, MainTabType } from '../components/AppNavRail';
import { InspectorDrawer } from '../components/InspectorDrawer';
import { ServerFooter } from '../components/ServerFooter';
import { PCGrid } from '../components/PCGrid';
import { AccountView } from '../components/AccountView';
import { TransactionView } from '../components/TransactionView';
import { LogView } from '../components/LogView';
import { POSView } from '../components/POSView';
import { RevenueReportView } from '../components/RevenueReportView';
import { SettingsView, SettingsTab } from '../components/SettingsView';
import { ErrorBoundary } from '../../shared/ui/ErrorBoundary';

// Modals
import { LoginModal } from '../components/modals/LoginModal';
import { OrderApprovalModal } from '../components/modals/OrderApprovalModal';
import { BookingQueueModal } from '../components/modals/BookingQueueModal';
import { VolumeControlModal } from '../components/modals/VolumeControlModal';
import { ScreenshotViewerModal } from '../components/modals/ScreenshotViewerModal';
import { RemoteVncModal } from '../components/modals/RemoteVncModal';
import { ServerChatModal } from '../components/modals/ServerChatModal';
import { MemberFormModal } from '../components/modals/MemberFormModal';
import { BuyPackageModal } from '../components/modals/BuyPackageModal';
import { UnpaidSettlementReceiptModal } from '../components/modals/UnpaidSettlementReceiptModal';
import { RemoteTaskManagerModal } from '../components/modals/RemoteTaskManagerModal';
import { CouponBatchModal } from '../components/modals/CouponBatchModal';
import { AddWorkstationModal } from '../components/modals/AddWorkstationModal';
import { BroadcastMessageModal } from '../components/modals/BroadcastMessageModal';
import { ExitConfirmModal } from '../components/modals/ExitConfirmModal';
import { ConfirmModal } from '../../shared/ui/ConfirmModal';
import { RefundModal } from '../components/modals/RefundModal';
import { UpdateNotificationToast } from '../components/UpdateNotificationToast';
import { OpCode, RemoteProcessItem } from '../../shared/protocol';

const initialWorkstations: Workstation[] = [];
const initialMembers: MemberAccount[] = [];
const initialCoupons: CouponAccount[] = [];

const initialPackages: BillingPackage[] = [
  // 1. Paket Jam Reguler
  { id: 'pkg-1', name: '1 Jam', time: '1j 0m', price: 4000, minutes: 60, popular: false, category: 'Jam', isExtensionOnly: false },
  { id: 'pkg-2', name: '2 Jam', time: '2j 0m', price: 8000, minutes: 120, popular: false, category: 'Jam', isExtensionOnly: false },
  { id: 'pkg-3', name: '3 Jam', time: '3j 0m', price: 12000, minutes: 180, popular: true, category: 'Jam', isExtensionOnly: false },
  { id: 'pkg-4', name: '4 Jam', time: '4j 0m', price: 16000, minutes: 240, popular: false, category: 'Jam', isExtensionOnly: false },
  { id: 'pkg-5', name: '5 Jam', time: '5j 0m', price: 20000, minutes: 300, popular: false, category: 'Jam', isExtensionOnly: false },
  
  // 2. Paket Nominal Uang
  { id: 'pkg-6', name: 'Rp. 3.000', time: '45m', price: 3000, minutes: 45, popular: false, category: 'Nominal', isExtensionOnly: false },
  { id: 'pkg-7', name: 'Rp. 5.000', time: '1j 15m', price: 5000, minutes: 75, popular: false, category: 'Nominal', isExtensionOnly: false },
  { id: 'pkg-8', name: 'Rp. 7.000', time: '1j 45m', price: 7000, minutes: 105, popular: false, category: 'Nominal', isExtensionOnly: false },
  { id: 'pkg-9', name: 'Rp. 10.000', time: '2j 30m', price: 10000, minutes: 150, popular: false, category: 'Nominal', isExtensionOnly: false },

  // 3. Paket Happy Hour (Malam & Pagi)
  { id: 'pkg-hh-1', name: 'Paket Malam Midnight', time: '7j 0m', price: 18000, minutes: 420, popular: true, category: 'Happy Hour', happyHourStart: '22:00', happyHourEnd: '06:00', isExtensionOnly: false, description: 'Khusus sewa malam 22:00 - 06:00' },
  { id: 'pkg-hh-2', name: 'Paket Pagi Segar', time: '4j 0m', price: 10000, minutes: 240, popular: false, category: 'Happy Hour', happyHourStart: '06:00', happyHourEnd: '12:00', isExtensionOnly: false, description: 'Hemat main pagi 06:00 - 12:00' },

  // 4. Paket Tambah Waktu Saja
  { id: 'pkg-10', name: 'Tambah Rp. 1.000', time: '10m', price: 1000, minutes: 10, popular: false, category: 'Tambah Waktu', isExtensionOnly: true },
  { id: 'pkg-11', name: 'Tambah Rp. 2.000', time: '30m', price: 2000, minutes: 30, popular: false, category: 'Tambah Waktu', isExtensionOnly: true },
];

const initialPersonalRates: PersonalRateConfig[] = [
  {
    id: 'prate-standard',
    name: 'Tarif Reguler Personal',
    firstHourPrice: 4000,
    nextHoursPrice: 3500,
    accumulationMinutes: 60,
    targetUserType: 'all',
    description: 'Tarif standar pascabayar untuk tamu dan member umum.'
  },
  {
    id: 'prate-vip',
    name: 'Personal Member VIP',
    firstHourPrice: 3500,
    nextHoursPrice: 3000,
    accumulationMinutes: 60,
    targetUserType: 'member',
    description: 'Tarif khusus akun member ruang VIP.'
  }
];

export const ServerView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MainTabType>('komputer');
  const [workstations, setWorkstations] = useState<Workstation[]>(initialWorkstations);
  const [selectedPc, setSelectedPc] = useState<Workstation | null>(initialWorkstations[0]);
  const [members, setMembers] = useState<MemberAccount[]>(initialMembers);
  const [coupons, setCoupons] = useState<CouponAccount[]>(initialCoupons);
  const [billingPackages, setBillingPackages] = useState<BillingPackage[]>(initialPackages);
  const [personalRates, setPersonalRates] = useState<PersonalRateConfig[]>(initialPersonalRates);
  const [activePersonalRateId, setActivePersonalRateId] = useState<string>('prate-standard');
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsTab>('tarif');

  // Layout UI state (Sidebar default open/expanded)
  const [isNavExpanded, setIsNavExpanded] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isInspectorPinned, setIsInspectorPinned] = useState(false);

  // Operator and Shift Authentication
  const [operatorName, setOperatorName] = useState('');
  const [currentEmployee, setCurrentEmployee] = useState<{ id: number; name: string; role: number; roleText?: string }>({
    id: 0,
    name: '',
    role: 0,
    roleText: ''
  });
  const isAdmin = currentEmployee.role === 2;
  // Shift system is opt-in (DbService.getShiftStatus); off means an admin-only cafe.
  const [shiftStatus, setShiftStatus] = useState({ enabled: false, hasStaff: false });
  const refreshShiftStatus = async () => {
    const api = (window as any).electronAPI;
    if (api?.getShiftStatus) setShiftStatus(await api.getShiftStatus());
  };
  const [isServerLocked, setIsServerLocked] = useState(false);

  // Modals Visibility (Login modal is mandatory launch state)
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(true);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [pendingBookingCount, setPendingBookingCount] = useState(0);
  const [isVolumeModalOpen, setIsVolumeModalOpen] = useState(false);
  const [isScreenshotModalOpen, setIsScreenshotModalOpen] = useState(false);
  const [isVncModalOpen, setIsVncModalOpen] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [isMemberFormOpen, setIsMemberFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberAccount | null>(null);
  const [isBuyPackageOpen, setIsBuyPackageOpen] = useState(false);
  const [buyPackageMode, setBuyPackageMode] = useState<'start' | 'extension'>('extension');
  const [packageTarget, setPackageTarget] = useState<Workstation | MemberAccount | null>(null);
  const [isUnpaidReceiptOpen, setIsUnpaidReceiptOpen] = useState(false);
  const [targetUnpaidPc, setTargetUnpaidPc] = useState<Workstation | null>(null);
  const [isCouponBatchOpen, setIsCouponBatchOpen] = useState(false);
  const [isAddWorkstationOpen, setIsAddWorkstationOpen] = useState(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);

  const playServerChime = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;
      // Modern soft chime (E5 -> B5 pleasant harmonic bell)
      const freqs = [659.25, 987.77];
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.09);
        gain.gain.setValueAtTime(0.15, now + i * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.09);
        osc.stop(now + i * 0.09 + 0.3);
      });
    } catch (e) {
      console.warn('[AUDIO] Server chime error:', e);
    }
  };

  // Remote Task Manager State
  const [isTaskManagerOpen, setIsTaskManagerOpen] = useState(false);
  const [taskManagerPc, setTaskManagerPc] = useState<Workstation | null>(null);
  const [pcProcessMap, setPcProcessMap] = useState<Record<string, RemoteProcessItem[]>>({});
  const [isProcessLoading, setIsProcessLoading] = useState(false);

  // Broadcast Message State
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);

  // Generic Confirm Modal State
  const [genericConfirm, setGenericConfirm] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    detail?: string;
    iconType?: 'danger' | 'warning' | 'refund' | 'logout' | 'info';
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  const [refundModalPc, setRefundModalPc] = useState<Workstation | null>(null);

  // Real-time Chat Histories & Unread Indicators
  const [chatHistories, setChatHistories] = useState<Record<string, Array<{ sender: string; time: string; text: string; isClient: boolean }>>>({});
  const [unreadChatMap, setUnreadChatMap] = useState<Record<string, number>>({});

  const handleOpenChat = (pc: Workstation) => {
    setSelectedPc(pc);
    setIsChatModalOpen(true);
    setUnreadChatMap(prev => {
      const next = { ...prev };
      delete next[pc.id.toString()];
      delete next[pc.name];
      return next;
    });
  };

  // Real-time Windows OS Desktop Notifications (GC Hub Styled)
  const triggerToast = (title: string, message: string, subMessage?: string) => {
    try {
      const api = (window as any).electronAPI;
      if (api?.showNativeNotification) {
        api.showNativeNotification(title, message, subMessage);
      }
    } catch (e) {}
  };

  // Privileged saves come back { success: false } when the console operator is not an admin.
  const isDenied = (res: any): boolean => {
    if (res?.success !== false) return false;
    triggerToast('Akses Ditolak', res.message || 'Hanya admin yang boleh mengubah ini.');
    return true;
  };

  const savePackagesChecked = async (updated: BillingPackage[]): Promise<boolean> => {
    setBillingPackages(updated);
    const api = (window as any).electronAPI;
    if (!api?.savePackages) return true;
    if (!isDenied(await api.savePackages(updated))) return true;
    setBillingPackages(await api.getPackages());
    return false;
  };

  // Global Billing Operator Hotkeys (F1 - F7)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isServerLocked || isLoginModalOpen) return;
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) {
        return;
      }
      if (e.key === 'F1') { e.preventDefault(); setActiveTab('komputer'); }
      else if (e.key === 'F2') { e.preventDefault(); setActiveTab('pos'); }
      else if (e.key === 'F3') { e.preventDefault(); setActiveTab('account'); }
      else if (e.key === 'F4') { e.preventDefault(); setActiveTab('transaksi'); }
      else if (e.key === 'F5') { e.preventDefault(); setActiveTab('laporan'); }
      else if (e.key === 'F6') { e.preventDefault(); setActiveTab('log'); }
      else if (e.key === 'F7') { e.preventDefault(); setActiveTab('pengaturan'); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isServerLocked, isLoginModalOpen]);

  // Workstations and members feed the grid and the member list; their state shows there
  const [coreData, setCoreData] = useState<'loading' | 'error' | 'ready'>('loading');
  const loadDbData = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (!api) return setCoreData('ready'); // browser preview: nothing to load

    setCoreData('loading');
    try {
      if (api.getWorkstations) {
        const dbWorkstations = await api.getWorkstations();
        setWorkstations(Array.isArray(dbWorkstations) ? dbWorkstations : []);
        if (Array.isArray(dbWorkstations) && dbWorkstations.length > 0) {
          setSelectedPc(dbWorkstations[0]);
        } else {
          setSelectedPc(null);
        }
      }
      if (api.getMembers) {
        const dbMembers = await api.getMembers();
        setMembers(Array.isArray(dbMembers) ? dbMembers : []);
      }
      if (api.getPackages) {
        const dbPkgs = await api.getPackages();
        if (Array.isArray(dbPkgs) && dbPkgs.length > 0) {
          setBillingPackages(dbPkgs);
        }
      }
      if (api.getRates) {
        const dbRates = await api.getRates();
        if (Array.isArray(dbRates) && dbRates.length > 0) {
          setPersonalRates(dbRates);
        }
      }
      if (api.getSetting) {
        const savedActiveRate = await api.getSetting('activePersonalRateId');
        if (savedActiveRate) {
          setActivePersonalRateId(savedActiveRate);
        }
      }
      if (api.getCoupons) {
        const dbCoupons = await api.getCoupons();
        setCoupons(Array.isArray(dbCoupons) ? dbCoupons : []);
      }
      setCoreData('ready');
    } catch (err) {
      console.warn('[SERVER VIEW] Failed to load SQLite initial data:', err);
      setCoreData('error');
    }
  }, []);


  // Load Database from SQLite & Subscribe to Authoritative Billing Engine
  useEffect(() => {
    loadDbData();

    // Subscribe to live authoritative tick engine & transactions
    const api = (window as any).electronAPI;
    let unsubEngine: (() => void) | undefined;
    let unsubTx: (() => void) | undefined;
    let unsubOrder: (() => void) | undefined;
    let unsubProcList: (() => void) | undefined;
    let unsubKillRes: (() => void) | undefined;
    let unsubChatReply: (() => void) | undefined;

    if (api?.onWorkstationsUpdated) {
      unsubEngine = api.onWorkstationsUpdated((liveWorkstations: Workstation[]) => {
        const hasOrder = liveWorkstations.some(w => w.hasPendingOrder);
        if (hasOrder) {
          playServerChime();
        }
        setWorkstations(liveWorkstations);
      });
    }

    if (api?.onTransactionAdded) {
      unsubTx = api.onTransactionAdded((newTx: TransactionRecord) => {
        triggerToast('Transaksi Baru', `${newTx.username}: Rp ${(newTx.price || 0).toLocaleString('id-ID')}`, newTx.note);
      });
    }

    if (api?.onOrderReceived) {
      unsubOrder = api.onOrderReceived((order: any) => {
        playServerChime();
        triggerToast(
          'Pesanan F&B Masuk',
          `${order.pcName || order.pcId} (${order.username}): Rp ${(order.totalPrice || 0).toLocaleString('id-ID')}`,
          `Pesanan ${order.items?.length || 1} menu F&B`
        );
        if (api?.getWorkstations) {
          api.getWorkstations().then((list: any) => {
            if (Array.isArray(list)) setWorkstations(list);
          });
        }
      });
    }

    if (api?.onProcessListUpdated) {
      unsubProcList = api.onProcessListUpdated((data: { pcId: string; processes: RemoteProcessItem[] }) => {
        if (data?.pcId && Array.isArray(data.processes)) {
          setPcProcessMap(prev => ({ ...prev, [data.pcId]: data.processes }));
          setIsProcessLoading(false);
        }
      });
    }

    if (api?.onKillProcessResult) {
      unsubKillRes = api.onKillProcessResult((res: { pcId: string; processName: string; success: boolean; message?: string }) => {
        triggerToast(
          res.success ? 'Proses Dimatikan' : 'Gagal Matikan Proses',
          `${res.pcId}: ${res.processName} - ${res.message || (res.success ? 'Berhasil' : 'Gagal')}`
        );
      });
    }

    if (api?.onClientChatReply) {
      unsubChatReply = api.onClientChatReply((reply: { pcId: string; sender?: string; text: string; timestamp?: number }) => {
        const timeStr = new Date(reply.timestamp || Date.now()).toTimeString().split(' ')[0];
        setChatHistories(prev => {
          const list = prev[reply.pcId] || [];
          return {
            ...prev,
            [reply.pcId]: [...list, { sender: reply.sender || reply.pcId, time: timeStr, text: reply.text, isClient: true }]
          };
        });
        setUnreadChatMap(prev => {
          const key = reply.pcId;
          return { ...prev, [key]: (prev[key] || 0) + 1 };
        });
        playServerChime();
        triggerToast(`Pesan dari ${reply.pcId}`, reply.text, `Dari: ${reply.sender || reply.pcId}`);
      });
    }

    const refreshBookingCount = () => {
      api?.listBookings?.()
        .then((r: any) => setPendingBookingCount((r?.bookings || []).filter((b: any) => b.status === 'pending').length))
        .catch(() => {});
    };
    refreshBookingCount();

    let unsubBooking: (() => void) | undefined;
    if (api?.onNewBooking) {
      unsubBooking = api.onNewBooking((booking: any) => {
        playServerChime();
        triggerToast(
          'Booking Online Masuk',
          `${booking.player_name}${booking.pc_id ? ` antre ${booking.pc_id}` : ''}`,
          'Buka menu BOOKING di atas untuk mulai sesi, alihkan, atau tolak'
        );
      });
    }
    const unsubBookingChanged = api?.onBookingsChanged?.(() => refreshBookingCount());
    const unsubBookingActivation = api?.onBookingActivation?.((r: any) => {
      triggerToast(r.success ? 'Booking Dimulai' : 'Booking Perlu Tindakan', r.message, r.booking?.player_name);
      refreshBookingCount();
    });

    return () => {
      if (unsubEngine) unsubEngine();
      if (unsubTx) unsubTx();
      if (unsubOrder) unsubOrder();
      if (unsubProcList) unsubProcList();
      if (unsubKillRes) unsubKillRes();
      if (unsubChatReply) unsubChatReply();
      if (unsubBooking) unsubBooking();
      unsubBookingChanged?.();
      unsubBookingActivation?.();
    };
  }, []);

  const parsePackageMinutes = (payload: any): number => {
    if (typeof payload?.minutes === 'number' && payload.minutes > 0) {
      return payload.minutes;
    }
    const timeStr = String(payload?.time || '').trim().toLowerCase();
    if (timeStr.includes('j') || timeStr.includes('h')) {
      const parts = timeStr.split(/j|h/);
      const hours = parseInt(parts[0]) || 0;
      const mins = parseInt(parts[1] || '0') || 0;
      return hours * 60 + mins;
    }
    if (timeStr.includes('m')) {
      return parseInt(timeStr) || 60;
    }
    return parseInt(timeStr) || 60;
  };

  const handleActionPc = async (action: string, pc: Workstation, payload?: any) => {
    const activeRate = personalRates.find(r => r.id === activePersonalRateId) || personalRates[0];
    const api = (window as any).electronAPI;

    if (action === 'login_guest_open') {
      if (api?.startSession) {
        api.startSession(pc.name, {
          username: pc.name,
          userType: 'guest',
          billingType: 'postpaid',
          pricePerHour: activeRate ? (activeRate.firstHourPrice || 4000) : 4000,
          rateConfig: activeRate ? {
            firstHourPrice: Number(activeRate.firstHourPrice) || 4000,
            nextHoursPrice: Number(activeRate.nextHoursPrice) || 3500,
            accumulationMinutes: activeRate.accumulationMinutes,
            name: activeRate.name
          } : undefined
        });
      }
      triggerToast('Sesi Personal Dimulai', `${pc.name} mulai sesi Personal (${activeRate?.name || 'Argo pasca-bayar'}).`);
    } else if (action === 'replace_package') {
      const pkgName = payload?.name || 'Paket Baru';
      const pkgPrice = Number(payload?.price) || 0;
      const pkgMinutes = parsePackageMinutes(payload);

      if (api?.replacePackage) {
        const res = await api.replacePackage(pc.name, pkgMinutes, pkgPrice, pkgName);
        if (res && res.success === false) {
          triggerToast('Ganti Paket Ditolak', res.message, 'Aturan Ganti Paket');
          return;
        }
        triggerToast('Ganti Paket Berhasil', res?.message || `${pc.name} diganti ke ${pkgName} (${pkgMinutes}m).`, 'Paket Aktif');
      } else {
        triggerToast('Ganti Paket Berhasil', `${pc.name} diganti ke ${pkgName} (${pkgMinutes}m).`);
      }
    } else if (action === 'open_refund') {
      setRefundModalPc(pc);
    } else if (action === 'refund') {
      if (payload) {
        if (api?.refundSession) {
          const res = await api.refundSession(pc.name, payload);
          if (res && res.success === false) {
            triggerToast('Refund Ditolak', res.message, 'Refund Error');
          } else {
            triggerToast('Refund Berhasil', res?.message || 'Sisa waktu diuangkan dengan penalti.', 'Transaksi Kasir');
            if (api?.getWorkstations) {
              setWorkstations(await api.getWorkstations());
            }
            if (api?.getMembers) {
              setMembers(await api.getMembers());
            }
          }
        }
      } else {
        setRefundModalPc(pc);
      }
    } else if (action === 'add_package') {
      const pkgName = payload?.name || 'Tambah Antrian Paket';
      const pkgPrice = Number(payload?.price) || 0;
      const pkgMinutes = parsePackageMinutes(payload);

      if (pc.state === 'active_guest' || pc.state === 'active_member') {
        const res = await api?.addStackedPackage?.(pc.name, pkgMinutes, pkgPrice, pkgName);
        if (res && res.success === false) {
          triggerToast('Tambah Paket Ditolak', res.message);
          return;
        }
        triggerToast('Antrian Paket Ditambahkan', `${pkgName} (${pkgMinutes}m) masuk antrian stacking ${pc.name}.`);
      } else {
        const started = await api?.startSession?.(pc.name, {
          username: pc.name,
          userType: 'guest',
          billingType: 'package',
          durationMinutes: pkgMinutes,
          price: pkgPrice,
          packageName: pkgName
        });
        if (started === false) {
          triggerToast('Paket Ditolak', `${pkgName} tidak bisa dimulai di ${pc.name} sekarang. Cek jam jual paket dan status PC.`);
          return;
        }
        triggerToast('Paket Dimulai', `${pc.name} mulai ${pkgName} (Rp ${pkgPrice.toLocaleString('id-ID')}).`);
      }
    } else if (action === 'login_package') {
      const pkgName = payload?.name || '1 Jam';
      const pkgPrice = Math.max(0, Number(payload?.price) || 0);
      const pkgMinutes = parsePackageMinutes(payload);

      const started = await api?.startSession?.(pc.name, {
        username: pc.name,
        userType: 'guest',
        billingType: 'package',
        durationMinutes: pkgMinutes,
        price: pkgPrice,
        packageName: pkgName
      });
      if (started === false) {
        triggerToast('Paket Ditolak', `${pkgName} tidak bisa dimulai di ${pc.name} sekarang. Cek jam jual paket dan status PC.`);
        return;
      }
      triggerToast('Paket Dimulai', `${pc.name} mulai ${pkgName} (Rp ${pkgPrice.toLocaleString('id-ID')}).`);
    } else if (action === 'transfer_session') {
      const targetPc = payload;
      if (api?.transferSession && targetPc) {
        const success = await api.transferSession(pc.name, targetPc.name);
        if (success) {
          triggerToast('Transfer Sesi Berhasil', `Sesi dari ${pc.name} telah dipindahkan ke ${targetPc.name}.`);
        } else {
          triggerToast('Transfer Sesi Gagal', `Tidak dapat memindahkan sesi ke ${targetPc.name}.`);
        }
      }
    } else if (action === 'logout') {
      if (api?.stopSession) {
        api.stopSession(pc.name, 'Admin Kasir Logout');
      }
      triggerToast('Sesi Selesai', `${pc.name} telah di-logout.`);
    } else if (action === 'lock') {
      if (api?.pauseSession) {
        api.pauseSession(pc.name);
      }
      triggerToast('Kunci Bilik', `${pc.name} telah dikunci (AFK/Pause).`);
    } else if (action === 'unlock') {
      if (api?.resumeSession) {
        api.resumeSession(pc.name);
      }
      triggerToast('Buka Kunci', `${pc.name} aktif kembali.`);
    } else if (action === 'restart') {
      api?.sendToClient(pc.name, OpCode.REMOTE_COMMAND, { action: 'restart' });
      triggerToast('Remote Restart', `Perintah restart dikirim ke ${pc.name}`);
    } else if (action === 'shutdown') {
      api?.sendToClient(pc.name, OpCode.REMOTE_COMMAND, { action: 'shutdown' });
      triggerToast('Remote Shutdown', `Perintah shutdown dikirim ke ${pc.name}`);
    } else if (action === 'wake_on_lan') {
      // Broadcast, not the PC's IP: a switched-off PC has no ARP entry, so a unicast never reaches it
      if (api?.wakeOnLan) {
        api.wakeOnLan(pc.mac).then((res: any) => {
          triggerToast(res?.success ? 'Wake-on-LAN' : 'Wake-on-LAN Gagal', res?.message || `Sinyal WOL dikirim ke ${pc.name}`);
        });
      } else {
        triggerToast('Wake-on-LAN Gagal', 'Wake-on-LAN hanya bisa dari aplikasi server.');
      }
    } else if (action === 'settle_unpaid') {
      setTargetUnpaidPc(pc);
      setIsUnpaidReceiptOpen(true);
    } else if (action === 'confirm_unpaid_settlement') {
      if (!api?.settleUnpaid) return;
      const res = await api.settleUnpaid(pc.name);
      triggerToast(res?.success ? 'Pembayaran Selesai' : 'Pembayaran Gagal', res?.message || `Tagihan ${pc.name} gagal diproses.`);
    } else if (action === 'delete_pc') {
      if (api?.deleteWorkstation) {
        await api.deleteWorkstation({ id: pc.id, name: pc.name, pcId: (pc as any).pcId });
      }
      setWorkstations(prev => prev.filter(w => w.id !== pc.id && w.name !== pc.name));
      if (selectedPc?.id === pc.id || selectedPc?.name === pc.name) {
        setSelectedPc(null);
      }
      triggerToast('Workstation Dihapus', `${pc.name} telah dihapus dari database.`);
    }
  };

  const handleOpenTaskManager = (pc: Workstation) => {
    setTaskManagerPc(pc);
    setIsTaskManagerOpen(true);
    handleRefreshProcessList(pc);
  };

  const handleRefreshProcessList = (pc: Workstation) => {
    setIsProcessLoading(true);
    if ((window as any).electronAPI?.sendToClient) {
      (window as any).electronAPI.sendToClient(pc.name, OpCode.REMOTE_COMMAND, { action: 'fetch_processes', params: { includeSystem: true } });
    }
    setTimeout(() => {
      setIsProcessLoading(false);
    }, 500);
  };

  // Result arrives via onKillProcessResult; the client then resends its process list.
  const handleKillProcess = (pc: Workstation, pid: number, processName: string) => {
    (window as any).electronAPI?.sendToClient?.(pc.name, OpCode.REMOTE_COMMAND, { action: 'kill_process', params: { pid, processName } });
  };

  const handleSendBroadcast = (params: {
    message: string;
    title: string;
    priority: 'normal' | 'warning' | 'urgent';
  }) => {
    const api = (window as any).electronAPI;
    if (api?.broadcastToClients) {
      api.broadcastToClients(OpCode.REMOTE_COMMAND, {
        action: 'broadcast_message',
        params: {
          message: params.message,
          title: params.title,
          sender: operatorName.split(' ')[0],
          priority: params.priority,
          timestamp: Date.now()
        }
      });
    }
    triggerToast('Pengumuman Terkirim', `"${params.title}" dikirim ke PC yang sedang terhubung.`);
  };

  const handleSaveMember = async (data: Partial<MemberAccount> & { password?: string }) => {
    const api = (window as any).electronAPI;
    try {
      if (editingMember) {
        await api?.updateMember?.(editingMember.id, data);
      } else {
        await api?.createMember?.(data);
      }
    } catch (err: any) {
      const msg = String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      triggerToast('Gagal Menyimpan', msg, 'Periksa data member lalu coba lagi');
      return;
    }
    
    // Refresh members list
    if (api?.getMembers) {
      const dbMembers = await api.getMembers();
      if (Array.isArray(dbMembers)) {
        setMembers(dbMembers);
      }
    }
    triggerToast('Data Tersimpan', editingMember ? 'Data member berhasil diperbarui.' : 'Member baru berhasil didaftarkan.', 'success');
  };

  const unpaidList = workstations.filter(w => w.state === 'unpaid' || w.isUnpaid);

  return (
    <div className="flex flex-col h-screen w-screen bg-surface-1 text-text-primary overflow-hidden font-sans select-none">
      {/* Compact Top Bar */}
      <AppTopBar
        operatorName={operatorName}
        shiftEnabled={shiftStatus.enabled}
        onlineCount={workstations.filter(w => w.state !== 'offline').length}
        totalClients={workstations.length}
        unpaidCount={unpaidList.length}
        pendingOrderCount={workstations.filter(w => w.hasPendingOrder).length}
        pendingBookingCount={pendingBookingCount}
        onOpenBookings={() => setIsBookingModalOpen(true)}
        unreadChatCount={Object.values(unreadChatMap).reduce((a, b) => a + b, 0)}
        onOpenReport={() => setActiveTab('laporan')}
        onOpenPos={() => setActiveTab('pos')}
        onOpenPendingOrders={() => {
          const target = workstations.find(w => w.hasPendingOrder);
          if (target) {
            setSelectedPc(target);
            setIsOrderModalOpen(true);
          } else {
            setActiveTab('pos');
          }
        }}
        onOpenPendingChat={() => {
          const pcIdWithChat = Object.keys(unreadChatMap)[0];
          const target = workstations.find(w => w.id.toString() === pcIdWithChat || w.name === pcIdWithChat);
          if (target) {
            handleOpenChat(target);
          } else if (selectedPc) {
            handleOpenChat(selectedPc);
          } else if (workstations.length > 0) {
            handleOpenChat(workstations[0]);
          }
        }}
        onLockServer={async () => {
          const api = (window as any).electronAPI;
          if (api?.lockServerConsole) {
            await api.lockServerConsole(operatorName);
          }
          setCurrentEmployee({ id: 0, name: '', role: 0, roleText: '' });
          setIsServerLocked(true);
          setIsLoginModalOpen(true);
          triggerToast('Konsol Dikunci', `Konsol server berhasil dikunci oleh ${operatorName}.`);
        }}
        onOpenStaffModal={() => {
          setActiveTab('pengaturan');
          setSettingsSubTab('staff');
        }}
        onOpenPriceModal={() => {
          setActiveTab('pengaturan');
          setSettingsSubTab('tarif');
        }}
        onOpenDatabaseModal={() => {
          setActiveTab('pengaturan');
          setSettingsSubTab('database');
        }}
        onOpenSecurityModal={() => {
          setActiveTab('pengaturan');
          setSettingsSubTab('keamanan');
        }}
        onOpenShiftModal={() => {
          setActiveTab('pengaturan');
          setSettingsSubTab('shift');
        }}
        onOpenBroadcastModal={() => setIsBroadcastModalOpen(true)}
        onExitServer={() => setIsExitModalOpen(true)}
      />

      {/* Body: Nav Rail + Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Navigation Rail */}
        <AppNavRail
          activeTab={activeTab}
          isExpanded={isNavExpanded}
          unpaidCount={unpaidList.length}
          pendingOrderCount={workstations.filter(w => w.hasPendingOrder).length}
          onTabChange={(tab, subTab) => {
            setActiveTab(tab);
            if (subTab) {
              setSettingsSubTab(subTab as any);
            }
            // Close inspector when switching tabs (unless pinned)
            if (tab !== 'komputer' && !isInspectorPinned) {
              setIsInspectorOpen(false);
            }
          }}
          onToggleExpand={() => setIsNavExpanded(v => !v)}
        />

        {/* Main Workspace Column */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Main Content Row: workspace + inspector */}
          <div className="flex flex-1 overflow-hidden">

            {/* Primary workspace */}
            <div className="flex flex-1 overflow-hidden">
              {activeTab === 'komputer' && (
                <PCGrid
                  workstations={workstations}
                  dataStatus={coreData}
                  onRetryLoad={loadDbData}
                  packages={billingPackages || []}
                  selectedPc={selectedPc}
                  unreadChatMap={unreadChatMap}
                  onSelectPc={(pc) => {
                    setSelectedPc(pc);
                    setIsInspectorOpen(true);
                  }}
                  onOpenVolumeModal={(pc) => {
                    setSelectedPc(pc);
                    setIsVolumeModalOpen(true);
                  }}
                  onOpenScreenshotModal={(pc) => {
                    setSelectedPc(pc);
                    setIsScreenshotModalOpen(true);
                  }}
                  onOpenVncModal={(pc) => {
                    setSelectedPc(pc);
                    setIsVncModalOpen(true);
                  }}
                  onOpenChatModal={handleOpenChat}
                  onOpenBuyPackageModal={(pc) => {
                    setPackageTarget(pc);
                    setBuyPackageMode(pc.state === 'idle' || pc.state === 'offline' ? 'start' : 'extension');
                    setIsBuyPackageOpen(true);
                  }}
                  onOpenOrderModal={(pc) => {
                    setSelectedPc(pc);
                    setIsOrderModalOpen(true);
                  }}
                  onOpenTaskManagerModal={handleOpenTaskManager}
                  onActionPc={handleActionPc}
                  onOpenAddWorkstation={() => setIsAddWorkstationOpen(true)}
                  onReorderWorkstations={setWorkstations}
                />
              )}

              {activeTab === 'account' && (
                <AccountView
                  members={members}
                  dataStatus={coreData}
                  onRetryLoad={loadDbData}
                  coupons={coupons}
                  onOpenAddMember={() => {
                    setEditingMember(null);
                    setIsMemberFormOpen(true);
                  }}
                  onOpenEditMember={(m) => {
                    setEditingMember(m);
                    setIsMemberFormOpen(true);
                  }}
                  onDeleteMember={async (id) => {
                    const target = members.find(m => m.id === id);
                    const targetName = target ? target.username : `ID ${id}`;
                    setGenericConfirm({
                      isOpen: true,
                      title: 'Hapus Akun Member',
                      description: `Apakah Anda yakin ingin menghapus akun member "${targetName}"?`,
                      detail: 'Data member dan riwayat billing akun ini akan dihapus permanen dari database.',
                      iconType: 'danger',
                      confirmText: 'Hapus Member',
                      confirmVariant: 'danger',
                      onConfirm: async () => {
                        setGenericConfirm(prev => ({ ...prev, isOpen: false }));
                        const api = (window as any).electronAPI;
                        if (api?.deleteMember) {
                          await api.deleteMember(id);
                          if (api?.getMembers) {
                            setMembers(await api.getMembers());
                          }
                          triggerToast('Member Dihapus', `Akun member ${targetName} berhasil dihapus.`);
                        } else {
                          setMembers(prev => prev.filter(m => m.id !== id));
                        }
                      }
                    });
                  }}
                  onOpenBuyPackage={(m) => {
                    setPackageTarget(m);
                    setIsBuyPackageOpen(true);
                  }}
                  onOpenUserPcHistory={(m) => {
                    triggerToast(`Sejarah PC [${m.username}]`, `Grup: ${m.groupName} • Terdaftar di database SQLite`);
                  }}
                  onOpenUserPaymentHistory={(m) => {
                    triggerToast(`Histori Pembayaran [${m.username}]`, `Saldo saat ini: Rp ${m.money.toLocaleString('id-ID')}`);
                  }}
                  onOpenCouponBatch={() => setIsCouponBatchOpen(true)}
                  onDeleteCoupon={async (id) => {
                    const api = (window as any).electronAPI;
                    if (api?.deleteCoupon) {
                      await api.deleteCoupon(id);
                      if (api?.getCoupons) {
                        setCoupons(await api.getCoupons());
                      }
                      triggerToast('Voucher Dihapus', 'Voucher berhasil dihapus dari database.');
                    } else {
                      setCoupons(prev => prev.filter(c => c.id !== id));
                    }
                  }}
                />
              )}

              {activeTab === 'transaksi' && (
                <TransactionView isAdmin={isAdmin} onToast={(title, message) => triggerToast(title, message)} />
              )}

              {activeTab === 'pos' && (
                <POSView
                  isAdmin={isAdmin}
                  onToast={(title, message) => triggerToast(title, message)}
                  onSold={(res) => {
                    triggerToast('Penjualan Kasir', res.message);
                    res.lowStockWarnings?.forEach(w => triggerToast('Stok Menipis', w));
                  }}
                  onError={(message) => triggerToast('Penjualan Ditolak', message)}
                />
              )}

              {activeTab === 'laporan' && (
                <RevenueReportView isAdmin={isAdmin} />
              )}

              {activeTab === 'log' && (
                <LogView />
              )}

              {activeTab === 'pengaturan' && (
                <ErrorBoundary fallbackTitle="Halaman Pengaturan bermasalah">
                  <SettingsView
                    tab={settingsSubTab}
                    onTabChange={setSettingsSubTab}
                    packages={billingPackages || []}
                    personalRates={personalRates || []}
                    activePersonalRateId={activePersonalRateId || 'prate-standard'}
                    onUpdatePackages={savePackagesChecked}
                    onUpdatePersonalRates={async (updated) => {
                      setPersonalRates(updated);
                      const api = (window as any).electronAPI;
                      if (api?.saveRates && isDenied(await api.saveRates(updated))) {
                        setPersonalRates(await api.getRates());
                        return false;
                      }
                      return true;
                    }}
                    onSelectActivePersonalRate={(newRateId) => {
                      setActivePersonalRateId(newRateId);
                      const api = (window as any).electronAPI;
                      if (api?.saveSetting) {
                        api.saveSetting('activePersonalRateId', newRateId).then(isDenied);
                      }
                    }}
                    currentOperator={operatorName}
                    isAdmin={isAdmin}
                    shiftStatus={shiftStatus}
                    onToggleShift={async (enabled) => {
                      const api = (window as any).electronAPI;
                      if (!api?.setShiftEnabled) return;
                      const res = await api.setShiftEnabled(enabled);
                      triggerToast('Sistem Shift', res?.message || 'Gagal mengubah sistem shift.');
                      await refreshShiftStatus();
                    }}
                    onStaffChanged={refreshShiftStatus}
                    onSwitchShift={(op) => {
                      setOperatorName(op.name);
                      setCurrentEmployee(op);
                    }}
                    onTriggerToast={triggerToast}
                  />
                </ErrorBoundary>
              )}
            </div>

            {/* Right Inspector Drawer (Komputer tab only) */}
            {activeTab === 'komputer' && selectedPc && (
              <InspectorDrawer
                // The selection is a snapshot from the click; follow the live row (same id across renames)
                pc={workstations.find(w => w.id === selectedPc.id) ?? selectedPc}
                isOpen={isInspectorOpen}
                isPinned={isInspectorPinned}
                onClose={() => {
                  if (!isInspectorPinned) setIsInspectorOpen(false);
                }}
                onTogglePin={() => setIsInspectorPinned(v => !v)}
                onAction={handleActionPc}
                onRenamePc={isAdmin ? async (pc, name) => {
                  const res = await (window as any).electronAPI?.renamePc?.(pc.name, name);
                  const result = res ?? { success: false, message: 'Server tidak menjawab.' };
                  if (result.success) triggerToast('Nama PC Diganti', result.message);
                  return result;
                } : undefined}
                onOpenBuyPackageModal={(pc) => {
                  setPackageTarget(pc);
                  setBuyPackageMode(pc.state === 'idle' || pc.state === 'offline' ? 'start' : 'extension');
                  setIsBuyPackageOpen(true);
                }}
                onOpenVolumeModal={(pc) => {
                  setSelectedPc(pc);
                  setIsVolumeModalOpen(true);
                }}
                onOpenScreenshotModal={(pc) => {
                  setSelectedPc(pc);
                  setIsScreenshotModalOpen(true);
                }}
                onOpenVncModal={(pc) => {
                  setSelectedPc(pc);
                  setIsVncModalOpen(true);
                }}
                onOpenChatModal={(pc) => {
                  setSelectedPc(pc);
                  setIsChatModalOpen(true);
                }}
                onOpenOrderModal={(pc) => {
                  setSelectedPc(pc);
                  setIsOrderModalOpen(true);
                }}
                onOpenTaskManagerModal={handleOpenTaskManager}
              />
            )}
          </div>

          {/* Bottom Footer Status Bar */}
          <ServerFooter
            totalClients={workstations.length}
            onlineCount={workstations.filter(w => w.state !== 'offline').length}
            availableCount={workstations.filter(w => w.state === 'idle').length}
            disconnectedCount={workstations.filter(w => w.state === 'offline').length}
            totalMembers={members.length}
          />
        </div>
      </div>

      {/* Complete Modals Collection */}
      <LoginModal
        isOpen={isLoginModalOpen}
        isLocked={isServerLocked}
        currentOperator={operatorName}
        onLogin={(emp) => {
          setOperatorName(emp.name);
          setCurrentEmployee(emp);
          refreshShiftStatus();
          setIsServerLocked(false);
          setIsLoginModalOpen(false);
          triggerToast('Login Operator Berhasil', `Selamat bertugas, ${emp.name}! (${emp.roleText || 'Kasir'})`);
        }}
      />

      <BookingQueueModal
        isOpen={isBookingModalOpen}
        workstations={workstations}
        onClose={() => setIsBookingModalOpen(false)}
        onChanged={setPendingBookingCount}
      />

      <OrderApprovalModal
        isOpen={isOrderModalOpen}
        pc={selectedPc}
        onClose={() => setIsOrderModalOpen(false)}
        onApproveOrder={async (_pc, orderId, payMethod, _items) => {
          const api = (window as any).electronAPI;
          const staffName = operatorName.split(' ')[0];

          if (api?.approvePosOrder) {
            const res = await api.approvePosOrder({
              orderLogId: orderId,
              payMethod,
              staff: staffName
            });

            if (res.success) {
              triggerToast('Pesanan Disetujui', res.message, 'success');
              if (res.lowStockWarnings && res.lowStockWarnings.length > 0) {
                res.lowStockWarnings.forEach((warn: string) => {
                  triggerToast('Peringatan Stok', warn, 'warning');
                });
              }
            } else {
              triggerToast('Gagal Menyetujui', res.message, 'error');
            }
          }

          if (api?.getWorkstations) {
            const list = await api.getWorkstations();
            if (Array.isArray(list)) setWorkstations(list);
          }
          if (api?.getMembers) {
            const mems = await api.getMembers();
            if (Array.isArray(mems)) setMembers(mems);
          }

          setIsOrderModalOpen(false);
        }}
        onRejectOrder={async (pc, orderId, reason) => {
          const api = (window as any).electronAPI;
          const staffName = operatorName.split(' ')[0];

          if (api?.rejectPosOrder) {
            const res = await api.rejectPosOrder({
              orderLogId: orderId,
              reason,
              staff: staffName
            });
            triggerToast('Pesanan Ditolak', res?.message || `Pesanan dari ${pc.name} telah ditolak.`);
          }

          if (api?.getWorkstations) {
            const list = await api.getWorkstations();
            if (Array.isArray(list)) setWorkstations(list);
          }

          setIsOrderModalOpen(false);
        }}
      />

      <VolumeControlModal
        isOpen={isVolumeModalOpen}
        pc={selectedPc}
        onClose={() => setIsVolumeModalOpen(false)}
        onApplyVolume={(pc, vol, isMuted) => {
          const api = (window as any).electronAPI;
          if (api?.sendToClient) {
            api.sendToClient(pc.name, OpCode.REMOTE_COMMAND, {
              action: 'set_volume',
              params: { volume: isMuted ? 0 : vol, isMuted }
            });
          }
          setWorkstations(prev =>
            prev.map(p => (p.id === pc.id ? { ...p, volume: isMuted ? 0 : vol, isMuted } : p))
          );
          triggerToast('Volume Disesuaikan', `Volume ${pc.name} diatur ke ${isMuted ? 'Mute' : `${vol}%`}`);
          setIsVolumeModalOpen(false);
        }}
      />

      <ScreenshotViewerModal
        isOpen={isScreenshotModalOpen}
        pc={selectedPc}
        onClose={() => setIsScreenshotModalOpen(false)}
      />

      <RemoteVncModal
        isOpen={isVncModalOpen}
        pc={selectedPc}
        onClose={() => setIsVncModalOpen(false)}
        onOpenChat={(pc) => {
          setSelectedPc(pc);
          setIsChatModalOpen(true);
        }}
        onOpenTaskManager={(pc) => {
          setSelectedPc(pc);
          setTaskManagerPc(pc);
          setIsTaskManagerOpen(true);
        }}
        onLockWorkstation={(pc) => handleActionPc('lock', pc)}
        onUnlockWorkstation={(pc) => handleActionPc('unlock', pc)}
        onRestartWorkstation={(pc) => handleActionPc('restart', pc)}
        onShutdownWorkstation={(pc) => handleActionPc('shutdown', pc)}
      />

      <ServerChatModal
        isOpen={isChatModalOpen}
        pc={selectedPc}
        messages={chatHistories[selectedPc?.name || ''] || []}
        onClose={() => setIsChatModalOpen(false)}
        onSendMessage={async (pc, msg) => {
          const api = (window as any).electronAPI;
          const timeStr = new Date().toTimeString().split(' ')[0];
          const delivered = await api?.sendToClient?.(pc.name, OpCode.REMOTE_COMMAND, {
            action: 'send_message',
            params: { message: msg, sender: operatorName.split(' ')[0] || 'Kasir', timestamp: Date.now() }
          });
          if (!delivered) return false;
          setChatHistories(prev => {
            const list = prev[pc.name] || [];
            return {
              ...prev,
              [pc.name]: [...list, { sender: 'Operator', time: timeStr, text: msg, isClient: false }]
            };
          });
          return true;
        }}
      />


      <MemberFormModal
        isOpen={isMemberFormOpen}
        member={editingMember}
        onClose={() => setIsMemberFormOpen(false)}
        onSave={handleSaveMember}
      />

      <BuyPackageModal
        isOpen={isBuyPackageOpen}
        target={packageTarget}
        packages={billingPackages}
        mode={buyPackageMode}
        onClose={() => setIsBuyPackageOpen(false)}
        onSelectPackage={async (pkg, target, actionType) => {
          if (target && 'state' in target) {
            const act = actionType === 'replace' ? 'replace_package' : (actionType === 'stack' ? 'add_package' : 'login_package');
            handleActionPc(act, target as Workstation, pkg);
          } else if (target) {
            const memberTarget = target as MemberAccount;
            const api = (window as any).electronAPI;
            if (api?.topUpMember) {
              await api.topUpMember(memberTarget.id, pkg.price, operatorName.split(' ')[0]);
              if (api?.getMembers) setMembers(await api.getMembers());
              triggerToast('Top-Up Berhasil', `Saldo ${memberTarget.username} berhasil ditambah Rp ${pkg.price.toLocaleString('id-ID')}`, 'success');
            } else {
              setMembers(prev => prev.map(m => m.id === memberTarget.id ? { ...m, money: m.money + pkg.price } : m));
            }
          }
          setIsBuyPackageOpen(false);
        }}
      />

      <UnpaidSettlementReceiptModal
        isOpen={isUnpaidReceiptOpen}
        pc={targetUnpaidPc}
        onClose={() => {
          setIsUnpaidReceiptOpen(false);
          setTargetUnpaidPc(null);
        }}
        onConfirmSettlement={(pc) => {
          handleActionPc('confirm_unpaid_settlement', pc);
        }}
      />

      <RemoteTaskManagerModal
        isOpen={isTaskManagerOpen}
        pc={taskManagerPc}
        onClose={() => {
          setIsTaskManagerOpen(false);
          setTaskManagerPc(null);
        }}
        onKillProcess={handleKillProcess}
        onRefreshProcessList={handleRefreshProcessList}
        processList={taskManagerPc ? (pcProcessMap[taskManagerPc.name] || []) : []}
        isLoading={isProcessLoading}
      />

      <BroadcastMessageModal
        isOpen={isBroadcastModalOpen}
        onClose={() => setIsBroadcastModalOpen(false)}
        onSendBroadcast={handleSendBroadcast}
        onlineCount={workstations.filter(w => w.state !== 'offline').length}
      />

      <AddWorkstationModal
        isOpen={isAddWorkstationOpen}
        workstations={workstations}
        onClose={() => setIsAddWorkstationOpen(false)}
        onAddSingle={async (data) => {
          const api = (window as any).electronAPI;
          if (!api?.addWorkstation) return { success: false, message: 'Tambah PC hanya bisa dari aplikasi server.' };
          const result = await api.addWorkstation(data);
          if (!result?.success) return { success: false, message: result?.message || `Nama ${data.name} tidak bisa dipakai.` };
          setWorkstations(await api.getWorkstations?.() || []);
          triggerToast('PC Ditambahkan', `${data.name} terdaftar. Nyalakan client di PC itu agar tersambung.`);
          return { success: true };
        }}
        onAddBatch={async (params) => {
          const api = (window as any).electronAPI;
          if (!api?.addWorkstationBatch) return { success: false, message: 'Tambah PC hanya bisa dari aplikasi server.' };
          const result = await api.addWorkstationBatch(params);
          if (result?.added?.length) setWorkstations(await api.getWorkstations?.() || []);
          if (!result?.success) return { success: false, message: result?.message || 'PC gagal ditambahkan.' };
          triggerToast('PC Ditambahkan', result.message);
          return { success: true };
        }}
      />

      <CouponBatchModal
        isOpen={isCouponBatchOpen}
        onClose={() => setIsCouponBatchOpen(false)}
        onGenerate={async (params) => {
          const api = (window as any).electronAPI;
          if (api?.generateCoupons) {
            await api.generateCoupons(params);
            if (api?.getCoupons) {
              setCoupons(await api.getCoupons());
            }
            triggerToast('Batch Voucher Dibuat', `Berhasil membuat ${params.count} lembar voucher prefix [${params.prefix || 'GC'}].`);
          }
          setIsCouponBatchOpen(false);
        }}
      />

      <ExitConfirmModal
        isOpen={isExitModalOpen}
        operatorName={operatorName}
        onlineCount={workstations.filter(w => w.state !== 'offline').length}
        totalClients={workstations.length}
        onClose={() => setIsExitModalOpen(false)}
        onLockOnly={() => {
          setIsExitModalOpen(false);
          setIsServerLocked(true);
          setIsLoginModalOpen(true);
        }}
        onConfirmExit={async () => {
          const api = (window as any).electronAPI;
          if (api?.logoutAndExitServer) {
            await api.logoutAndExitServer(operatorName);
          } else if (api?.exitApp) {
            await api.exitApp();
          } else {
            window.close();
          }
        }}
      />

      {/* Generic Confirm Modal */}
      <ConfirmModal
        isOpen={genericConfirm.isOpen}
        title={genericConfirm.title}
        description={genericConfirm.description}
        detail={genericConfirm.detail}
        iconType={genericConfirm.iconType}
        confirmText={genericConfirm.confirmText}
        cancelText={genericConfirm.cancelText}
        confirmVariant={genericConfirm.confirmVariant}
        onConfirm={genericConfirm.onConfirm}
        onClose={() => setGenericConfirm(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Dedicated Breakdown Refund Modal */}
      {refundModalPc && (
        <RefundModal
          isOpen={true}
          pc={refundModalPc}
          onClose={() => setRefundModalPc(null)}
          onConfirmRefund={async (targetPc, payload) => {
            const api = (window as any).electronAPI;
            if (api?.refundSession) {
              const res = await api.refundSession(targetPc.name, payload);
              if (res && res.success === false) {
                triggerToast('Refund Ditolak', res.message, 'Refund Error');
              } else {
                triggerToast('Refund Berhasil', res?.message || 'Sisa waktu diuangkan dengan penalti.', 'Transaksi Kasir');
                if (api?.getWorkstations) setWorkstations(await api.getWorkstations());
                if (api?.getMembers) setMembers(await api.getMembers());
              }
            }
            setRefundModalPc(null);
          }}
        />
      )}

      {/* Non-intrusive Auto-Update Notification */}
      <UpdateNotificationToast />
    </div>
  );
};
