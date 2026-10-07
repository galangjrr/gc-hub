---
colors:
  canvas: "#090a0b"
  error: "#e52020"
  hairline: "#2b2f34"
  hairline-strong: "#3a3f45"
  info: "#2997ff"
  m-blue-dark: "#1c69d4"
  m-blue-light: "#0066b1"
  m-red: "#e22718"
  on-primary: "#000000"
  primary: "#76b900"
  primary-dark: "#5a8d00"
  primary-hover: "#8ad400"
  success: "#0fa336"
  surface-1: "#111315"
  surface-2: "#17191c"
  surface-3: "#1d2024"
  surface-carbon: "#24282d"
  text-disabled: "#555a60"
  text-muted: "#777d84"
  text-primary: "#f5f5f5"
  text-secondary: "#b8bcc2"
  warning: "#f4b400"
components:
  app-shell:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text-primary}"
  badge:
    backgroundColor: "{colors.surface-3}"
    padding: 4px 7px
    rounded: "{rounded.xs}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.label-uppercase}"
  button-danger:
    backgroundColor: "{colors.error}"
    height: 40px
    padding: 10px 18px
    rounded: "{rounded.sm}"
    textColor: "#ffffff"
    typography: "{typography.button}"
  button-ghost:
    backgroundColor: transparent
    padding: 8px 12px
    rounded: "{rounded.sm}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.button}"
  button-icon:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.full}"
    size: 36px
    textColor: "{colors.text-primary}"
  button-outline:
    backgroundColor: transparent
    height: 40px
    padding: 9px 17px
    rounded: "{rounded.sm}"
    textColor: "{colors.primary}"
    typography: "{typography.button}"
  button-outline-on-dark:
    backgroundColor: transparent
    height: 40px
    padding: 9px 17px
    rounded: "{rounded.sm}"
    textColor: "{colors.text-primary}"
    typography: "{typography.button}"
  button-primary:
    backgroundColor: "{colors.primary}"
    height: 40px
    padding: 10px 18px
    rounded: "{rounded.sm}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
  button-primary-active:
    backgroundColor: "{colors.primary-dark}"
    height: 40px
    padding: 10px 18px
    rounded: "{rounded.sm}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    height: 40px
    padding: 10px 18px
    rounded: "{rounded.sm}"
    textColor: "{colors.text-primary}"
    typography: "{typography.button}"
  corner-accent:
    backgroundColor: "{colors.primary}"
    rounded: "{rounded.none}"
    size: 10px
  inspector-drawer:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-primary}"
    width: 360px
  m-stripe:
    height: 3px
  modal:
    backgroundColor: "{colors.surface-2}"
    padding: 24px
    rounded: "{rounded.md}"
    textColor: "{colors.text-primary}"
  search-input:
    backgroundColor: "{colors.surface-2}"
    height: 38px
    padding: 9px 12px
    rounded: "{rounded.sm}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-md}"
  select:
    backgroundColor: "{colors.surface-2}"
    height: 40px
    padding: 10px 12px
    rounded: "{rounded.sm}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-md}"
  sidebar-collapsed:
    backgroundColor: "{colors.surface-1}"
    width: 64px
  sidebar-expanded:
    backgroundColor: "{colors.surface-1}"
    width: 232px
  stat-card:
    backgroundColor: "{colors.surface-2}"
    padding: 16px
    rounded: "{rounded.sm}"
    textColor: "{colors.text-primary}"
  status-dot:
    rounded: "{rounded.full}"
    size: 8px
  table:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-primary}"
  table-row:
    backgroundColor: "{colors.surface-1}"
    borderColor: "{colors.hairline}"
    textColor: "{colors.text-primary}"
  table-row-selected:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-primary}"
  text-input:
    backgroundColor: "{colors.surface-2}"
    height: 40px
    padding: 10px 12px
    rounded: "{rounded.sm}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-md}"
  toast:
    backgroundColor: "{colors.surface-2}"
    padding: 12px 16px
    rounded: "{rounded.sm}"
    textColor: "{colors.text-primary}"
  topbar:
    backgroundColor: "{colors.surface-1}"
    height: 56px
    textColor: "{colors.text-primary}"
  workstation-card:
    backgroundColor: "{colors.surface-1}"
    padding: 16px
    rounded: "{rounded.sm}"
    textColor: "{colors.text-primary}"
  workstation-card-active:
    backgroundColor: "{colors.surface-2}"
    padding: 16px
    rounded: "{rounded.sm}"
    textColor: "{colors.text-primary}"
  workstation-card-offline:
    backgroundColor: "{colors.surface-1}"
    padding: 16px
    rounded: "{rounded.sm}"
    textColor: "{colors.text-muted}"
  workstation-card-selected:
    backgroundColor: "{colors.surface-2}"
    padding: 16px
    rounded: "{rounded.sm}"
    textColor: "{colors.text-primary}"
description: |
  A premium desktop operations design system combining Apple's restraint
  and interaction polish, BMW M's performance-oriented cockpit character
  and industrial geometry, and NVIDIA's technical precision, dense
  information hierarchy, angular surfaces, and disciplined green accent.
  The system is designed specifically for GC Hub, a Windows desktop
  billing and workstation-management application. It preserves the
  operational density required by billing software while avoiding
  generic SaaS dashboards, excessive gaming RGB, excessive
  glassmorphism, and decorative UI noise.
name: GC-HUB-design-system
rounded:
  full: 9999px
  md: 6px
  none: 0px
  sm: 4px
  xs: 2px
spacing:
  lg: 16px
  md: 12px
  section: 48px
  sm: 8px
  xl: 24px
  xs: 4px
  xxl: 32px
  xxs: 2px
typography:
  body-lg:
    fontFamily: Inter, system-ui, -apple-system, BlinkMacSystemFont,
      Segoe UI, sans-serif
    fontSize: 15px
    fontWeight: 400
    letterSpacing: "-0.1px"
    lineHeight: 1.5
  body-md:
    fontFamily: Inter, system-ui, -apple-system, BlinkMacSystemFont,
      Segoe UI, sans-serif
    fontSize: 14px
    fontWeight: 400
    letterSpacing: "-0.08px"
    lineHeight: 1.45
  body-sm:
    fontFamily: Inter, system-ui, -apple-system, BlinkMacSystemFont,
      Segoe UI, sans-serif
    fontSize: 12px
    fontWeight: 400
    letterSpacing: 0
    lineHeight: 1.45
  body-strong:
    fontFamily: Inter, system-ui, -apple-system, BlinkMacSystemFont,
      Segoe UI, sans-serif
    fontSize: 14px
    fontWeight: 600
    letterSpacing: "-0.08px"
    lineHeight: 1.4
  button:
    fontFamily: Inter, system-ui, -apple-system, BlinkMacSystemFont,
      Segoe UI, sans-serif
    fontSize: 12px
    fontWeight: 600
    letterSpacing: 0.04em
    lineHeight: 1
  caption:
    fontFamily: Inter, system-ui, -apple-system, BlinkMacSystemFont,
      Segoe UI, sans-serif
    fontSize: 11px
    fontWeight: 400
    letterSpacing: 0
    lineHeight: 1.35
  display-lg:
    fontFamily: Inter, system-ui, -apple-system, BlinkMacSystemFont,
      Segoe UI, sans-serif
    fontSize: 32px
    fontWeight: 600
    letterSpacing: "-0.5px"
    lineHeight: 1.12
  display-md:
    fontFamily: Inter, system-ui, -apple-system, BlinkMacSystemFont,
      Segoe UI, sans-serif
    fontSize: 26px
    fontWeight: 600
    letterSpacing: "-0.35px"
    lineHeight: 1.18
  display-xl:
    fontFamily: Inter, system-ui, -apple-system, BlinkMacSystemFont,
      Segoe UI, sans-serif
    fontSize: 40px
    fontWeight: 600
    letterSpacing: "-0.8px"
    lineHeight: 1.08
  heading-lg:
    fontFamily: Inter, system-ui, -apple-system, BlinkMacSystemFont,
      Segoe UI, sans-serif
    fontSize: 22px
    fontWeight: 600
    letterSpacing: "-0.2px"
    lineHeight: 1.25
  heading-md:
    fontFamily: Inter, system-ui, -apple-system, BlinkMacSystemFont,
      Segoe UI, sans-serif
    fontSize: 18px
    fontWeight: 600
    letterSpacing: "-0.1px"
    lineHeight: 1.3
  heading-sm:
    fontFamily: Inter, system-ui, -apple-system, BlinkMacSystemFont,
      Segoe UI, sans-serif
    fontSize: 16px
    fontWeight: 600
    letterSpacing: 0
    lineHeight: 1.35
  label-uppercase:
    fontFamily: Inter, system-ui, -apple-system, BlinkMacSystemFont,
      Segoe UI, sans-serif
    fontSize: 11px
    fontWeight: 600
    letterSpacing: 0.08em
    lineHeight: 1.2
    textTransform: uppercase
  nav:
    fontFamily: Inter, system-ui, -apple-system, BlinkMacSystemFont,
      Segoe UI, sans-serif
    fontSize: 12px
    fontWeight: 500
    letterSpacing: 0
    lineHeight: 1.2
  numeric:
    fontFamily: Inter, system-ui, -apple-system, BlinkMacSystemFont,
      Segoe UI, sans-serif
    fontSize: 20px
    fontVariantNumeric: tabular-nums
    fontWeight: 600
    letterSpacing: "-0.02em"
    lineHeight: 1.1
