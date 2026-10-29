; Kai's Flow desktop widgets, direction B "Paper on glass" (design-export/Desktop widgets.html).
; Shared by the five skins in Glass\KaisFlow. A skin sets Widget, W, H, Radius and the plant's place,
; then includes GlassVars.inc, this file, Snap.inc, GlassCard.inc, Paper.inc, its own meters and Top.inc.
; widget.lua fills everything from the Widget feed (kaisflow.lua reads it).

[Variables]
; Where the widgets read from. Empty = the Widget link you pasted with "Add my link" (the live feed).
; sample = the sample feed in @Resources\KaisFlow, to try the widgets before the feed is live.
; Anything else is used as it is (an https:// link, or file:///C:/path/to/feed.json).
FeedURL=
; what "Open" and the + button open
AppURL=https://kais-flow.kaidagoat.workers.dev
; Night Garden colours from NightFrom:00 to NightTo:00 on this PC's clock
NightFrom=19
NightTo=6
Serif=Source Serif 4
Mono=Courier Prime
; Kai's Flow's tokens (app/src/styles/tokens). The day values; widget.lua swaps in the night ones.
KfPaper=251,246,233,194
KfBone=246,240,225
KfGoal=248,239,211
KfInk=42,36,32
KfMuted=95,88,73
KfHair=136,129,110
KfLine=224,216,194
KfGoalLine=220,196,142
KfTerra=181,101,74
KfOnTerra=251,246,233
KfGold=127,100,40
KfOver=156,81,57
KfGrain=255
; the paper sheet's rim: brighter than the glass's (the design's .d-B .glass::after)
KfRimHot=255,255,255,140
KfRimCool=255,255,255,31
KfRimCatch=255,255,255,77

; ---------------------------------------------------------------- measures

; the feed: widget.lua sets URL from the link (or FeedURL) and turns it on; it stays off without one
[MeasureFeed]
Measure=WebParser
URL=file://#@#KaisFlow\sample-feed.json
RegExp=(?s)^(.*)$
StringIndex=1
UpdateRate=60
Disabled=1
FinishAction=[!CommandMeasure MeasureKF "Parse()"]
OnConnectErrorAction=[!CommandMeasure MeasureKF "Offline()"]
OnRegExpErrorAction=[!CommandMeasure MeasureKF "Parse()"]

; a tick: WebParser can only read, so curl.exe (built into Windows) POSTs it. widget.lua sets Parameter.
[MeasureTick]
Measure=Plugin
Plugin=RunCommand
Program=curl.exe
Parameter=
State=Hide
OutputType=UTF8
Timeout=20000
FinishAction=[!CommandMeasure MeasureKF "TickDone()"]

[MeasureKF]
Measure=Script
ScriptFile=#@#KaisFlow\widget.lua
UpdateDivider=30

; "Add my link": paste the Widget link from Settings > App & updates > Windows desktop and press Enter
[MeasureInput]
Measure=Plugin
Plugin=InputText
X=12
Y=((#H#-32)/2)
W=(#W#-24)
H=32
FontFace=Segoe UI
FontSize=10
FontColor=255,255,255
SolidColor=38,34,51,245
FocusDismiss=1
Command1=[!SetVariable KfPasted "$UserInput$"][!CommandMeasure MeasureKF "SaveLink()"]

; ---------------------------------------------------------------- styles

[sText]
FontFace=#FontFace#
FontSize=10.1
FontColor=#KfInk#
AntiAlias=1
DynamicVariables=1
Group=Content

[sShape]
Shape=Rectangle 0,0,0,0 | StrokeWidth 0
DynamicVariables=1
Group=Content

; a list row: its hover wash, number, box, title and what's on the right (widget.lua places and fills them)
[sRowBg]
X=10
W=340
H=30
Shape=Rectangle 0,0,340,30,10 | StrokeWidth 0 | Fill Color #KfBone#,1
MouseOverAction=[!CommandMeasure MeasureKF "Over('#CURRENTSECTION#')"]
MouseLeaveAction=[!CommandMeasure MeasureKF "Out('#CURRENTSECTION#')"]
LeftMouseUpAction=["#AppURL#"]
MouseActionCursor=1
DynamicVariables=1
Group=Content
Hidden=1

[sRowNum]
X=20
StringAlign=CenterCenter
FontFace=#FontFace#
FontSize=8.6
FontColor=#KfHair#
AntiAlias=1
DynamicVariables=1
Group=Content
Hidden=1

[sRowCb]
W=17
H=17
Shape=Rectangle 0,0,0,0 | StrokeWidth 0
MouseOverAction=[!CommandMeasure MeasureKF "Over('#CURRENTSECTION#')"]
MouseLeaveAction=[!CommandMeasure MeasureKF "Out('#CURRENTSECTION#')"]
LeftMouseUpAction=[!CommandMeasure MeasureKF "Tick('#CURRENTSECTION#')"]
MouseActionCursor=1
DynamicVariables=1
Group=Content
Hidden=1

[sRowTitle]
StringAlign=LeftCenter
ClipString=1
H=20
FontFace=#FontFace#
FontSize=10.1
FontColor=#KfInk#
AntiAlias=1
DynamicVariables=1
Group=Content
Hidden=1

[sRowMeta]
X=344
StringAlign=RightCenter
FontFace=#FontFace#
FontSize=9
FontColor=#KfMuted#
AntiAlias=1
DynamicVariables=1
Group=Content
Hidden=1

; a palette C block: the box (widget.lua draws it in the block's colour), its text and its right-hand note
[sBlkText]
X=26
W=250
H=20
StringAlign=LeftCenter
ClipString=1
FontFace=#FontFace#
FontSize=9.4
AntiAlias=1
DynamicVariables=1
Group=Content
Hidden=1

[sBlkRight]
X=334
StringAlign=RightCenter
FontFace=#FontFace#
FontSize=9.4
AntiAlias=1
DynamicVariables=1
Group=Content
Hidden=1
