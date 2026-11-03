import os
# Writes the five skins' .ini files (their rows repeat, so they're generated). After changing a layout:
#   python gen-skins.py
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'Glass', 'KaisFlow')


def head(title, info):
    return f'''[Rainmeter]
Update=1000
AccurateText=1
Group=Glass | KaisFlow
LocalFont1=#@#Fonts\\SF Pro Display.OTF
LocalFont2=#@#Fonts\\SFPRODISPLAYBOLD.OTF
LocalFont3=#@#Fonts\\SFPRODISPLAYMEDIUM.OTF
LocalFont4=#@#Fonts\\SourceSerif4-var.ttf
LocalFont5=#@#KaisFlow\\Fonts\\CourierPrime-Regular.ttf
ContextTitle=Open Kai's Flow
ContextAction=[!CommandMeasure MeasureKF "Go('today')"]
ContextTitle2=Add or change my Widget link
ContextAction2=[!CommandMeasure MeasureInput "ExecuteBatch 1"]
ContextTitle3=-
ContextTitle4=Theme: Auto (7 PM - 6 AM)
ContextAction4=[!CommandMeasure MeasureKF "SetTheme('auto')"]
ContextTitle5=Theme: Day
ContextAction5=[!CommandMeasure MeasureKF "SetTheme('day')"]
ContextTitle6=Theme: Night
ContextAction6=[!CommandMeasure MeasureKF "SetTheme('night')"]
ContextTitle7=-
ContextTitle8=Rebuild glass (new wallpaper)
ContextAction8=["powershell" "-NoProfile" "-ExecutionPolicy" "Bypass" "-WindowStyle" "Hidden" "-File" "#@#make-backdrop.ps1"]

[Metadata]
Name=Kai's Flow - {title}
Author=Kai
Information={info} Right-click > Theme: Auto, Day or Night. A click opens the desktop app, or the website when it isn't installed. Paper on glass (design-export/Desktop widgets.html, direction B). Data: the Widget link from Kai's Flow (Settings > App & updates > Windows desktop), pasted with "Add my link". Snaps to the Glass grid.
Version=1.1

'''


def variables(widget, w, h, dx, dy):
    return f'''[Variables]
Widget={widget}
W={w}
H={h}
Radius=24
; where it first appears (then it stays where you drag it)
DefaultX={dx}
DefaultY={dy}
@Include=#@#GlassVars.inc
@Include2=#@#KaisFlow\\KaisFlow.inc

@Include3=#@#Snap.inc
@Include4=#@#GlassCard.inc
@Include5=#@#KaisFlow\\Paper.inc

'''


TOP = '@Include6=#@#KaisFlow\\Top.inc\n'


def sec(name, **o):
    return '\n'.join([f'[{name}]'] + [f'{k}={v}' for k, v in o.items()]) + '\n\n'


def text(name, **o): return sec(name, Meter='String', MeterStyle='sText', **o)
def shape(name, **o): return sec(name, Meter='Shape', MeterStyle='sShape', **o)


HOVER = dict(MouseOverAction='[!CommandMeasure MeasureKF "Over(\'#CURRENTSECTION#\')"]',
             MouseLeaveAction='[!CommandMeasure MeasureKF "Out(\'#CURRENTSECTION#\')"]',
             LeftMouseUpAction='[!CommandMeasure MeasureKF "Open(\'#CURRENTSECTION#\')"]', MouseActionCursor=1)
HEAD = dict(StringAlign='LeftCenter', FontSize=9.75, FontColor='#KfMuted#', InlineSetting='Weight | 700', InlinePattern='^\\S+',
            InlineSetting2='Color | #KfInk#', InlinePattern2='^\\S+', Text='')
def icon(kind, x, y):
    """A 16 px line icon in the muted ink: sun, clock or calendar (the app's icons are 24 units, stroked 1.6)."""
    import math
    k = 16 / 24
    f = lambda *v: ','.join(f'{n * k:.2f}'.rstrip('0').rstrip('.') for n in v)
    stroke = ' | StrokeWidth 1.1 | Stroke Color #KfMuted# | Fill Color 0,0,0,0 | StrokeStartCap Round | StrokeEndCap Round'
    extra = {}
    if kind == 'clock':
        parts = ['Ellipse ' + f(12, 12, 8), 'Path Hand']
        extra['Hand'] = f(12, 7.8) + ' | LineTo ' + f(12, 12) + ' | LineTo ' + f(15, 14)
    elif kind == 'calendar':
        parts = ['Rectangle ' + f(4, 5.5, 16, 14.5, 2), 'Line ' + f(4, 10, 20, 10), 'Line ' + f(8.5, 3.5, 8.5, 7.5), 'Line ' + f(15.5, 3.5, 15.5, 7.5)]
    else:  # sun: a disc and eight rays
        parts = ['Ellipse ' + f(12, 12, 4.2)]
        for i in range(8):
            a = i * math.pi / 4
            parts.append('Line ' + f(12 + 7 * math.cos(a), 12 + 7 * math.sin(a), 12 + 10 * math.cos(a), 12 + 10 * math.sin(a)))
    shapes = {('Shape' if i == 0 else f'Shape{i + 1}'): part + stroke for i, part in enumerate(parts)}
    return sec('KFIcon', Meter='Shape', X=x, Y=y, Group='Content', DynamicVariables=1, **shapes, **extra)