version: 1.0
---

# Overview

GC Hub is a Windows desktop billing and workstation-management
interface. Its design language combines three source philosophies
without copying any single brand:

-   **Apple** supplies restraint, hierarchy, typography discipline,
    polished motion, and the principle that interface chrome should
    recede behind the primary object.
-   **BMW M** supplies performance character, cockpit-like information
    presentation, black surfaces, industrial geometry, uppercase
    technical labels, and restrained signature detailing.
-   **NVIDIA** supplies technical precision, dense information
    architecture, a disciplined single primary accent, hairline
    separation, angular geometry, and engineering-oriented component
    structure.

The result is **premium operational software**, not a marketing site,
generic SaaS dashboard, or RGB gaming launcher.

The main object of attention is the workstation grid. Navigation and
inspection controls should support it rather than compete with it.

# Design Philosophy

## The Three-Layer Blend

  -------------------------------------------------------------------------
  Source            Adopt             Reject / Limit      GC Hub Role
  ----------------- ----------------- ------------------- -----------------
  Apple             restraint,        extreme whitespace, refinement
                    typography,       product-marketing   
                    hierarchy,        tile layout, blue   
                    polished          primary accent,     
                    transitions,      large consumer      
                    quiet UI          radii               

  BMW M             black cockpit,    automotive          personality
                    performance       photography as      
                    language,         default chrome,     
                    technical labels, extreme 0px         
                    industrial        geometry            
                    geometry,         everywhere,         
                    restrained stripe marketing-style     
                                      uppercase headings  

  NVIDIA            technical         paper-white         technical
                    density, green    marketing canvas,   identity
                    accent,           2px-only geometry,  
                    hairlines,        green on every CTA, 
                    angular cards,    marketing hero      
                    status clarity,   structure           
                    engineering grid                      
  -------------------------------------------------------------------------

## Core Principles

1.  **Operational first.** Every visual decision must support fast
    workstation management.
2.  **Dark by default.** GC Hub is a Windows operations cockpit, not a
    marketing surface.
3.  **One action accent.** GC Green is the primary interactive signal.
4.  **Depth through surfaces.** Prefer tonal surface hierarchy over
    shadows and blur.
5.  **Precision over decoration.** Borders, spacing, typography, and
    status states create the visual character.
6.  **Performance character, not gaming noise.** The UI may feel
    technical and energetic without becoming RGB-heavy.
7.  **Contextual information.** Details appear where they are useful,
    especially in the right inspector drawer.
8.  **Consistent geometry.** Default radius is 4px; larger radii are
    exceptional.
9.  **Motion is quiet.** Transitions should communicate state, not
    entertain.
10. **The workstation grid is the main character.**

# Key Characteristics

-   Near-black operational canvas.
-   Layered dark surfaces rather than a flat black background.
-   NVIDIA Green `#76b900` as the primary action/active accent.
-   BMW-inspired tricolor used only as a restrained identity stripe,
    never as an action color.
-   Inter Variable as the practical open font substitute for proprietary
    NVIDIA/BMW/Apple typefaces.
-   Apple-inspired 600-weight display hierarchy and restrained tracking.
-   BMW-inspired uppercase micro-labels with letter spacing.
-   NVIDIA-inspired technical cards with hairline borders and minimal
    elevation.
-   4px default radius.
-   No decorative gradients.
-   No default glassmorphism.
-   No heavy drop shadows.
-   No excessive pill controls.
-   Expandable left navigation.
-   Contextual right inspector drawer.
-   Responsive workstation grid.
-   Dense information where operationally useful, with sufficient
    spacing for scanability.

# Colors

## Brand & Accent

  --------------------------------------------------------------------------
  Token                      Value                   Role
  -------------------------- ----------------------- -----------------------
  `{colors.primary}`         `#76b900`               Primary action, active
                                                     state, healthy/online
                                                     emphasis

  `{colors.primary-hover}`   `#8ad400`               Hover/strong
                                                     interaction state

  `{colors.primary-dark}`    `#5a8d00`               Pressed/active-down
                                                     state

  `{colors.on-primary}`      `#000000`               Text/icons on green
  --------------------------------------------------------------------------

GC Green is intentionally scarce. It is a semantic signal, not a
decoration.

## Surface Architecture

  -----------------------------------------------------------------------------
  Token                       Value                   Role
  --------------------------- ----------------------- -------------------------
  `{colors.canvas}`           `#090a0b`               Application background

  `{colors.surface-1}`        `#111315`               Primary cards, sidebar,
                                                      topbar

  `{colors.surface-2}`        `#17191c`               Selected cards, controls,
                                                      inspector sections

  `{colors.surface-3}`        `#1d2024`               Elevated nested controls
                                                      and overlays

  `{colors.surface-carbon}`   `#24282d`               Rare
                                                      technical/specification
                                                      surface
  -----------------------------------------------------------------------------

Surface changes should be subtle. A panel should feel elevated because
its surface changes slightly, not because it casts a large shadow.

## Borders

  ----------------------------------------------------------------------------
  Token                        Value                   Role
  ---------------------------- ----------------------- -----------------------
  `{colors.hairline}`          `#2b2f34`               Normal card/table/input
                                                       borders

  `{colors.hairline-strong}`   `#3a3f45`               Strong separators,
                                                       selected context
                                                       boundaries
  ----------------------------------------------------------------------------

## Text

  ---------------------------------------------------------------------------
  Token                       Value                   Role
  --------------------------- ----------------------- -----------------------
  `{colors.text-primary}`     `#f5f5f5`               Primary headings,
                                                      important values

  `{colors.text-secondary}`   `#b8bcc2`               Secondary content

  `{colors.text-muted}`       `#777d84`               Metadata, timestamps,
                                                      secondary labels

  `{colors.text-disabled}`    `#555a60`               Disabled content
  ---------------------------------------------------------------------------

Pure white should be reserved for the strongest content rather than
every line of text.

## Semantic

  Token                Value       Role
  -------------------- ----------- -------------------------------------
  `{colors.success}`   `#0fa336`   Successful operation / confirmation
  `{colors.warning}`   `#f4b400`   Warning / attention
  `{colors.error}`     `#e52020`   Error / destructive action
  `{colors.info}`      `#2997ff`   Informational state

Semantic colors must not compete with GC Green for ordinary actions.

## BMW M Identity Stripe

  Token                     Value       Role
  ------------------------- ----------- ---------------
  `{colors.m-blue-light}`   `#0066b1`   Stripe stop 1
  `{colors.m-blue-dark}`    `#1c69d4`   Stripe stop 2
  `{colors.m-red}`          `#e22718`   Stripe stop 3

The three colors are reserved for a **brand identity marker** such as
the GC Hub wordmark, a tiny header stripe, release/build identity, or
special system-brand moments. They are never used as primary buttons,
status colors, or large backgrounds.

