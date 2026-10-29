; Drawn last: the paper's bright rim, and what a widget says instead of its content when it has none to show
; (no link yet, a revoked link, the feed not reachable) with its one button, plus a short note for a tick.

[KFRim]
Meter=Shape
Shape=Rectangle 0.75,0.75,(#W#-1.5),(#H#-1.5),(#Radius#-0.75) | Fill Color 0,0,0,0 | StrokeWidth 1.5 | Stroke LinearGradient Rim
Rim=35 | #KfRimHot# ; 0.0 | #KfRimCool# ; 0.4 | #KfRimCool# ; 0.7 | #KfRimCatch# ; 1.0
DynamicVariables=1

[KFMsg]
Meter=String
X=(#W#/2)
Y=(#H#/2-22)
W=(#W#-32)
H=36
ClipString=2
StringAlign=CenterCenter
FontFace=#FontFace#
FontWeight=500
FontSize=9.8
FontColor=#KfInk#
AntiAlias=1
DynamicVariables=1
Hidden=1
Text=

[KFBtn]
Meter=Shape
X=((#W#-112)/2)
Y=(#H#/2+6)
Shape=Rectangle 0,0,112,30,15 | StrokeWidth 0 | Fill Color #KfTerra#
MouseOverAction=[!SetOption KFBtn Shape "Rectangle 0,0,112,30,15 | StrokeWidth 0 | Fill Color #KfTerra#,225"][!UpdateMeter KFBtn][!Redraw]
MouseLeaveAction=[!SetOption KFBtn Shape "Rectangle 0,0,112,30,15 | StrokeWidth 0 | Fill Color #KfTerra#"][!UpdateMeter KFBtn][!Redraw]
LeftMouseUpAction=[!CommandMeasure MeasureKF "Button()"]
MouseActionCursor=1
DynamicVariables=1
Hidden=1

[KFBtnText]
Meter=String
X=(#W#/2)
Y=(#H#/2+21)
StringAlign=CenterCenter
FontFace=#FontFace#
FontWeight=700
FontSize=9.5
FontColor=#KfOnTerra#
AntiAlias=1
DynamicVariables=1
Hidden=1
Text=

[KFNote]
Meter=String
X=(#W#/2)
Y=(#H#-14)
StringAlign=CenterBottom
FontFace=#FontFace#
FontWeight=500
FontSize=9
FontColor=#KfOnTerra#
SolidColor=#KfInk#,235
Padding=10,5,10,5
AntiAlias=1
DynamicVariables=1
Hidden=1
Text=
