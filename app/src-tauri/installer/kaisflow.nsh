; Kai's Flow installer theme (Kai 2026-10-03: "completely look like us, not your average Windows
; installer"). tauri.conf.json hands this file to installer.nsi as `installerHooks` (the one way to
; give the template an absolute path), so KF_DIR is captured here; everything else is macros the
; template inserts after its own defines (PRODUCTNAME, VERSION, UNINSTKEY...).
;
; Every page is full-window: its bottom layer is a bitmap rendered from HTML/CSS
; (design-integration/render_installer.mjs -> pages/*.jpg, one per Windows scale, resampled with
; GDI+ for scales in between). Only what has to be live is a control - the CTA label, links, the
; version/folder lines, toggles, the progress bar - and each sits in a "slot" (layout.nsh) where the
; art is flat linen, so a flat-painted control lands seamlessly. The stock Back/Next/Cancel buttons
; stay alive but hidden: Enter still means Next (every page's CTA) and Esc still means Cancel.

!define KF_DIR "${__FILEDIR__}"
!include "${KF_DIR}\layout.nsh"

; SetCtlColors takes compile-time colours (RRGGBB) - the app's tokens (app/src/styles/tokens);
; KF_SLOT_BG (layout.nsh) is the grained linen's mean colour, which every slot is painted.
!define KF_INK 0x2a2420
!define KF_FAINT 0x6A6354
!define KF_PARCHMENT 0xFBF6E9
!define KF_TERRA 0x9C5139
!define KF_LAVENDER 0x6a5988

Var KfDpi      ; the window's DPI
Var KfPct      ; which shipped art scale to draw from (100/125/150/200)
Var KfCW       ; client size in device px
Var KfCH
Var KfFontCta
Var KfFontLink
Var KfFontLabel
Var KfFontMono
Var KfPage     ; the current page's dialog
Var KfHitL     ; the CTA pill, for clicks on its round ends (they're art, not the label)
Var KfHitT
Var KfHitR
Var KfHitB
Var KfToggle   ; the page's one toggle: 1 on, 0 off
Var KfToggleBox
Var KfChkOn
Var KfChkOff
Var KfPath     ; the welcome page's folder line

; A slot from layout.nsh ("x y w h", CSS px) -> $0 $1 $2 $3 in device px.
!macro KF_SLOT X Y W H
  StrCpy $0 ${X}
  StrCpy $1 ${Y}
  StrCpy $2 ${W}
  StrCpy $3 ${H}
  !ifdef __UNINSTALL__
    Call un.KfScale
  !else
    Call KfScale
  !endif
!macroend

; CSS px (tenths, so 13.5px = 135) -> a GDI font at this DPI.
!macro KF_FONT VAR FACE WEIGHT TENTHS
  IntOp $0 ${TENTHS} * $KfDpi
  IntOp $0 $0 + 480
  IntOp $0 $0 / 960
  IntOp $0 0 - $0
  System::Call 'gdi32::CreateFontW(i r0, i 0, i 0, i 0, i ${WEIGHT}, i 0, i 0, i 0, i 1, i 0, i 0, i 5, i 0, w "${FACE}") p .r0'
  StrCpy ${VAR} $0
!macroend

; Helpers both the installer and the uninstaller need (NSIS wants un.-prefixed copies).
!macro KF_FUNCTIONS UN

; From .onGUIInit: DPI, window size, colours, fonts, art. Runs once, before the first page.
Function ${UN}KfGuiInit
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\kf"
  !ifdef __UNINSTALL__
    File "${KF_DIR}\pages\upr*.jpg"
  !else
    File "${KF_DIR}\pages\welcome-*.jpg" "${KF_DIR}\pages\plant*.jpg"
  !endif
  File "${KF_DIR}\pages\check-*.png"
  File "/oname=$PLUGINSDIR\kf\semibold.ttf" "${KF_DIR}\fonts\InterTight-SemiBold.ttf"
  File "/oname=$PLUGINSDIR\kf\medium.ttf" "${KF_DIR}\fonts\InterTight-Medium.ttf"
  File "/oname=$PLUGINSDIR\kf\mono.ttf" "${KF_DIR}\fonts\CourierPrime-Regular.ttf"

  ; DPI: per-monitor (the template declares PerMonitorV2); the system DPI before Windows 10 1607.
  System::Call 'user32::GetDpiForWindow(p $HWNDPARENT) i .r0'
  ${If} $0 < 96
    System::Call 'user32::GetDC(p 0) p .r1'
    System::Call 'gdi32::GetDeviceCaps(p r1, i 88) i .r0'
    System::Call 'user32::ReleaseDC(p 0, p r1)'
  ${EndIf}
  StrCpy $KfDpi $0
  ; The scales render_installer.mjs ships; others resample the next one up.
  ${If} $KfDpi <= 96
    StrCpy $KfPct 100
  ${ElseIf} $KfDpi <= 120
    StrCpy $KfPct 125
  ${ElseIf} $KfDpi <= 144
    StrCpy $KfPct 150
  ${Else}
    StrCpy $KfPct 200
  ${EndIf}

  ; Size the window so its client area is the art (KF_W x KF_H CSS px), keeping it centred.
  IntOp $KfCW ${KF_W} * $KfDpi
  IntOp $KfCW $KfCW + 48
  IntOp $KfCW $KfCW / 96
  IntOp $KfCH ${KF_H} * $KfDpi
  IntOp $KfCH $KfCH + 48
  IntOp $KfCH $KfCH / 96
  System::Call '*(i 0, i 0, i 0, i 0) p .r9'
  System::Call 'user32::GetWindowRect(p $HWNDPARENT, p r9)'
  System::Call '*$9(i .r1, i .r2, i .r3, i .r4)'
  System::Call 'user32::GetClientRect(p $HWNDPARENT, p r9)'
  System::Call '*$9(i, i, i .r5, i .r6)'
  System::Free $9
  IntOp $3 $3 - $1 ; window w
  IntOp $4 $4 - $2 ; window h
  IntOp $7 $3 - $5 ; + frame
  IntOp $7 $7 + $KfCW
  IntOp $8 $4 - $6
  IntOp $8 $8 + $KfCH
  IntOp $5 $3 - $7
  IntOp $5 $5 / 2
  IntOp $1 $1 + $5
  IntOp $6 $4 - $8
  IntOp $6 $6 / 2
  IntOp $2 $2 + $6
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i r1, i r2, i r7, i r8, i 0x14)'

  ; Hide every stock control (header, lines, branding, buttons); pages cover the whole window.
  System::Call 'user32::GetWindow(p $HWNDPARENT, i 5) p .r0'
  ${DoWhile} $0 <> 0
    ShowWindow $0 ${SW_HIDE}
    System::Call 'user32::GetWindow(p r0, i 2) p .r0'
  ${Loop}

  ; Paper behind page changes, and (Windows 11) a linen title bar with bark text.
  SetCtlColors $HWNDPARENT "" ${KF_SLOT_BG}
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 35, *i 0xDBE9EF, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 36, *i 0x20242A, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 34, *i 0xB0C7CF, i 4)'

  ; GDI+ decodes the art. Never shut down: it lives as long as this window.
  System::Call '*(i 1, p 0, i 0, i 0) p .r1'
  System::Call 'gdiplus::GdiplusStartup(*p .r0, p r1, p 0)'
  System::Free $1

  ; Our fonts, private to this process (gone when it exits); Segoe UI / Consolas if they won't load.
  StrCpy $5 "Inter Tight SemiBold"
  StrCpy $6 "Inter Tight Medium"
  StrCpy $7 "Courier Prime"
  System::Call 'gdi32::AddFontResourceExW(w "$PLUGINSDIR\kf\semibold.ttf", i 0x10, p 0) i .r0'
  ${IfThen} $0 = 0 ${|} StrCpy $5 "Segoe UI" ${|}
  System::Call 'gdi32::AddFontResourceExW(w "$PLUGINSDIR\kf\medium.ttf", i 0x10, p 0) i .r0'
  ${IfThen} $0 = 0 ${|} StrCpy $6 "Segoe UI" ${|}
  System::Call 'gdi32::AddFontResourceExW(w "$PLUGINSDIR\kf\mono.ttf", i 0x10, p 0) i .r0'
  ${IfThen} $0 = 0 ${|} StrCpy $7 "Consolas" ${|}
  !insertmacro KF_FONT $KfFontCta $5 600 150
  !insertmacro KF_FONT $KfFontLink $5 600 135
  !insertmacro KF_FONT $KfFontLabel $6 500 140
  !insertmacro KF_FONT $KfFontMono $7 400 120

  ; The toggle box, both states (18 CSS px).
  IntOp $1 18 * $KfDpi
  IntOp $1 $1 + 48
  IntOp $1 $1 / 96
  StrCpy $2 $1
  StrCpy $0 "$PLUGINSDIR\kf\check-on-$KfPct.png"
  Call ${UN}KfArt
  StrCpy $KfChkOn $0
  StrCpy $0 "$PLUGINSDIR\kf\check-off-$KfPct.png"
  Call ${UN}KfArt
  StrCpy $KfChkOff $0
FunctionEnd

; $0 = image, $1 $2 = size wanted (device px) -> $0 = HBITMAP (0 if it failed). A shipped scale is
; used as is; anything else is resampled from it (high-quality bicubic, edges mirrored).
; ponytail: the bitmaps are never freed - a few MB that go when the process does.
Function ${UN}KfArt
  System::Call 'gdiplus::GdipCreateBitmapFromFile(w r0, *p .r3) i .r4'
  StrCpy $0 0
  ${If} $4 = 0
    System::Call 'gdiplus::GdipGetImageWidth(p r3, *i .r5)'
    System::Call 'gdiplus::GdipGetImageHeight(p r3, *i .r6)'
    StrCpy $7 $3
    ${If} $5 <> $1
    ${OrIf} $6 <> $2
      System::Call 'gdiplus::GdipCreateBitmapFromScan0(i r1, i r2, i 0, i 0x22009, p 0, *p .r7)'
      System::Call 'gdiplus::GdipGetImageGraphicsContext(p r7, *p .r8)'
      System::Call 'gdiplus::GdipSetInterpolationMode(p r8, i 7)'
      System::Call 'gdiplus::GdipSetPixelOffsetMode(p r8, i 2)'
      System::Call 'gdiplus::GdipCreateImageAttributes(*p .r9)'
      System::Call 'gdiplus::GdipSetImageAttributesWrapMode(p r9, i 3, i 0, i 0)'
      System::Call 'gdiplus::GdipDrawImageRectRectI(p r8, p r3, i 0, i 0, i r1, i r2, i 0, i 0, i r5, i r6, i 2, p r9, p 0, p 0)'
      System::Call 'gdiplus::GdipDisposeImageAttributes(p r9)'
      System::Call 'gdiplus::GdipDeleteGraphics(p r8)'
    ${EndIf}
    System::Call 'gdiplus::GdipCreateHBITMAPFromBitmap(p r7, *p .r0, i 0xFFEFE9DB)'
    ${If} $7 <> $3
      System::Call 'gdiplus::GdipDisposeImage(p r7)'
    ${EndIf}
    System::Call 'gdiplus::GdipDisposeImage(p r3)'
  ${EndIf}
FunctionEnd

; $0 $1 $2 $3: CSS px -> device px, rounded.
Function ${UN}KfScale
  IntOp $0 $0 * $KfDpi
  IntOp $0 $0 + 48
  IntOp $0 $0 / 96
  IntOp $1 $1 * $KfDpi
  IntOp $1 $1 + 48
  IntOp $1 $1 / 96
  IntOp $2 $2 * $KfDpi
  IntOp $2 $2 + 48
  IntOp $2 $2 / 96
  IntOp $3 $3 * $KfDpi
  IntOp $3 $3 + 48
  IntOp $3 $3 / 96
FunctionEnd

; $6 = font, $7 = text -> $8 $9 = its size in device px.
Function ${UN}KfMeasure
  Push $0
  Push $1
  Push $2
  Push $3
  System::Call 'user32::GetDC(p 0) p .r0'
  System::Call 'gdi32::SelectObject(p r0, p r6) p .r1'
  StrLen $2 $7
  System::Call '*(i 0, i 0) p .r3'
  System::Call 'gdi32::GetTextExtentPoint32W(p r0, w r7, i r2, p r3)'
  System::Call '*$3(i .r8, i .r9)'
  System::Free $3
  System::Call 'gdi32::SelectObject(p r0, p r1)'
  System::Call 'user32::ReleaseDC(p 0, p r0)'
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

; NSIS re-shows Back/Next on page changes; keep them hidden (still live for Enter and Esc).
Function ${UN}KfHideButtons
  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
FunctionEnd

; Opens a custom page: a full-window nsDialogs page, painted linen -> $KfPage.
Function ${UN}KfPageBegin
  nsDialogs::Create 1018
  Pop $KfPage
  SetCtlColors $KfPage "" ${KF_SLOT_BG}
  System::Call 'user32::SetWindowPos(p $KfPage, p 0, i 0, i 0, i $KfCW, i $KfCH, i 0x10)'
  Call ${UN}KfHideButtons
FunctionEnd

; $0 = art name: lays it at the bottom of the page and shows the page.
Function ${UN}KfPageShow
  StrCpy $0 "$PLUGINSDIR\kf\$0-$KfPct.jpg"
  StrCpy $1 $KfCW
  StrCpy $2 $KfCH
  Call ${UN}KfArt
  StrCpy $1 $0
  nsDialogs::CreateControl STATIC ${WS_CHILD}|${WS_VISIBLE}|${WS_CLIPSIBLINGS}|${SS_BITMAP}|${SS_NOTIFY} 0 0 0 0 0 ""
  Pop $0
  SendMessage $0 ${STM_SETIMAGE} ${IMAGE_BITMAP} $1
  System::Call 'user32::SetWindowPos(p r0, p 1, i 0, i 0, i $KfCW, i $KfCH, i 0x10)'
  ${NSD_OnClick} $0 ${UN}KfArtClick
  nsDialogs::Show
FunctionEnd

; A click on the art: the CTA if it landed on the pill's round ends.
Function ${UN}KfArtClick
  Pop $0
  System::Call '*(i 0, i 0) p .r1'
  System::Call 'user32::GetCursorPos(p r1)'
  System::Call 'user32::ScreenToClient(p $KfPage, p r1)'
  System::Call '*$1(i .r2, i .r3)'
  System::Free $1
  ${If} $2 >= $KfHitL
  ${AndIf} $2 < $KfHitR
  ${AndIf} $3 >= $KfHitT
  ${AndIf} $3 < $KfHitB
    SendMessage $HWNDPARENT 0x408 1 0
  ${EndIf}
FunctionEnd

Function ${UN}KfNext
  Pop $0
  SendMessage $HWNDPARENT 0x408 1 0
FunctionEnd

; $0..$3 = the pill's slot, $4 = label. The pill is art; the label fills its straight middle.
Function ${UN}KfCta
  StrCpy $KfHitL $0
  StrCpy $KfHitT $1
  IntOp $KfHitR $0 + $2
  IntOp $KfHitB $1 + $3
  IntOp $5 $3 / 2
  IntOp $0 $0 + $5
  IntOp $2 $2 - $3
  IntOp $1 $1 + 1
  IntOp $3 $3 - 2
  nsDialogs::CreateControl STATIC ${WS_CHILD}|${WS_VISIBLE}|${WS_CLIPSIBLINGS}|${SS_CENTER}|${SS_CENTERIMAGE}|${SS_NOPREFIX}|${SS_NOTIFY} 0 0 0 0 0 $4
  Pop $5
  SendMessage $5 ${WM_SETFONT} $KfFontCta 0
  SetCtlColors $5 ${KF_PARCHMENT} ${KF_TERRA}
  System::Call 'user32::SetWindowPos(p r5, p 0, i r0, i r1, i r2, i r3, i 0x14)'
  ${NSD_OnClick} $5 ${UN}KfNext
FunctionEnd

; $0..$3 = slot, $4 = text, $5 = extra style -> $5 = a centred mono line.
Function ${UN}KfLine
  nsDialogs::CreateControl STATIC ${WS_CHILD}|${WS_VISIBLE}|${WS_CLIPSIBLINGS}|${SS_CENTER}|${SS_NOPREFIX}|$5 0 0 0 0 0 $4
  Pop $5
  SendMessage $5 ${WM_SETFONT} $KfFontMono 0
  SetCtlColors $5 ${KF_FAINT} ${KF_SLOT_BG}
  System::Call 'user32::SetWindowPos(p r5, p 0, i r0, i r1, i r2, i r3, i 0x14)'
FunctionEnd

; $0..$3 = slot, $4 = text -> $5 = a quiet lavender link centred in it. Not a tab stop: Enter
; anywhere means the CTA, so a focused link must never be what Enter hits.
Function ${UN}KfLink
  StrCpy $6 $KfFontLink
  StrCpy $7 $4
  Call ${UN}KfMeasure
  IntOp $8 $8 + 2 ; nsDialogs draws links 2px wider, for the focus rectangle
  IntOp $5 $2 - $8
  IntOp $5 $5 / 2
  IntOp $0 $0 + $5
  IntOp $5 $3 - $9
  IntOp $5 $5 / 2
  IntOp $1 $1 + $5
  nsDialogs::CreateControl LINK ${WS_CHILD}|${WS_VISIBLE}|${WS_CLIPSIBLINGS}|${BS_OWNERDRAW} 0 0 0 0 0 $4
  Pop $5
  SendMessage $5 ${WM_SETFONT} $KfFontLink 0
  SetCtlColors $5 ${KF_LAVENDER} ${KF_SLOT_BG}
  System::Call 'user32::SetWindowPos(p r5, p 0, i r0, i r1, i r8, i r9, i 0x14)'
FunctionEnd

; $0..$3 = slot, $4 = label, $KfToggle = state: our check box + its label, centred as a group.
; The label is a tab stop; Space flips it, Enter still means the CTA.
Function ${UN}KfToggle
  StrCpy $6 $KfFontLabel
  StrCpy $7 $4
  Call ${UN}KfMeasure
  IntOp $8 $8 + 2
  IntOp $R8 18 * $KfDpi ; box
  IntOp $R8 $R8 + 48
  IntOp $R8 $R8 / 96
  IntOp $R9 10 * $KfDpi ; gap
  IntOp $R9 $R9 + 48
  IntOp $R9 $R9 / 96
  IntOp $5 $R8 + $R9
  IntOp $5 $5 + $8
  IntOp $5 $2 - $5
  IntOp $5 $5 / 2
  IntOp $0 $0 + $5 ; group left
  IntOp $R7 $3 - $R8
  IntOp $R7 $R7 / 2
  IntOp $R7 $R7 + $1 ; box top
  IntOp $5 $3 - $9
  IntOp $5 $5 / 2
  IntOp $1 $1 + $5 ; label top
  nsDialogs::CreateControl LINK ${WS_CHILD}|${WS_VISIBLE}|${WS_CLIPSIBLINGS}|${WS_TABSTOP}|${BS_OWNERDRAW} 0 0 0 0 0 $4
  Pop $5
  SendMessage $5 ${WM_SETFONT} $KfFontLabel 0
  SetCtlColors $5 ${KF_INK} ${KF_SLOT_BG}
  IntOp $2 $0 + $R8
  IntOp $2 $2 + $R9
  System::Call 'user32::SetWindowPos(p r5, p 0, i r2, i r1, i r8, i r9, i 0x14)'
  ${NSD_OnClick} $5 ${UN}KfToggleClick
  nsDialogs::CreateControl STATIC ${WS_CHILD}|${WS_VISIBLE}|${WS_CLIPSIBLINGS}|${SS_BITMAP}|${SS_NOTIFY} 0 0 0 0 0 ""
  Pop $KfToggleBox
  Call ${UN}KfToggleDraw
  System::Call 'user32::SetWindowPos(p $KfToggleBox, p 0, i r0, i $R7, i $R8, i $R8, i 0x14)'
  ${NSD_OnClick} $KfToggleBox ${UN}KfToggleClick
FunctionEnd

Function ${UN}KfToggleDraw
  ${If} $KfToggle = 1
    SendMessage $KfToggleBox ${STM_SETIMAGE} ${IMAGE_BITMAP} $KfChkOn
  ${Else}
    SendMessage $KfToggleBox ${STM_SETIMAGE} ${IMAGE_BITMAP} $KfChkOff
  ${EndIf}
FunctionEnd

Function ${UN}KfToggleClick
  Pop $0
  IntOp $KfToggle 1 - $KfToggle
  Call ${UN}KfToggleDraw
FunctionEnd

; MUI's install-files page, dressed: $R0 = art. The stock progress bar becomes a flat moss bar on
; a pale track, the status line a centred mono line under it; the details list stays hidden.
Function ${UN}KfProgressShow
  FindWindow $KfPage "#32770" "" $HWNDPARENT
  System::Call 'user32::SetWindowPos(p $KfPage, p 0, i 0, i 0, i $KfCW, i $KfCH, i 0x10)'
  SetCtlColors $KfPage "" ${KF_SLOT_BG}
  Call ${UN}KfHideButtons
  GetDlgItem $0 $KfPage 1016
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $KfPage 1027
  ShowWindow $0 ${SW_HIDE}

  GetDlgItem $R1 $KfPage 1004
  System::Call 'uxtheme::SetWindowTheme(p $R1, w " ", w " ")'
  System::Call 'user32::GetWindowLongW(p $R1, i -20) i .r0'
  IntOp $0 $0 & 0xFFFDFDFF ; no WS_EX_CLIENTEDGE / WS_EX_STATICEDGE
  System::Call 'user32::SetWindowLongW(p $R1, i -20, i r0)'
  System::Call 'user32::GetWindowLongW(p $R1, i -16) i .r0'
  IntOp $0 $0 & 0xFF7FFFFF ; no WS_BORDER
  IntOp $0 $0 | 1 ; PBS_SMOOTH
  System::Call 'user32::SetWindowLongW(p $R1, i -16, i r0)'
  SendMessage $R1 0x2001 0 0xC2D8E0 ; PBM_SETBKCOLOR: #E0D8C2
  SendMessage $R1 0x409 0 0x6E947A ; PBM_SETBARCOLOR: moss #7A946E
  !ifdef __UNINSTALL__
    !insertmacro KF_SLOT ${KF_UPROOTING_BAR}
  !else
    !insertmacro KF_SLOT ${KF_PLANTING_BAR}
  !endif
  System::Call 'user32::SetWindowPos(p $R1, p 0, i r0, i r1, i r2, i r3, i 0x34)'

  GetDlgItem $R1 $KfPage 1006
  System::Call 'user32::GetWindowLongW(p $R1, i -16) i .r0'
  IntOp $0 $0 & 0xFFFFFFE0
  IntOp $0 $0 | 0x4081 ; SS_CENTER | SS_NOPREFIX | SS_ENDELLIPSIS
  System::Call 'user32::SetWindowLongW(p $R1, i -16, i r0)'
  SendMessage $R1 ${WM_SETFONT} $KfFontMono 0
  SetCtlColors $R1 ${KF_FAINT} ${KF_SLOT_BG}
  !ifdef __UNINSTALL__
    !insertmacro KF_SLOT ${KF_UPROOTING_STATUS}
  !else
    !insertmacro KF_SLOT ${KF_PLANTING_STATUS}
  !endif
  System::Call 'user32::SetWindowPos(p $R1, p 0, i r0, i r1, i r2, i r3, i 0x34)'

  StrCpy $0 "$PLUGINSDIR\kf\$R0-$KfPct.jpg"
  StrCpy $1 $KfCW
  StrCpy $2 $KfCH
  Call ${UN}KfArt
  StrCpy $1 $0
  System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "", i 0x5400000E, i 0, i 0, i $KfCW, i $KfCH, p $KfPage, p 0, p 0, p 0) p .r0'
  SendMessage $0 ${STM_SETIMAGE} ${IMAGE_BITMAP} $1
  System::Call 'user32::SetWindowPos(p r0, p 1, i 0, i 0, i 0, i 0, i 0x13)'
FunctionEnd

!macroend

; ── The installer's pages ─────────────────────────────────────────────────────────────────────
!macro KF_INSTALLER_PAGES

; Welcome: the K, "Kai's Flow", one line, and one action. What the action says depends on what is
; already planted here.
Function KfWelcome
  ${IfThen} $PassiveMode = 1 ${|} Abort ${|}
  ReadRegStr $R0 SHCTX "${UNINSTKEY}" "DisplayVersion"
  StrCpy $R1 "Plant it"
  StrCpy $R2 "v${VERSION} · just for you, no admin needed"
  ${If} $R0 != ""
    nsis_tauri_utils::SemverCompare "${VERSION}" $R0
    Pop $R3
    ${If} $R3 = 1
      StrCpy $R1 "Update"
      StrCpy $R2 "v$R0 → v${VERSION} · your garden stays as it is"
    ${ElseIf} $R3 = 0
      StrCpy $R1 "Replant"
      StrCpy $R2 "v${VERSION} is already planted · this tends it afresh"
    ${Else}
      StrCpy $R1 "Replant"
      StrCpy $R2 "v$R0 → v${VERSION} · an older version"
    ${EndIf}
  ${EndIf}

  Call KfPageBegin
  !insertmacro KF_SLOT ${KF_WELCOME_CTA}
  StrCpy $4 $R1
  Call KfCta
  !insertmacro KF_SLOT ${KF_WELCOME_VER}
  StrCpy $4 $R2
  StrCpy $5 0
  Call KfLine
  !insertmacro KF_SLOT ${KF_WELCOME_PATH}
  StrCpy $4 $INSTDIR
  StrCpy $5 ${SS_PATHELLIPSIS}
  Call KfLine
  StrCpy $KfPath $5
  !insertmacro KF_SLOT ${KF_WELCOME_ALT}
  StrCpy $4 "Install elsewhere…"
  Call KfLink
  ${NSD_OnClick} $5 KfPickFolder
  StrCpy $0 welcome
  Call KfPageShow
FunctionEnd

; "Install elsewhere…": a folder picker straight from Welcome instead of a directory page.
Function KfPickFolder
  Pop $0
  nsDialogs::SelectFolderDialog "Where should ${PRODUCTNAME} live?" "$INSTDIR"
  Pop $0
  ${If} $0 != error
  ${AndIf} $0 != ""
    StrCpy $1 $0 1 -1
    ${IfThen} $1 == "\" ${|} StrCpy $0 $0 -1 ${|}
    ${GetFileName} $0 $1
    ${IfThen} $1 != "${PRODUCTNAME}" ${|} StrCpy $0 "$0\${PRODUCTNAME}" ${|}
    StrCpy $INSTDIR $0
    SendMessage $KfPath ${WM_SETTEXT} 0 "STR:$INSTDIR"
  ${EndIf}
FunctionEnd

Function KfPlantingShow
  StrCpy $R0 planting
  Call KfProgressShow
FunctionEnd

; Planted: "Open Kai's Flow now" (on) and Done.
Function KfPlanted
  ${IfThen} $PassiveMode = 1 ${|} Abort ${|}
  Call KfPageBegin
  StrCpy $KfToggle 1
  !insertmacro KF_SLOT ${KF_PLANTED_OPEN}
  StrCpy $4 "Open ${PRODUCTNAME} now"
  Call KfToggle
  !insertmacro KF_SLOT ${KF_PLANTED_CTA}
  StrCpy $4 "Done"
  Call KfCta
  StrCpy $0 planted
  Call KfPageShow
FunctionEnd

Function KfPlantedLeave
  ${If} $KfToggle = 1
    Call RunMainBinary
  ${EndIf}
FunctionEnd

!macroend

; ── The uninstaller's pages ───────────────────────────────────────────────────────────────────
!macro KF_UNINSTALLER_PAGES

; "Uproot Kai's Flow?": calm, and clear that the garden itself lives in the cloud and stays.
Function un.KfUproot
  ${IfThen} $PassiveMode = 1 ${|} Abort ${|}
  Call un.KfPageBegin
  StrCpy $KfToggle 0
  !insertmacro KF_SLOT ${KF_UPROOT_WIPE}
  StrCpy $4 "Also forget this PC’s sign-in and cache"
  Call un.KfToggle
  !insertmacro KF_SLOT ${KF_UPROOT_CTA}
  StrCpy $4 "Uproot"
  Call un.KfCta
  !insertmacro KF_SLOT ${KF_UPROOT_KEEP}
  StrCpy $4 "Keep it"
  Call un.KfLink
  ${NSD_OnClick} $5 un.KfKeep
  StrCpy $0 uproot
  Call un.KfPageShow
FunctionEnd

Function un.KfUprootLeave
  StrCpy $DeleteAppDataCheckboxState $KfToggle
FunctionEnd

Function un.KfKeep
  Pop $0
  SendMessage $HWNDPARENT ${WM_COMMAND} 2 0 ; Cancel
FunctionEnd

Function un.KfUprootingShow
  StrCpy $R0 uprooting
  Call un.KfProgressShow
FunctionEnd

Function un.KfUprooted
  ${IfThen} $PassiveMode = 1 ${|} Abort ${|}
  ${IfThen} $UpdateMode = 1 ${|} Abort ${|}
  Call un.KfPageBegin
  !insertmacro KF_SLOT ${KF_UPROOTED_CTA}
  StrCpy $4 "Close"
  Call un.KfCta
  StrCpy $0 uprooted
  Call un.KfPageShow
FunctionEnd

!macroend