# Typography

## Font Family

GC Hub uses **Inter Variable** as the implementation font.

The source systems use proprietary NVIDIA EMEA, BMW Type Next Latin, and
SF Pro families. Their source documents identify Inter as a practical
substitute for NVIDIA and BMW and as a close substitute for SF Pro on
non-Apple platforms. GC Hub therefore standardizes on Inter for
cross-platform consistency.

Recommended stack:

``` css
font-family:
  Inter,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

## Hierarchy

  -------------------------------------------------------------------------------------------------------
  Token                                    Size       Weight  Line Height     Tracking Use
  -------------------------------- ------------ ------------ ------------ ------------ ------------------
  `{typography.display-xl}`                40px          600         1.08       -0.8px Major
                                                                                       application/page
                                                                                       title

  `{typography.display-lg}`                32px          600         1.12       -0.5px Section title

  `{typography.display-md}`                26px          600         1.18      -0.35px Large contextual
                                                                                       title

  `{typography.heading-lg}`                22px          600         1.25       -0.2px Major section

  `{typography.heading-md}`                18px          600         1.30       -0.1px Card/group heading

  `{typography.heading-sm}`                16px          600         1.35            0 Compact heading

  `{typography.body-lg}`                   15px          400         1.50       -0.1px Lead/important
                                                                                       explanatory text

  `{typography.body-md}`                   14px          400         1.45      -0.08px Default UI/body

  `{typography.body-strong}`               14px          600         1.40      -0.08px Emphasis and
                                                                                       primary labels

  `{typography.body-sm}`                   12px          400         1.45            0 Metadata

  `{typography.label-uppercase}`           11px          600         1.20       0.08em Technical labels

  `{typography.caption}`                   11px          400         1.35            0 Fine metadata

  `{typography.button}`                    12px          600          1.0       0.04em Button labels

  `{typography.nav}`                       12px          500          1.2            0 Navigation

  `{typography.numeric}`                   20px          600          1.1      -0.02em Timer, money, key
                                                                                       metrics
  -------------------------------------------------------------------------------------------------------

## Typography Principles

-   Display text uses weight 600 rather than heavy 700 by default.
-   Technical labels may use uppercase and letter spacing.
-   Body text remains sentence case.
-   Do not make the entire application uppercase.
-   Numeric billing/session values use tabular numerals where available.
-   Do not use monospace merely to make the UI look technical.
-   Avoid decorative typefaces.
-   Do not use font size as the only hierarchy mechanism; combine size,
    weight, spacing, and surface context.

# Layout

## Application Shell

The application uses the previously established three-zone operational
hierarchy:

``` text
┌────────────┬───────────────────────────────────┬──────────────────┐
│ Navigation │        Main Workspace             │ Inspector        │
│            │        Workstation Grid            │ Drawer           │
└────────────┴───────────────────────────────────┴──────────────────┘
```

The right inspector is contextual and hidden by default. The left
navigation is persistent but collapsible.

## Sidebar

  State               Width Behavior
  ------------ ------------ -----------------------------------
  Collapsed            64px Icons, tooltips, active indicator
  Expanded            232px Icons + labels + optional submenu
  Transition     180--220ms Smooth width/content transition

The sidebar should never consume more width than necessary.

## Inspector Drawer

  Property          Value
  ----------------- -----------------------
  Default state     Hidden
  Width             360px
  Position          Right edge
  Open animation    \~200ms
  Close animation   \~180ms
  Pinning           Supported
  Background        `{colors.surface-1}`
  Separation        Hairline left border
  Default radius    0px on the outer edge

The inspector shows contextual information for the selected workstation,
member, transaction, order, or other object.

## Workstation Workspace

The workstation grid receives all remaining width.

The grid must respond to available space by changing column count rather
than shrinking cards below usable readability.

# Spacing System

GC Hub uses an 8px structural rhythm with 2px/4px micro-adjustments.

  Token                   Value Typical Use
  --------------------- ------- -----------------------------
  `{spacing.xxs}`           2px Hairline offsets, tiny gaps
  `{spacing.xs}`            4px Icon/text micro gap
  `{spacing.sm}`            8px Compact internal gap
  `{spacing.md}`           12px Control gaps
  `{spacing.lg}`           16px Card/internal padding
  `{spacing.xl}`           24px Card padding, section gaps
  `{spacing.xxl}`          32px Major component padding
  `{spacing.section}`      48px Large workspace sections

Operational density is intentionally higher than Apple's marketing
surfaces. Large 80--96px editorial spacing is not appropriate for the
primary billing workspace.

# Grid & Container

## Workstation Grid

  Window Width   Recommended Grid Strategy
  -------------- ----------------------------------------------------
  ≥ 1600px       4--6 workstation columns depending on card minimum
  1280--1599px   3--5 columns
  1024--1279px   3--4 columns
  768--1023px    2--3 columns
  \< 768px       1--2 columns or compact list

These are operational guidelines rather than fixed card counts. The
implementation should use minimum card width and available workspace
width.

## Minimum Workstation Card

Recommended minimum width: **190--220px**.

Do not make cards unreadably narrow merely to fit more workstations.

# Whitespace Philosophy

GC Hub does not use Apple's extreme marketing whitespace. It uses
**structured operational breathing room**.

Whitespace should:

-   separate status groups;
-   distinguish actionable controls;
-   make timers and prices easy to scan;
-   prevent adjacent PC cards from visually merging;
-   provide enough room for touch-like interaction if the UI is used on
    a high-resolution display.

Whitespace should not become empty decorative territory.

# Elevation & Depth

  -----------------------------------------------------------------------
  Level                   Treatment               Use
  ----------------------- ----------------------- -----------------------
  0 --- Canvas            `{colors.canvas}`, no   App background
                          border/shadow           

  1 --- Surface           `{colors.surface-1}`,   Normal cards/sidebar
                          optional hairline       

  2 --- Raised            `{colors.surface-2}`,   Selected cards,
                          hairline                controls

  3 --- Elevated          `{colors.surface-3}`,   Menus, popovers, modal
                          hairline-strong         internals

  4 --- Overlay           Surface + restrained    Modal/popover only
                          shadow                  
  -----------------------------------------------------------------------

Default cards should have **no heavy shadow**.

Recommended overlay shadow:

``` css
0 12px 32px rgba(0, 0, 0, 0.32)
```

Do not use this shadow on ordinary workstation cards.

# Shapes

## Radius Scale

  ------------------------------------------------------------------------
  Token                                        Value Use
  --------------------- ---------------------------- ---------------------
  `{rounded.none}`                               0px Drawer edge, major
                                                     separators, special
                                                     identity strips

  `{rounded.xs}`                                 2px Micro badges,
                                                     technical accents

  `{rounded.sm}`                                 4px Default cards,
                                                     buttons, inputs

  `{rounded.md}`                                 6px Modals and selected
                                                     overlay containers

  `{rounded.full}`                            9999px Avatars, circular
                                                     status controls
  ------------------------------------------------------------------------

The 4px default is deliberate: sharper than Apple, softer than
NVIDIA/BMW's strict zero-radius language.

Avoid 12px/16px/20px rounded SaaS cards.

# Buttons

## Button Grammar

  ---------------------------------------------------------------------------
  Component     Background    Text                     Radius Use
  ------------- ------------- ------------- ----------------- ---------------
  Primary       GC Green      Black                       4px Main action

  Secondary     Surface 2     White                       4px Normal
                                                              secondary
                                                              action

  Outline       Transparent   GC Green                    4px Secondary
                                                              branded action

  Outline Dark  Transparent   Primary text                4px Action on dark
                                                              media/special
                                                              surface

  Danger        Error         White                       4px Destructive
                                                              action

  Ghost         Transparent   Secondary                   4px Low-priority
                                                              utility

  Icon          Surface 2     Primary                  Circle Compact utility
  ---------------------------------------------------------------------------

### Primary Action Rules

Use GC Green for the most important action in a context.

Do not create a row containing five green buttons.

Example:

``` text
[ +30 MINUTES ]   [ SUSPEND ]   [ END SESSION ]
```

Only the most important action should normally receive the filled
primary treatment.

# Inputs & Forms

Inputs use dark surfaces and restrained borders.

  State       Surface     Border         Text
  ----------- ----------- -------------- -----------
  Default     Surface 2   Hairline       Primary
  Focus       Surface 2   2px GC Green   Primary
  Disabled    Surface 1   Hairline       Disabled
  Error       Surface 2   Error          Primary
  Read-only   Surface 1   Hairline       Secondary

Default height: **40px**.

Large critical inputs may use 44px.

Do not use large pill-shaped search fields throughout the application.

# Workstation Cards

The workstation card is the most important GC Hub component.

## Anatomy

``` text
┌─────────────────────────────┐
│ PC-RUBY                ●    │
│ ACTIVE                      │
│                             │
│ GUEST                       │
│ 01:24:32                    │
│                             │
│ 00:35:28 REMAINING          │
│                             │
│ Rp20.000                    │
│ 2H PACKAGE                  │
└─────────────────────────────┘
```

## State Table

  -----------------------------------------------------------------------
  State                   Primary Visual          Accent
  ----------------------- ----------------------- -----------------------
  Available               Neutral surface         None

  Active                  Surface 2               GC Green

  Selected                Surface 2 + clear       GC Green
                          border                  

  Suspended               Neutral surface         Warning

  Disconnected            Muted surface/text      Warning/error depending
                                                  on condition

  Locked                  Surface 2               Info or GC Green

  Error                   Surface 2               Error
  -----------------------------------------------------------------------

The state must be recognizable without relying only on color. Use
iconography, text, and layout changes as secondary signals.

## Active Card

Active cards may use:

-   1px GC Green border;
-   a small GC Green status indicator;
-   stronger primary text;
-   numeric timer;
-   subtle top/side accent.

Do not use large green glows.

# Workstation Grid

The grid should support:

-   responsive columns;
-   compact and standard density modes;
-   filtering;
-   sorting;
-   search;
-   status grouping;
-   selection;
-   multi-selection where appropriate;
-   keyboard navigation.

Potential view modes:

  Mode         Purpose
  ------------ -----------------------------
  Grid         Default operational view
  Compact      High workstation counts
  List         Detailed administration
  Floor Plan   Future physical-layout mode

# Right Inspector Drawer

The inspector is contextual rather than permanent.

## Selected Workstation

Recommended structure:

``` text
PC-RUBY
● ACTIVE