RULE = '; ' + '-' * 64 + ' '

today = head('Today', "Large (2x2): the goal of the day, Top 3 and today's tasks, tickable.") + variables(
    'Today', 360, 360, 20, 20)
today += RULE + 'header: the date, and how the day is going\n\n'
today += icon('sun', 328, 18)
today += text('TodayDate', X=16, Y=16, FontFace='#Serif#', FontWeight=600, FontSize=15.75, Text='')
today += text('TodaySub', X=16, Y=41, FontSize=9.75, FontColor='#KfMuted#', Text='')
today += RULE + 'the goal of the day (widget.lua sizes the card to its title)\n\n'
today += shape('GoalCard', X=16, Y=67, **HOVER)
today += sec('GoalTape', Meter='Image', ImageName='#@#KaisFlow\\tape.png', X=155, Y=59, Group='Content')
today += sec('GoalCb', Meter='Shape', MeterStyle='sRowCb', X=28, Y=80, Hidden=0)
today += text('GoalTitle', X=55, Y=79, W=247, ClipString=2, ClipStringH=36, FontFace='#Serif#', FontWeight=600, FontSize=11.25, Text='')
today += text('GoalStamp', X=55, Y=101, W=247, ClipString=1, FontFace='#Mono#', FontSize=7.1, FontColor='#KfGold#',
              InlineSetting='CharacterSpacing | 0 | 1 | 0', Text='')
today += RULE + "rows: Top 3 picks 2 and 3, then today's tasks (widget.lua places them)\n\n"
for i in range(1, 7):
    today += sec(f'Row{i}Bg', Meter='Shape', MeterStyle='sRowBg')
    today += sec(f'Row{i}Num', Meter='String', MeterStyle='sRowNum')
    today += sec(f'Row{i}Cb', Meter='Shape', MeterStyle='sRowCb')
    today += sec(f'Row{i}Title', Meter='String', MeterStyle='sRowTitle')
    today += sec(f'Row{i}Meta', Meter='String', MeterStyle='sRowMeta', InlinePattern='^.', InlinePattern2='^.')
today += text('TodayLabel', X=16, StringAlign='LeftCenter', FontSize=9.4, InlineSetting='Weight | 700', InlinePattern='^\\D+',
              InlineSetting2='Color | #KfMuted#', InlinePattern2='\\d+$', Text='')
today += RULE + "footer: overdue, what didn't fit, and +\n\n"
today += text('TodayFoot', X=16, Y=331, W=290, ClipString=1, StringAlign='LeftCenter', FontSize=9, FontColor='#KfMuted#',
              InlineSetting='Color | #KfOver#', InlinePattern='^Overdue \\d+', Text='')
today += shape('TodayAdd', X=318, Y=318, Shape='Ellipse 13,13,13 | StrokeWidth 0 | Fill Color #KfTerra#',
               LeftMouseUpAction='[!CommandMeasure MeasureKF "Go(\'capture\')"]', MouseActionCursor=1)
today += text('TodayAddText', X=331, Y=330, StringAlign='CenterCenter', FontSize=12.75, FontColor='#KfOnTerra#', Text='+')
today += TOP


def go(what):
    return dict(LeftMouseUpAction=f'[!CommandMeasure MeasureKF "Go(\'{what}\')"]', MouseActionCursor=1)


def hit(name, x, y, w, h, what):
    # a see-through rectangle (alpha 1 still takes the mouse) that opens the app, under the text
    return shape(name, X=x, Y=y, Shape=f'Rectangle 0,0,{w},{h},10 | StrokeWidth 0 | Fill Color 0,0,0,1', **go(what))


def blk(i, y):
    return (shape(f'Blk{i}Box', X=15, Y=y, **go(f'next{i}')) + sec(f'Blk{i}Text', Meter='String', MeterStyle='sBlkText', Y=y + 14)
            + sec(f'Blk{i}Right', Meter='String', MeterStyle='sBlkRight', Y=y + 14))


