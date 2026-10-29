; The paper sheet laid over the glass (after GlassCard.inc): warm parchment at 76%, its grain by day,
; and the widget's flower tucked behind the content. The skin sets PlantX / PlantY (the image's top-left).

[KFPaper]
Meter=Shape
Shape=Rectangle 0,0,#W#,#H#,#Radius# | StrokeWidth 0 | Fill Color #KfPaper#
DynamicVariables=1

; clips the grain and the flower to the card (they're drawn here, above the paper)
[KFClip]
Meter=Shape
Shape=Rectangle 0,0,#W#,#H#,#Radius# | StrokeWidth 0 | Fill Color 255,255,255
DynamicVariables=1

[KFGrain]
Meter=Image
ImageName=#@#KaisFlow\grain.png
ImageTiling=1
W=#W#
H=#H#
ImageAlpha=#KfGrain#
Container=KFClip
DynamicVariables=1

[KFPlant]
Meter=Image
X=#PlantX#
Y=#PlantY#
Container=KFClip
DynamicVariables=1