SESSION
Guest
01:24:32

BILLING
Rp20.000
00:35:28 remaining

PACKAGE
2 HOURS

ORDER
2 items
Rp18.000

ACTIONS
[ +30 MINUTES ]
[ SUSPEND ]
[ LOCK ]
[ TRANSFER ]
[ END SESSION ]
```

Primary actions should be placed near the information they affect.

Secondary/administrative actions should be separated lower in the
drawer.

## Pinning

The drawer can be pinned.

  Mode     Result
  -------- ------------------------------------------------
  Hidden   Maximum workspace
  Open     Contextual details visible
  Pinned   Details remain visible while selection changes

# Topbar

The topbar is compact and utility-oriented.

Recommended content:

-   GC Hub identity;
-   current section;
-   search;
-   server health;
-   notifications;
-   operator identity;
-   settings.

Avoid a traditional Windows-era multi-row menu bar.

## Server Health

Use a compact status indicator:

``` text
● SERVER ONLINE
```

or:

``` text
● Connected
```

The indicator should use semantic color sparingly.

# Navigation

Primary navigation:

  Icon           Label
  -------------- ------------
  Workstation    Komputer
  People         Member
  POS            POS
  Transactions   Transaksi
  Reports        Laporan
  Logs           Log
  Settings       Pengaturan

Collapsed navigation uses icons and tooltips.

Expanded navigation uses icons, labels, and optional secondary text.

Do not turn the sidebar into a dashboard full of metrics.

# Tables

Tables should follow the technical, dense style of NVIDIA/BMW rather
than consumer-app cards.

  Element    Treatment
  ---------- ------------------------------
  Header     Surface 2, strong label
  Row        Surface 1
  Divider    Hairline
  Hover      Surface 2
  Selected   Surface 3 + accent indicator
  Numeric    Tabular numerals
  Status     Text + indicator
  Actions    Compact ghost/icon controls

Avoid vertical borders between every column unless needed for dense
financial data.

# Status System

Status is a semantic system, not a decorative color palette.

  Status            Color            Additional Signal
  ----------------- ---------------- -------------------
  Online / Active   GC Green         Filled status dot
  Available         Text secondary   Neutral dot
  Suspended         Warning          Pause icon
  Disconnected      Warning/Error    Connection icon
  Locked            Info/Green       Lock icon
  Error             Error            Error icon
  Completed         Success          Check icon

Never encode a critical status using color alone.

# Badges & Labels

Badges should be small and rectangular.

Example:

``` text
ACTIVE
MEMBER
PREPAID
VIP
OFFLINE
```

Default radius: 2px.

Avoid pill badges except for genuinely circular status indicators.

# Tabs

Tabs use a BMW/NVIDIA hybrid grammar:

-   text-first;
-   compact;
-   uppercase for technical categories;
-   no large pill containers;
-   active state indicated by text contrast plus a thin accent underline
    or accent edge.

Example:

``` text
ALL     ACTIVE     AVAILABLE     OFFLINE
────
```

The active tab should not require a large colored pill.

# Modals & Dialogs

Modals use:

-   Surface 2 background;
-   6px radius;
-   24px padding;
-   hairline-strong border;
-   restrained overlay;
-   clear title/body/action hierarchy.

Recommended structure:

``` text
┌─────────────────────────────┐
│ END SESSION             ×   │
│                             │
│ Are you sure you want to    │
│ end the session on PC-07?   │
│                             │
│ [ CANCEL ]   [ END SESSION ]│
└─────────────────────────────┘
```

Destructive actions use `{colors.error}`.

# Toasts & Notifications

Toasts are compact and contextual.

Use:

-   Surface 2;
-   hairline;
-   4px radius;
-   semantic indicator;
-   short message;
-   optional action.

Do not make notifications huge floating cards.

# Iconography

Icons should be:

-   simple;
-   geometric;
-   consistent in stroke weight;
-   readable at 16--20px;
-   used as information support, not decoration.

Recommended icon sizes:

     Size Use
  ------- ----------------------------
     14px Micro metadata
     16px Standard navigation/action
     18px Prominent controls
     20px Section icons
     24px Empty states/large action
    32px+ Rare feature illustrations

Avoid mixing multiple icon families.

# Data Visualization

Charts should follow the same restraint.

Rules:

-   dark surfaces;
-   thin grid lines;
-   one primary GC Green series;
-   semantic colors only where multiple meanings are required;
-   no rainbow charts;
-   no excessive gradients;
-   labels should remain readable;
-   prioritize operational insight over decoration.

Example palette:

``` text
Primary metric     GC Green
Secondary metric   Neutral gray
Warning series     Amber
Error series       Red
Informational      Blue
```

# Imagery

GC Hub is not photography-first in the Apple/BMW marketing sense.

Imagery is secondary and should be used for:

-   empty states;
-   product/F&B catalog imagery;
-   game/product thumbnails;
-   promotional panels;
-   member achievements;
-   future AI insight illustrations.

Avoid decorative photography behind important billing information.

## Technical Visual Language

When technical imagery is used, prefer:

-   dark hardware photography;
-   PC components;
-   subtle carbon-fiber texture;
-   abstract technical diagrams;
-   restrained 3D renders.

Do not place decorative imagery behind dense text.

# Decorative Identity

## GC Green Corner Accent

Inspired by NVIDIA's corner square, GC Hub may use a small green corner
accent on selected feature/system cards.

Default:

``` text
10 × 10px
```

Use sparingly.

## M-Inspired Stripe

The tricolor stripe is a brand identity marker only.

Recommended:

``` text
[ #0066b1 ][ #1c69d4 ][ #e22718 ]
```

Height: 3px.

Use on:

-   application identity;
-   special feature headers;
-   release/about surfaces;
-   selected brand moments.

Do not use on every workstation card.

# Motion & Interaction

## Timing

  Token               Duration Use
  ----------------- ---------- ---------------------------
  `motion-fast`          100ms Button/hover feedback
  `motion-normal`        160ms Selection and local state
  `motion-drawer`        200ms Inspector/sidebar
  `motion-modal`         180ms Dialog entrance
  `motion-slow`          260ms Rare layout transitions

## Principles

-   Motion should explain state.
-   Do not use bounce or elastic easing for ordinary controls.
-   Avoid large parallax.
-   Avoid decorative entrance animations.
-   Drawer transitions should feel precise and mechanical.
-   Selection should feel immediate.
-   Loading indicators should be quiet.

Preferred easing:

``` css
cubic-bezier(0.2, 0.8, 0.2, 1)
```

# Responsive Behavior

GC Hub is primarily a desktop Windows application. Responsive behavior
therefore prioritizes window resizing and workstation density rather
than mobile web conventions.

## Breakpoints

  ------------------------------------------------------------------------
  Name                                         Width Key Changes
  --------------------- ---------------------------- ---------------------
  wide                                      ≥ 1920px Full workspace, 5--6
                                                     workstation columns
                                                     where practical

  desktop-large                               1600px Expanded workspace,
                                                     4--5 columns

  desktop                                     1280px Standard layout

  desktop-small                               1024px Compact grid,
                                                     inspector remains
                                                     available

  compact                                      800px Sidebar may collapse
                                                     automatically

  minimum                                      720px Compact navigation
                                                     and 1--2 column grid
  ------------------------------------------------------------------------

These values are application guidance rather than browser-page
breakpoints.

## Sidebar Strategy

At narrow widths:

``` text
Expanded → Collapsed
```

The user can manually expand it again.

## Inspector Strategy

At narrow widths:

``` text
Pinned → Overlay
```

The inspector should become an overlay rather than permanently consuming
workspace width.

## Touch Targets

Even though GC Hub is desktop software:

-   primary controls should generally be ≥ 40px;
-   critical actions should target 44px where practical;
-   icon-only controls should have adequate hit areas;
-   keyboard access must remain supported.

# Accessibility

-   Do not encode state with color alone.
-   Maintain readable contrast.
-   Provide visible keyboard focus.
-   Preserve logical tab order.
-   Support keyboard navigation for workstation selection.
-   Provide tooltips for collapsed sidebar icons.
-   Use descriptive labels for destructive actions.
-   Do not hide critical information exclusively in hover states.

# Keyboard Interaction

Recommended workstation navigation:

  Shortcut       Action
  -------------- --------------------------------------------------------
  Arrow keys     Move workstation selection
  Enter          Open inspector
  Escape         Close inspector/modal
  Ctrl/Cmd + K   Global command/search
  Ctrl/Cmd + F   Focus workstation search
  Space          Context-dependent primary action
  Delete         Context-dependent destructive action with confirmation

Shortcuts must never override safety-critical Windows shortcuts
globally.

# Empty States

Empty states should be quiet and operational.

Example:

``` text
NO WORKSTATIONS FOUND

Try changing the selected filter
or search term.
```

Do not use oversized illustrations unless they provide useful context.

# Loading States

Prefer skeletons only where loading time is meaningful.

For real-time workstation status:

``` text
CONNECTING
● ● ●
```

or a compact status indicator.

Do not make every PC card flash or skeletonize during ordinary WebSocket
updates.

# Error States

Errors must explain:

1.  What failed.
2.  What the operator can do.
3.  Whether data/session state is safe.

Example:

``` text
CLIENT CONNECTION LOST

PC-RUBY stopped responding at 14:32.
The server retained the last known session state.

[ RETRY CONNECTION ]
[ VIEW DETAILS ]
```

# Do's and Don'ts

## Do

-   Use dark layered surfaces.
-   Keep GC Green scarce and meaningful.
-   Use 4px geometry by default.
-   Use hairline borders instead of heavy shadows.
-   Use typography hierarchy instead of excessive color.
-   Use uppercase technical labels sparingly.
-   Make workstation status immediately scannable.
-   Let the workstation grid dominate the screen.
-   Use contextual inspector drawers.
-   Keep animation fast and restrained.
-   Use tabular numerals for timers and financial values.
-   Use the M-inspired stripe only as identity detail.
-   Use subtle technical/carbon surfaces only where they add meaning.

## Don't

-   Do not make the interface look like NVIDIA's website.
-   Do not make the interface look like BMW's marketing site.
-   Do not make the interface look like Apple's Store.
-   Do not combine Apple Blue, NVIDIA Green, and BMW M colors as
    competing action colors.
-   Do not use excessive RGB.
-   Do not use large neon glows.
-   Do not use glassmorphism everywhere.
-   Do not use 16--24px radius cards.
-   Do not make every button green.
-   Do not make every label uppercase.
-   Do not use giant marketing-style hero sections in the workstation
    workspace.
-   Do not sacrifice workstation visibility for decorative UI.
-   Do not use shadows on ordinary cards.
-   Do not use gradients as a default surface treatment.
-   Do not turn the sidebar into a dashboard.
-   Do not hide important state information behind hover-only
    interactions.

# Component Decision Matrix

  -----------------------------------------------------------------------------
  Component      Apple Influence   BMW M          NVIDIA         GC Decision
                                   Influence      Influence      
  -------------- ----------------- -------------- -------------- --------------
  Sidebar        restraint         cockpit        technical rail compact
                                   hierarchy                     expandable
                                                                 rail

  Workstation    hierarchy         performance    technical card dense
  card                             spec                          operational
                                                                 tile

  Inspector      contextual UI     cockpit panel  technical      right
                                                  grouping       contextual
                                                                 drawer

  Button         quiet             rectangular    green primary  4px technical
                                   precision                     button

  Typography     600 + tight       uppercase      weight         Inter variable
                                   labels         hierarchy      

  Radius         reduced           sharp          angular        4px default

  Accent         single-color      stripe         NVIDIA Green   Green
                 discipline        identity                      actions + M
                                                                 stripe
                                                                 identity

  Surface        quiet dark tiles  black cockpit  layered        4-level dark
                                                  technical      surface system
                                                  surfaces       

  Shadow         extremely         none           nearly none    overlays only
                 restrained                                      

  Motion         polished          mechanical     restrained     100--260ms

  Imagery        product-focused   performance    technical      secondary only
                                   photography    imagery        
  -----------------------------------------------------------------------------

# Design Token Usage Rules

1.  Reference tokens instead of hardcoding values in component
    specifications.
2.  Add new tokens only when an existing token cannot express the
    requirement.
3.  Variants such as active, disabled, focused, selected, and error
    should be separate component definitions when the design system
    tooling supports them.
4.  Keep semantic colors separate from brand identity colors.
5.  Never use the M stripe as a semantic state.
6.  Never use GC Green to indicate a state that is not actually
    healthy/active/primary.
7.  Keep surface differences subtle enough that the interface remains
    visually coherent.
8.  Prefer 1px borders to shadows for ordinary components.
9.  Prefer surface contrast to border contrast when creating nested
    hierarchy.
10. Keep component density consistent across the same screen.

# Implementation Guidance

## CSS Variables

Recommended mapping:

``` css
:root {
  --gc-canvas: #090a0b;
  --gc-surface-1: #111315;
  --gc-surface-2: #17191c;
  --gc-surface-3: #1d2024;
  --gc-surface-carbon: #24282d;

  --gc-primary: #76b900;
  --gc-primary-hover: #8ad400;
  --gc-primary-dark: #5a8d00;

  --gc-text-primary: #f5f5f5;
  --gc-text-secondary: #b8bcc2;
  --gc-text-muted: #777d84;
  --gc-text-disabled: #555a60;

  --gc-border: #2b2f34;
  --gc-border-strong: #3a3f45;

  --gc-success: #0fa336;
  --gc-warning: #f4b400;
  --gc-error: #e52020;
  --gc-info: #2997ff;

  --gc-radius-default: 4px;
}
```

## Electron Considerations

The visual system must not depend on browser-only viewport assumptions.

The application should remain visually correct when:

-   maximized;
-   restored;
-   resized;
-   running on different Windows DPI settings;
-   using Windows scaling above 100%;
-   inspector is opened/closed;
-   sidebar is expanded/collapsed.

UI state such as `sidebarExpanded`, `inspectorOpen`, and
`inspectorPinned` should remain presentation state and must not
duplicate billing/domain state.

# Performance Considerations

The workstation grid may contain many cards.

Therefore:

-   avoid expensive blur filters;
-   avoid large box-shadow layers;
-   avoid continuous animations on every workstation;
-   avoid per-card canvas rendering unless necessary;
-   update only changed workstation state;
-   virtualize extremely large lists/grids if required;
-   keep status indicators CSS-simple.

The UI should remain responsive while real-time workstation updates are
arriving.

# Data Density Rules

The visual system intentionally supports dense operational information.

Priority order:

1.  Workstation identity.
2.  Connection/status.
3.  Session state.
4.  Remaining time.
5.  Billing amount.
6.  Member/user.
7.  Package.
8.  Secondary telemetry.
9.  Administrative details.

Do not display every available database field simply because it exists.

# Billing & Financial UI

Money values should:

-   use tabular numerals;
-   remain visually prominent;
-   avoid scientific notation;
-   use localized Indonesian currency formatting where appropriate;
-   distinguish balance, charge, payment, and debt clearly.

Example:

``` text
Rp20.000
```

not:

``` text
2E4
```

Financial values should not rely on green color alone to communicate
meaning.

# Session Timer UI

Timers are primary operational data.

Recommended:

``` text
01:24:32
```

with remaining time beneath:

``` text
00:35:28 REMAINING
```

Use `typography.numeric`.

Timer updates should not cause the entire card to re-render visually or
animate every second.

# POS / Food & Beverage Extension

The same design language applies to POS.

POS product cards may be slightly more visual than workstation cards.

Recommended hierarchy:

``` text
PRODUCT IMAGE
PRODUCT NAME
CATEGORY
PRICE
STOCK
[ ADD ]
```

Product photography can use more of Apple's product-focused
presentation, while the surrounding controls retain GC Hub's technical
geometry.

# Member UI Extension

Member screens may use:

-   profile/avatar circles;
-   balance;
-   membership tier;
-   XP/points;
-   achievements;
-   activity;
-   leaderboard position.

Circular avatars are one of the few places where full radius is
encouraged.

Gamification should use the same restrained palette and must not become
a separate neon gaming design system.

# Analytics & AI Extension

AI-generated insights should use a clear hierarchy:

``` text
INSIGHT

Revenue increased 12.4%
during evening sessions.

WHY
Peak occupancy increased...

RECOMMENDATION
Consider extending...

[ VIEW DATA ]
```

AI panels should not visually resemble a chatbot gimmick. They should
look like analytical software.

# Mobile / Remote Control Extension

If GC Hub later gains a mobile control application, the same tokens
should be retained but the layout may become touch-first.

The desktop sidebar/drawer layout must not be copied literally to
mobile.

Preserve:

-   colors;
-   typography;
-   status semantics;
-   button grammar;
-   surface hierarchy;
-   workstation identity.

Adapt:

-   navigation;
-   touch targets;
-   inspector presentation;
-   card density.

# Brand Identity Rules

GC Hub should develop its own identity from the synthesis.

The source inspirations are **design references, not brand assets**.

Do not copy:

-   NVIDIA wordmarks;
-   BMW roundels;
-   M logos;
-   Apple logos;
-   proprietary typography;
-   proprietary imagery;
-   proprietary iconography.

The GC Hub identity should be expressed through:

-   GC Green;
-   restrained M-inspired stripe;
-   technical dark surfaces;
-   Inter typography;
-   workstation-focused information architecture;
-   precision geometry.

# Iteration Guide

1.  Start with the application shell.
2.  Implement surface/color tokens.
3.  Implement typography tokens.
4.  Implement sidebar collapsed/expanded states.
5.  Implement workstation card states.
6.  Implement workstation grid.
7.  Implement contextual inspector drawer.
8.  Implement buttons and inputs.
9.  Implement tables and financial data.
10. Implement modals/toasts.
11. Implement motion.
12. Test the entire system at multiple Windows scaling factors.
13. Test with a realistic number of workstations.
14. Remove any component that adds visual noise without operational
    value.

When creating a new component:

-   first reuse an existing surface;
-   then reuse an existing radius;
-   then reuse existing typography;
-   then reuse semantic colors;
-   only then create a new token if necessary.

# Acceptance Criteria

The redesign is considered visually successful when:

-   the application immediately reads as premium desktop operations
    software;
-   the workstation grid is clearly the primary workspace;
-   the sidebar can collapse without breaking navigation;
-   the inspector can appear/disappear without disrupting the grid;
-   active/available/offline states are immediately distinguishable;
-   the UI feels technical without looking like an RGB gaming dashboard;
-   the interface feels premium without looking like an Apple Store
    clone;
-   the interface feels performance-oriented without looking like a BMW
    marketing page;
-   NVIDIA Green is recognizable but not overused;
-   the M-inspired stripe feels like a subtle identity element rather
    than a second color system;
-   ordinary cards remain flat and precise;
-   typography remains readable at normal Windows desktop scaling;
-   animation is subtle and fast;
-   no existing billing/session functionality is implied to change by
    the visual redesign.

# Product Architecture: One GC Hub Design System

GC Hub Server and GC Hub Client are **two application surfaces of the same product**. They MUST NOT establish independent visual languages.

The global design system defined in this document is the single source of truth for both applications. Server and Client may differ in information density, navigation structure, and workflow composition because their users and responsibilities differ, but their visual identity must remain immediately recognizable as GC Hub.

## Cross-Product Design Rule

> **GC Hub Server and GC Hub Client MUST consume the same global design tokens, typography, colors, spacing, geometry, iconography, semantic states, component primitives, motion language, and interaction grammar. Application-specific composition may differ only when required by user role and workflow.**

| Layer | GC Hub Server | GC Hub Client | Rule |
|---|---|---|---|
| Brand identity | GC Hub | GC Hub | Identical |
| Primary accent | GC Green | GC Green | Identical |
| Typography | Inter | Inter | Identical |
| Surface system | Shared dark surfaces | Shared dark surfaces | Identical |
| Radius | 4px default | 4px default | Identical |
| Buttons | Shared primitives | Shared primitives | Identical |
| Inputs | Shared primitives | Shared primitives | Identical |
| Status semantics | Shared | Shared | Identical |
| Icon family | Shared | Shared | Identical |
| Motion | Shared timing/easing | Shared timing/easing | Identical |
| Navigation | Operations-oriented | Customer-oriented | Composition differs |
| Information density | High | Moderate | Context differs |
| Primary workspace | Workstation operations | Current session / customer actions | Context differs |
| Inspector | Contextual drawer | Contextual panel/modal | Composition differs |
| Tables | Extensive | Minimal/transactional | Context differs |
| POS | Operator workflow | Customer ordering workflow | Context differs |

The Client must feel like the **customer-facing sibling of the Server**, not a separate consumer application.

## Product Family Visual Test

A Server screenshot and Client screenshot should still look related when shown without their application names.

The following remain recognizable across both:

- GC Green;
- dark layered surfaces;
- 4px geometry;
- Inter typography;
- compact technical labels;
- hairline borders;
- status indicators;
- button grammar;
- iconography;
- restrained motion;
- precise information hierarchy.

Do not introduce a second color palette, second radius scale, separate typography system, or independent "gaming" theme for Client.

# GC Hub Server

GC Hub Server is the **operator/admin-facing operations surface**.

Its purpose is to expose the operational state of the cyber-cafe while preserving fast access to billing, workstation control, members, POS, transactions, reports, and system administration.

## Server Design Character

Server is the denser of the two surfaces. It should feel like an operations cockpit, technical workstation monitor, and premium Windows desktop administration application.

It should NOT feel like a generic SaaS dashboard, CRM, gaming launcher, or spreadsheet wrapped in Electron.

## Server Application Shell

```text
┌──────────────┬───────────────────────────────────────┬─────────────────────┐
│              │                                       │                     │
│  Navigation  │           Main Workspace              │  Inspector Drawer   │
│              │                                       │                     │
│  Workstations│      Workstation Grid / Tables        │  Contextual Detail  │
│  Members     │                                       │                     │
│  POS         │                                       │  Actions            │
│  Transactions│                                       │                     │
│  Reports     │                                       │                     │
│  Logs        │                                       │                     │
│  Settings    │                                       │                     │
└──────────────┴───────────────────────────────────────┴─────────────────────┘
```

The left navigation is persistent and expandable. The right inspector is contextual and normally hidden until an object is selected.

## Server Primary Navigation

| Section | Primary Purpose | Typical Surface |
|---|---|---|
| Workstations | Monitor/control PCs | Grid |
| Members | Manage customers/accounts | Table + detail |
| POS | Food & beverage operations | Product grid + order |
| Transactions | Financial/session records | Table |
| Reports | Business analysis | Charts + tables |
| Logs | Operational/audit history | Dense table |
| Settings | System configuration | Forms/settings panels |

## Server Workstation Screen

The workstation screen is the default primary workspace.

Priority:

1. workstation identity;
2. connection/status;
3. session state;
4. remaining time;
5. billing amount;
6. member;
7. package;
8. secondary telemetry.

The workstation grid must remain visually dominant over secondary dashboard metrics.

## Server Workstation Card Variants

| Variant | Purpose |
|---|---|
| Available | PC is ready for a new session |
| Active | Session is currently running |
| Selected | Operator is inspecting the workstation |
| Suspended | Session is paused/suspended |
| Locked | Workstation is administratively locked |
| Disconnected | Client is unreachable |
| Error | Workstation/client has a fault |
| Maintenance | Future state for service/maintenance |

Every variant must use the shared status system.

## Server Workstation Actions

Contextual actions may include:

- start session;
- extend time;
- suspend;
- resume;
- lock;
- unlock;
- transfer;
- change package;
- add order;
- view member;
- view transaction;
- terminate session.

Actions must follow the global button hierarchy. The existence of many actions does not justify making all of them primary.

# GC Hub Client

GC Hub Client is the **customer-facing workstation surface**.

It runs on the customer's PC and exposes the current session, account/member state, ordering, available services, notifications, and customer actions.

It is intentionally simpler than Server, but it is **not visually separate from GC Hub**.

## Client Design Character

Client should feel premium, immediate, calm, responsive, slightly more immersive than Server, and easy to understand without operator knowledge.

Client may give more visual space to product imagery and customer-facing content, but it must retain the same GC Hub technical foundation.

## Client Application Shell

Client does not need to copy the Server's three-zone shell.

Recommended composition:

```text
┌────────────────────────────────────────────────────────────────────┐
│ GC HUB                                      SESSION ●  ACCOUNT      │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│                         MAIN CONTENT                               │
│                                                                    │
│                  Session / Store / Account                         │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│ HOME      SESSION      STORE      ORDERS      ACCOUNT              │
└────────────────────────────────────────────────────────────────────┘
```

The exact navigation may change during implementation, but the visual language remains shared.

## Client Primary Navigation

| Section | Purpose | Priority |
|---|---|---|
| Home | Customer overview | High |
| Session | Current billing/session | Highest |
| Store | Food, beverages, services | High |
| Orders | Active and previous orders | Medium |
| Account | Member, balance, achievements | Medium |
| Help | Assistance/system information | Low |

A Client deployment may omit sections that are not enabled for a particular venue.

## Client Home

The Client home should answer immediately:

1. Who am I?
2. Which PC am I using?
3. How much time remains?
4. What is my current balance/session value?
5. What can I do next?

Example:

```text
PC-RUBY
SESSION ACTIVE

00:35:28
REMAINING

Rp20.000
CURRENT SESSION

[ EXTEND SESSION ]
[ ORDER FOOD ]
```

The timer is the dominant operational value.

## Client Session Screen

```text
SESSION

PC-RUBY
ACTIVE

01:24:32
ELAPSED

00:35:28
REMAINING

PACKAGE
2 HOURS

CURRENT CHARGE
Rp20.000

[ EXTEND SESSION ]
```

Secondary information may include session start, package, current rate, member name, balance, session history, and current order total.

## Client Store / POS

The Client Store uses the same product primitives as Server POS but changes composition from operator workflow to customer shopping.

### Product Card

```text
┌──────────────────────────────┐
│                              │
│       PRODUCT IMAGE          │
│                              │
├──────────────────────────────┤
│ ICED COFFEE                  │
│ BEVERAGE                     │
│                              │
│ Rp15.000                     │
│                              │
│ [ ADD ]                      │
└──────────────────────────────┘
```

Product cards may be more visual than Server workstation cards, but they retain shared surface colors, typography, 4px radius, border treatment, button grammar, and status semantics.

Do not turn the Client Store into a colorful mobile-shopping marketplace.

## Client Cart / Order Panel

```text
CURRENT ORDER

Iced Coffee              Rp15.000
French Fries             Rp18.000
                         ─────────
TOTAL                    Rp33.000

[ CLEAR ]
[ PLACE ORDER ]
```

The primary action should be visually dominant while secondary actions remain subdued.

## Client Orders

| Field | Example |
|---|---|
| Order ID | #ORD-1042 |
| Time | 14:32 |
| Items | 2 |
| Total | Rp33.000 |
| Status | Preparing |

Possible statuses:

- Pending;
- Accepted;
- Preparing;
- Ready;
- Delivered;
- Completed;
- Cancelled.

These reuse the global semantic status system.

# Client Account

The account surface may expose:

- member name;
- avatar;
- member tier;
- balance;
- points/XP;
- achievements;
- leaderboard position;
- recent activity.

Example:

```text
GALANG
MEMBER

BALANCE
Rp125.000

POINTS
2,480 XP

TIER
GOLD

[ VIEW ACHIEVEMENTS ]
```

The account screen may be more expressive than Server, but it must remain within the GC Hub palette and geometry.

# Client Gamification

Gamification is an extension of the shared GC Hub product language, not a separate neon game UI.

| Feature | Visual Treatment |
|---|---|
| XP | Numeric metric + progress |
| Tier | Badge |
| Achievement | Card + icon |
| Leaderboard | Dense ranked list |
| Streak | Compact status |
| Reward | Product/action card |
| Level | Progress indicator |

Use GC Green for progress/active emphasis. Use semantic colors only where their meaning is required.

Avoid rainbow gradients, excessive neon, glowing borders, oversized game HUD elements, and unrelated gaming fonts.

# Client Notifications

Notifications use the same global toast/notification primitives.

```text
ORDER READY
Your Iced Coffee is ready.
```

```text
SESSION EXTENDED
30 minutes were added.
```

```text
BALANCE LOW
Your balance is below Rp20.000.
```

The visual treatment is identical to Server notifications; only the message and context differ.

# Client System States

| State | Recommended Presentation |
|---|---|
| Connecting | Compact connection state |
| Connected | Normal UI |
| Session Active | Primary session state |
| Session Expiring | Warning |
| Session Expired | Full contextual notice |
| Server Offline | Clear recovery/error screen |
| Locked | Administrative lock screen |
| Maintenance | Maintenance screen |
| Order Processing | Order status |
| Payment Pending | Payment status |

## Client Connection-Lost State

```text
CONNECTION LOST

GC Hub Server is currently unreachable.

Your last known session state is being preserved.

[ RETRY ]
```

Do not expose technical stack traces or operator-only diagnostics to customers.

## Client Lock / Restricted State

```text
WORKSTATION LOCKED

Please contact the operator
for assistance.

[ CONTACT OPERATOR ]
```

The exact capabilities depend on the actual billing/security implementation.

# Client Full-Screen Behavior

Client is expected to operate as a workstation environment.

The UI should support:

- maximized/full-screen presentation;
- Windows DPI scaling;
- keyboard navigation;
- mouse interaction;
- stable rendering during real-time session updates;
- temporary overlays without exposing underlying restricted controls.

The visual system must not assume a browser tab.

# Shared Component Family

Server and Client use the same component primitives.

| Component | Server Usage | Client Usage | Shared Rule |
|---|---|---|---|
| Button | Actions | Customer actions | Same variants |
| Input | Administration | Account/search | Same geometry |
| Card | Workstation/stat | Product/account | Same surface system |
| Badge | Status/type | Tier/status | Same badge grammar |
| Status Dot | PC/server | Session/order | Same semantic colors |
| Modal | Confirmation | Confirmation/payment | Same modal grammar |
| Toast | Operator feedback | Customer feedback | Same notification grammar |
| Table | Extensive | Orders/history | Same table system |
| Drawer | Inspector | Optional contextual panel | Same surface |
| Tabs | Administration | Store/account categories | Same tab grammar |
| Progress | Reports/session | XP/session | Same visual language |
| Avatar | Member management | Account | Same radius/icon treatment |

# Shared Table System

Tables remain a first-class global component even though Client uses them less frequently.

## Table Types

| Table Type | Surface | Server | Client |
|---|---|---|---|
| Workstation | Dense | Primary | Rare |
| Member | Standard | Primary | Account/history |
| Transaction | Dense | Primary | Payment/history |
| Order | Standard | Primary | Primary for order history |
| Product | Standard | Primary | Store support |
| Inventory | Dense | Primary | Never |
| Logs | Dense | Primary | Never |
| Leaderboard | Compact | Optional | Primary |
| Session History | Compact | Optional | Useful |
| Achievement History | Compact | Optional | Useful |

## Shared Table Tokens

| Property | Standard |
|---|---|
| Header surface | Surface 2 |
| Row surface | Surface 1 |
| Hover | Surface 2 |
| Selected | Surface 3 |
| Divider | Hairline |
| Primary text | Text Primary |
| Secondary text | Text Secondary |
| Metadata | Text Muted |
| Numeric | Tabular numerals |
| Default row density | 40–48px |
| Compact row density | 32–40px |
| Header height | 40–44px |
| Default border | 1px hairline |

Server may use denser tables than Client, but both retain the same visual grammar.

# Shared Product State Language

The same underlying state must look the same across Server and Client.

| Domain State | Server | Client |
|---|---|---|
| Active | ACTIVE | SESSION ACTIVE |
| Available | AVAILABLE | READY |
| Suspended | SUSPENDED | SESSION PAUSED |
| Locked | LOCKED | WORKSTATION LOCKED |
| Disconnected | DISCONNECTED | CONNECTION LOST |
| Error | ERROR | SERVICE UNAVAILABLE |
| Pending | PENDING | PROCESSING |
| Completed | COMPLETED | COMPLETED |

Labels may be role-appropriate, but semantic colors, indicators, and interaction behavior remain shared.

# Shared Payment Language

Server and Client use the same financial vocabulary and formatting.

| Concept | Format |
|---|---|
| Balance | `Rp125.000` |
| Charge | `Rp20.000` |
| Payment | `Rp50.000` |
| Order total | `Rp33.000` |
| Remaining balance | `Rp105.000` |

Payment states reuse:

- Pending;
- Paid;
- Failed;
- Cancelled;
- Refunded.

# Shared QRIS Extension

When QRIS is introduced, both surfaces remain visually related.

Server:

```text
PAYMENT

Rp50.000

QRIS
WAITING FOR PAYMENT

[ CANCEL ]
```

Client:

```text
ADD BALANCE

Rp50.000

SCAN QRIS TO PAY

[ SHOW QR CODE ]
```

The QRIS implementation may have different workflow composition, but typography, surfaces, buttons, status, modal, progress, and success/error states must use the shared GC Hub design system.

# Server vs Client Density Rules

The products share the same design language but intentionally differ in information density.

| Dimension | Server | Client |
|---|---|---|
| Information density | High | Moderate |
| Primary data | Operational state | Customer/session state |
| Tables | Frequent | Occasional |
| Cards | Dense | More visual |
| Navigation | Persistent sidebar | Simplified navigation |
| Inspector | Important | Optional |
| Actions | Many | Few/high-confidence |
| Technical details | Visible | Hidden |
| Error diagnostics | Operator-facing | Customer-safe |
| Imagery | Secondary | More useful for products |
| Full-screen | Optional | Strongly supported |

This is **composition variance, not visual-system variance**.

# Cross-Product Anti-Drift Rules

AI agents and developers MUST NOT create a Client-specific visual language.

Do not:

- introduce a separate Client color palette;
- introduce rounded 16px/20px cards;
- replace GC Green with another primary accent;
- introduce RGB/neon gaming gradients;
- use a separate font;
- create a separate icon family;
- create a separate status color system;
- use a different button geometry;
- create a separate shadow/elevation system;
- make Client look like a generic e-commerce application;
- make Server look like a generic enterprise dashboard.

If a new Client component is required, first determine whether it can reuse an existing global component.

Only create a new component when the workflow genuinely requires one.

# AI Agent Design Contract

When an AI coding/design agent modifies GC Hub:

1. Read this entire design document before creating UI.
2. Determine whether the target surface is Server or Client.
3. Reuse global tokens before introducing new values.
4. Reuse global components before creating variants.
5. Preserve the shared visual identity.
6. Treat Server and Client as members of one product family.
7. Do not infer a new visual style merely from the user role.
8. Do not introduce arbitrary colors, radii, fonts, shadows, or animations.
9. If a requirement conflicts with this design system, prefer the existing system unless the requirement explicitly changes the design system.
10. Document intentional exceptions.

## Component Decision Process

```text
Need a new UI component
        │
        ▼
Does a shared GC Hub component already solve it?
        │
   ┌────┴────┐
   │         │
  YES       NO
   │         │
Reuse it    Can it be a shared component?
             │
        ┌────┴────┐
        │         │
       YES       NO
        │         │
  Add globally  Create application-specific
                composition only
```

The goal is to minimize visual drift between Server and Client.

# Cross-Product Acceptance Criteria

The complete GC Hub product family is successful when:

- Server and Client are immediately recognizable as the same product;
- both use the same GC Green;
- both use the same typography system;
- both use the same surface hierarchy;
- both use the same 4px default geometry;
- both use the same icon family;
- both use the same status semantics;
- both use the same button grammar;
- both use the same motion language;
- Server remains information-dense and operational;
- Client remains simple and customer-oriented;
- neither surface becomes a generic SaaS dashboard;
- neither surface becomes an RGB gaming interface;
- Client can become more visual without abandoning the technical GC Hub identity;
- Server can become denser without losing premium polish;
- a component designed for one surface can be evaluated for reuse on the other;
- new UI work does not silently create a second design system.

# Product Family Design Summary

```text
                     GC HUB
                       │
            ┌──────────┴──────────┐
            │                     │
       GC HUB SERVER         GC HUB CLIENT
       Operations              Customer
            │                     │
            └──────────┬──────────┘
                       │
              SAME DESIGN SYSTEM
                       │
        ┌──────────────┼──────────────┐
        │              │              │
      Apple          BMW M         NVIDIA
    Discipline      Character     Engineering
```

The visual identity is shared. The workflow composition is specialized.

**Server is the operations cockpit.**

**Client is the customer cockpit.**

Both are unmistakably **GC Hub**.

# Known Gaps

The following are intentionally left open until the actual GC Hub
application implementation is reviewed:

-   Exact existing component inventory.
-   Exact workstation card information density after the first
    implementation.
-   Final icon family.
-   Final logo/wordmark.
-   Final light-theme strategy, if one is ever required.
-   Exact command palette design.
-   Exact POS product-image treatment.
-   Exact analytics chart library and visualization grammar.
-   Exact Windows high-DPI typography adjustments.
-   Exact accessibility contrast validation for every component state.
-   Exact animation behavior under heavy real-time workstation updates.

These gaps should be resolved through implementation/testing rather than
by inventing additional visual rules prematurely.

# Design Decision Summary

GC Hub is intentionally:

**Apple in discipline.**\
Quiet, polished, hierarchical, and restrained.

**BMW M in character.**\
Performance-oriented, technical, dark, precise, and slightly aggressive.

**NVIDIA in engineering language.**\
Dense, angular, status-driven, structured, and anchored by one strong
green accent.

The final result should feel like:

> **A premium gaming-cafe operations cockpit built by a hardware
> company, refined by a consumer-product design team.**

It should not feel like a reskinned NVIDIA website, BMW website, Apple
Store, or generic Electron dashboard.
