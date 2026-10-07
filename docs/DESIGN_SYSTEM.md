# GC-Hub Design System Specification (Kaizen Core)

> **Single Source of Truth for GC-Hub UI (Server & Client)**  
> All AI agents and developers must strictly follow these tokens and reusable components. Never invent arbitrary Tailwind classes or inline styles.

---

## 1. Design Tokens

### 1.1 Color Palette
| Token | Class | Hex / Value | Purpose |
|---|---|---|---|
| Canvas | `bg-canvas` | `#090a0b` | App background behind all windows |
| Surface 1 | `bg-surface-1` | `#111315` | Main container, window body, views |
| Surface 2 | `bg-surface-2` | `#17191c` | Cards, table headers, elevated elements |
| Surface 3 | `bg-surface-3` | `#1d2024` | Active tabs, popovers, nested cards |
| Carbon | `bg-surface-carbon` | `#24282d` | High-contrast overlays, tooltips |
| Primary Accent | `text-primary` / `bg-primary` | `#76b900` | GC Green (primary actions, online status) |
| Hairline Border | `border-hairline` | `#2b2f34` | Subdued borders (1px) |
| Strong Border | `border-hairline-strong` | `#3a3f45` | Hover/focus borders |
| Text Primary | `text-text-primary` | `#f5f5f5` | Main readable text, headings |
| Text Secondary | `text-text-secondary` | `#b8bcc2` | Labels, descriptions |
| Text Muted | `text-text-muted` | `#777d84` | Captions, placeholders, disabled |
| Success | `text-success` / `bg-success` | `#0fa336` | Finished transactions, active PC |
| Warning | `text-warning` / `bg-warning` | `#f4b400` | Low time remaining, idle |
| Error / Danger | `text-error` / `bg-error` | `#e52020` | Critical lock, delete action, stop |

---

## 2. Typography Hierarchy

**Official Font Family:** `Nunito` (Variable font: weights 100 to 900)  
Fallback: `Inter`, `system-ui`, `sans-serif`

Import from `src/shared/ui`:
```tsx
import { Typography } from '@/shared/ui'
```

| Variant | Element | Size & Weight | Usage |
|---|---|---|---|
| `display` | `<h1>` | 30px / Bold (700/800) | Dashboard hero numbers, big clock |
| `h1` | `<h1>` | 24px / Bold (700) | Page / main view header |
| `h2` | `<h2>` | 20px / Semibold (600) | Section title, modal title |
| `h3` | `<h3>` | 18px / Semibold (600) | Drawer header, card group |
| `h4` | `<h4>` | 16px / Semibold (600) | Card title, column header |
| `body` | `<p>` | 14px / Regular (400) | Standard readable text |
| `body-sm`| `<p>` | 12px / Regular (400) | Meta info, list details |
| `caption`| `<span>`| 11px / Regular (400) | Badges, timestamps, footnotes |
| `mono`   | `<code>`| 12px / Monospace | IP address, MAC, license keys |
| `label`  | `<span>`| 12px / Medium Uppercase (500) | Form labels, table headers |

> **Rule:** Use `tabular` prop on `Typography` for all prices, durations, countdowns, and numbers.

---

## 3. Icon & Symbol System (Strict Lucide-React SVG Law)

> **MANDATORY LAW: ZERO UNICODE EMOJIS / PLAIN TEXT SYMBOLS**  
> Never use emojis (`🔊`, `⚙️`, `🔌`, `🌐`, `👑`, `👤`, `🔒`, `⚡`, `🔄`, `⚠️`, `✓`, `❌`, `🎟️`, `📢`) or plain text characters as symbols in UI strings, buttons, badges, notifications/toasts, or table actions.  
> **EVERY icon and symbol MUST be an imported SVG component from `lucide-react`** (or shared component like `AppLogo`).

Import from `lucide-react` or `src/shared/ui`:
```tsx
import { Icon } from '@/shared/ui'
import { Monitor, User, Shield, Check, AlertTriangle, Zap, Volume2, Settings } from 'lucide-react'

// Direct Lucide Component Usage (Standard):
<Monitor className="w-4 h-4 text-emerald-400" />
<Check className="w-3.5 h-3.5 text-primary" />
<AlertTriangle className="w-3.5 h-3.5 text-rose-400" />

// Or Atomic Icon Wrapper:
<Icon icon={Monitor} size="sm" color="accent" />
```

| Size Token | Pixel Size | Tailwind Class | Usage |
|---|---|---|---|
| `xs` | 12px | `w-3 h-3` | Tiny badge icons, inline status dots |
| `sm` | 14px - 16px | `w-3.5 h-3.5` / `w-4 h-4` | Table action buttons, input icons, modal controls |
| `md` | 20px | `w-5 h-5` | Navigation items, top bar main controls |
| `lg` | 24px | `w-6 h-6` | Modal headers, feature badges |
| `xl` | 32px | `w-8 h-8` | Status illustrations, empty states |

---

## 4. Buttons & Actions

Import from `src/shared/ui`:
```tsx
import { Button, IconButton } from '@/shared/ui'
import { Play, Trash2 } from 'lucide-react'

<Button variant="primary" size="md" leftIcon={Play}>Mulai Billing</Button>
<Button variant="secondary" size="sm">Batal</Button>
<IconButton icon={Trash2} variant="danger" size="sm" label="Hapus Akun" />
```

### Variants:
- `primary`: GC Green bold CTA button.
- `secondary`: Dark surface-2 button with hairline border.
- `outline`: Transparent background with hairline border.
- `ghost`: Transparent icon or menu item with hover surface background.
- `danger`: Red action button for irreversible steps.
- `success`: Solid green action button.

---

## 5. Table System

Import from `src/shared/ui`:
```tsx
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from '@/shared/ui'

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>No. PC</TableHead>
      <TableHead>User</TableHead>
      <TableHead alignRight>Sisa Waktu</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell className="font-semibold">PC-01</TableCell>
      <TableCell>User 1</TableCell>
      <TableCell tabular alignRight>01:45:00</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

---

## 6. Image & Avatar

Import from `src/shared/ui`:
```tsx
import { Image, Avatar } from '@/shared/ui'

<Avatar name="Galang Net" size="md" status="online" />
<Image src="/game.jpg" aspectRatio="square" rounded="md" />
```

---

## 7. AI Rules & Guardrails
1. **Never write raw color hex codes** in component JSX.
2. **Never create bespoke buttons/tables/headings** with arbitrary Tailwind classes — always use `@/shared/ui` primitives.
3. **Keep Client & Server synchronized**: Both apps share identical visual tokens, differing only in view composition and business logic.