nn = head('Now + next', 'Medium (2x1): the block running now, how far in it you are, and the next two.') + variables(
    'NowNext', 360, 170, 20, 400)
nn += icon('clock', 328, 18)
nn += hit('NNHit', 10, 44, 340, 32, 'now')
nn += text('NNHead', X=16, Y=26, **HEAD)
nn += text('NNLeft', X=298, Y=26, StringAlign='RightCenter', FontSize=9.75, FontColor='#KfMuted#', Text='')
nn += shape('NNRing', X=16, Y=46)
nn += text('NNTitle', X=36, Y=52, W=308, H=24, ClipString=1, StringAlign='LeftCenter', FontWeight=700, FontSize=12.4, Text='')
nn += shape('NNProg', X=16, Y=72)
nn += '; the next two blocks, in their palette C colours\n'
nn += blk(1, 88) + blk(2, 122) + TOP

db = head('Day bar', "Medium (2x1): today's blocks on one bar from 7am to 11pm, where you are on it, and what's next.") + variables(
    'DayBar', 360, 170, 20, 590)
db += icon('calendar', 328, 18)
db += text('DBHead', X=16, Y=26, **{**HEAD, 'InlinePattern': '^\\S+ \\d+', 'InlinePattern2': '^\\S+ \\d+'})
db += '; sunrise and sunset over the bar\n'
db += text('DBSun', X=16, Y=46, FontSize=8.25, FontColor='#KfGold#', Text='[\\x2600]')
db += text('DBMoon', X=219, Y=46, FontSize=8.25, FontColor='#KfGold#', Text='[\\x263E]')
db += "; the track 7am-11pm, its blocks, the goal's gold underline and the now line (widget.lua draws them)\n"
db += shape('DBBar', X=16, Y=46, **go('calendar'))
for hr, x in ((8, 37), (12, 119), (16, 201), (20, 283)):
    db += text(f'DBH{hr}', X=x, Y=80, StringAlign='Center', FontSize=7.9, FontColor='#KfMuted#', Text=f"{hr % 12 or 12}{'am' if hr < 12 else 'pm'}")
db += blk(1, 102) + TOP

goal = head('Goal', "Small (1x1): the goal of the day, tickable. Ticked, it shows a filled check and Done.") + variables(
    'Goal', 170, 170, 20, 780)
goal += shape('GoalCard', X=14, Y=22, **HOVER)
goal += sec('GoalTape', Meter='Image', ImageName='#@#KaisFlow\\tape.png', X=60, Y=14, Group='Content')
goal += text('GoalStamp', X=26, Y=34, W=118, ClipString=1, FontFace='#Mono#', FontSize=7.1, FontColor='#KfGold#',
             InlineSetting='CharacterSpacing | 0 | 1 | 0', Text='')
goal += text('GoalTitle', X=26, Y=52, W=118, H=74, ClipString=2, FontFace='#Serif#', FontWeight=600, FontSize=11.6, Text='')
goal += sec('GoalCb', Meter='Shape', MeterStyle='sRowCb', X=26, Y=127, Hidden=0)
goal += text('GoalWhen', X=51, Y=135, W=93, ClipString=1, StringAlign='LeftCenter', FontSize=9, FontColor='#KfMuted#', Text='')
goal += TOP

nx = head('Next', 'Small (1x1): the next block, when it starts, and the one after.') + variables('Next', 170, 170, 210, 780)
nx += icon('calendar', 140, 16)
nx += hit('SNHit', 8, 36, 154, 112, 'next1')
nx += text('SNHead', X=14, Y=24, **HEAD)
nx += "; the block's colour as a bar down the title's left edge (widget.lua sizes it to the title)\n"
nx += shape('SNBar', X=14, Y=42)
nx += text('SNTitle', X=25, Y=42, W=131, ClipString=2, ClipStringH=56, FontWeight=700, FontSize=11.6, Text='')
nx += text('SNWhen', X=14, Y=65, FontSize=9, FontColor='#KfMuted#', Text='')
nx += text('SNThen', X=14, Y=148, W=142, ClipString=1, StringAlign='LeftCenter', FontSize=9, FontColor='#KfMuted#', Text='')
nx += TOP

for name, body in (('Today', today), ('NowNext', nn), ('DayBar', db), ('Goal', goal), ('Next', nx)):
    os.makedirs(os.path.join(root, name), exist_ok=True)
    with open(os.path.join(root, name, name + '.ini'), 'w', encoding='ascii', newline='\r\n') as f:
        f.write(body)
print('ok')
