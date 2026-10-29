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
ContextAction=["#AppURL#"]
ContextTitle2=Add or change my Widget link
ContextAction2=[!CommandMeasure MeasureInput "ExecuteBatch 1"]
ContextTitle3=Rebuild glass (after changing wallpaper)
ContextAction3=["powershell" "-NoProfile" "-ExecutionPolicy" "Bypass" "-WindowStyle" "Hidden" "-File" "#@#make-backdrop.ps1"]

[Metadata]
Name=Kai's Flow - {title}
Author=Kai
Information={info} Paper on glass (design-export/Desktop widgets.html, direction B). Data: the Widget link from Kai's Flow (Settings > App & updates > Windows desktop), pasted with "Add my link". Snaps to the Glass grid.
Version=1.0

'''


def variables(widget, w, h, px, py, dx, dy, note=''):
    return f'''[Variables]
Widget={widget}
W={w}
H={h}
Radius=24
{note}PlantX={px}
PlantY={py}
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
             LeftMouseUpAction='["#AppURL#"]', MouseActionCursor=1)
HEAD = dict(StringAlign='LeftCenter', FontSize=9.75, FontColor='#KfMuted#', InlineSetting='Weight | 700', InlinePattern='^\\S+',
            InlineSetting2='Color | #KfInk#', InlinePattern2='^\\S+', Text='')
RULE = '; ' + '-' * 64 + ' '

today = head('Today', "Large (2x2): the goal of the day, Top 3 and today's tasks, tickable.") + variables(
    'Today', 360, 360, 240, -44, 20, 20, "; the header flower: the image's top-left (it has a 10 px clear margin all round)\n")
today += RULE + 'header: the date, and how the day is going\n\n'
today += text('TodayDate', X=16, Y=16, FontFace='#Serif#', FontWeight=600, FontSize=15.75, Text='')
today += text('TodaySub', X=16, Y=41, FontSize=9.75, FontColor='#KfMuted#', Text='')
today += RULE + 'the goal of the day (widget.lua sizes the card to its title)\n\n'
today += shape('GoalCard', X=16, Y=67, **HOVER)
today += sec('GoalTape', Meter='Image', ImageName='#@#KaisFlow\\tape.png', X=155, Y=59, Group='Content')
today += sec('GoalCb', Meter='Shape', MeterStyle='sRowCb', X=28, Y=80, Hidden=0)
today += text('GoalTitle', X=55, Y=79, W=247, ClipString=2, ClipStringH=36, FontFace='#Serif#', FontWeight=600, FontSize=11.25, Text='')
today += text('GoalStamp', X=55, Y=101, W=247, ClipString=1, FontFace='#Mono#', FontSize=7.1, FontColor='#KfGold#',
              InlineSetting='CharacterSpacing | 0 | 1 | 0', Text='')
today += '; the bud on the card: cherry-bud, in bloom once the goal is ticked\n'
today += sec('GoalBud', Meter='Image', X=302, Y=66, Group='Content')
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
               LeftMouseUpAction='["#AppURL#"]', MouseActionCursor=1)
today += text('TodayAddText', X=331, Y=330, StringAlign='CenterCenter', FontSize=12.75, FontColor='#KfOnTerra#', Text='+')
today += TOP


def blk(i, y):
    return (shape(f'Blk{i}Box', X=15, Y=y) + sec(f'Blk{i}Text', Meter='String', MeterStyle='sBlkText', Y=y + 14)
            + sec(f'Blk{i}Right', Meter='String', MeterStyle='sBlkRight', Y=y + 14))


nn = head('Now + next', 'Medium (2x1): the block running now, how far in it you are, and the next two.') + variables(
    'NowNext', 360, 170, 302, -32, 20, 400)
nn += text('NNHead', X=16, Y=26, **HEAD)
nn += text('NNLeft', X=298, Y=26, StringAlign='RightCenter', FontSize=9.75, FontColor='#KfMuted#', Text='')
nn += shape('NNRing', X=16, Y=46)
nn += text('NNTitle', X=36, Y=52, W=308, H=24, ClipString=1, StringAlign='LeftCenter', FontWeight=700, FontSize=12.4, Text='')
nn += shape('NNProg', X=16, Y=72)
nn += '; the next two blocks, in their palette C colours\n'
nn += blk(1, 88) + blk(2, 122) + TOP

db = head('Day bar', "Medium (2x1): today's blocks on one bar from 7am to 11pm, where you are on it, and what's next.") + variables(
    'DayBar', 360, 170, 302, -32, 20, 590)
db += text('DBHead', X=16, Y=26, **{**HEAD, 'InlinePattern': '^\\S+ \\d+', 'InlinePattern2': '^\\S+ \\d+'})
db += '; sunrise and sunset over the bar\n'
db += text('DBSun', X=16, Y=46, FontSize=8.25, FontColor='#KfGold#', Text='[\\x2600]')
db += text('DBMoon', X=219, Y=46, FontSize=8.25, FontColor='#KfGold#', Text='[\\x263E]')
db += "; the track 7am-11pm, its blocks, the goal's gold underline and the now line (widget.lua draws them)\n"
db += shape('DBBar', X=16, Y=46)
for hr, x in ((8, 37), (12, 119), (16, 201), (20, 283)):
    db += text(f'DBH{hr}', X=x, Y=80, StringAlign='Center', FontSize=7.9, FontColor='#KfMuted#', Text=f"{hr % 12 or 12}{'am' if hr < 12 else 'pm'}")
db += blk(1, 102) + TOP

goal = head('Goal', "Small (1x1): the goal of the day, tickable. Its cherry opens into bloom when it's done.") + variables(
    'Goal', 170, 170, 114, -30, 20, 780)
goal += shape('GoalCard', X=14, Y=22, **HOVER)
goal += sec('GoalTape', Meter='Image', ImageName='#@#KaisFlow\\tape.png', X=60, Y=14, Group='Content')
goal += text('GoalStamp', X=26, Y=34, W=118, ClipString=1, FontFace='#Mono#', FontSize=7.1, FontColor='#KfGold#',
             InlineSetting='CharacterSpacing | 0 | 1 | 0', Text='')
goal += text('GoalTitle', X=26, Y=52, W=118, H=74, ClipString=2, FontFace='#Serif#', FontWeight=600, FontSize=11.6, Text='')
goal += sec('GoalCb', Meter='Shape', MeterStyle='sRowCb', X=26, Y=127, Hidden=0)
goal += text('GoalWhen', X=51, Y=135, W=93, ClipString=1, StringAlign='LeftCenter', FontSize=9, FontColor='#KfMuted#', Text='')
goal += TOP

nx = head('Next', 'Small (1x1): the next block, when it starts, and the one after.') + variables('Next', 170, 170, 114, -30, 210, 780)
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
