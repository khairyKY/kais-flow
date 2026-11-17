; Kai's Flow, Her day skin (Partner sharing P2, flow 6): the person you share with, at the level you both allow.
; Its own file, not KaisFlow.inc: its own key (function share-widget, migration 0104), its own script (herday.lua), asking every
; 5 minutes. It never reads the Widget link and never your own day. Tokens are the same as KaisFlow.inc (the day values;
; herday.lua swaps in the night ones). Includes: GlassVars.inc and Snap.inc / GlassCard.inc come from Kai's Glass set, as the others.

[Variables]
; Empty = the key you pasted with "Add my key" (the live feed). sample = @Resources\KaisFlow\sample-her-feed.json, to try the skin.
FeedURL=
AppScheme=kaisflow
AppURL=https://kais-flow.kaidagoat.workers.dev
NightFrom=19
NightTo=6
Serif=Source Serif 4
Mono=Courier Prime
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
KfRimHot=255,255,255,140
KfRimCool=255,255,255,31
KfRimCatch=255,255,255,77

; ---------------------------------------------------------------- measures

; her day: share-widget answers with JSON for any status (200, paused, 401, 410, 429), herday.lua reads which. Every 5 minutes.
[MeasureFeed]
Measure=WebParser
URL=file://#@#KaisFlow\sample-her-feed.json
RegExp=(?s)^(.*)$
StringIndex=1
UpdateRate=300
Disabled=1
FinishAction=[!CommandMeasure MeasureKF "Parse()"]
OnConnectErrorAction=[!CommandMeasure MeasureKF "Offline()"]
OnRegExpErrorAction=[!CommandMeasure MeasureKF "Parse()"]

[MeasureKF]
Measure=Script
ScriptFile=#@#KaisFlow\herday.lua
UpdateDivider=30

[MeasureApp]
Measure=Registry
RegHKey=HKEY_CLASSES_ROOT
RegKey=#AppScheme#
OutputType=SubKeyList
UpdateDivider=-1

[MeasureAppValue]
Measure=Registry
RegHKey=HKEY_CLASSES_ROOT
RegKey=#AppScheme#
OutputType=Value
UpdateDivider=-1

; "Add my key": paste the link from Kai's Flow, Settings > Sharing > Widgets > Make a key, and press Enter
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

; her block: its text and its right-hand note
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
