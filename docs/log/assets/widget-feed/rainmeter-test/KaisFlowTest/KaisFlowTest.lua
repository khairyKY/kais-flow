-- The test skin's script: fetch -> kaisflow.lua -> one plain text meter.
local K

function Initialize()
  K = dofile(SKIN:GetVariable('CURRENTPATH') .. 'kaisflow.lua')
  if K.link(SKIN:GetVariable('Link')) then
    SKIN:Bang('!EnableMeasure', 'MeasureFeed')
  else
    show('Paste your Widget link into Link= in KaisFlowTest.ini')
  end
end

function show(text)
  SKIN:Bang('!SetOption', 'MeterText', 'Text', text)
  SKIN:Bang('!UpdateMeter', 'MeterText')
  SKIN:Bang('!Redraw')
end

function Offline()
  show('Offline -- trying again in a minute')
end

function Parse()
  local body = SKIN:GetMeasure('MeasureFeed'):GetStringValue()
  local f, err = K.parse(body)
  if not f then
    show(err == 'unauthorized' and 'This link was revoked or mistyped -- make a new one in Settings' or ('Feed error: ' .. tostring(err)))
    return
  end
  local lines = { 'Goal: ' .. (f.goal and f.goal.title or '(none yet)') }
  local b = f.now_block or f.next_blocks[1]
  lines[#lines + 1] = b and ((f.now_block and 'Now: ' or 'Next: ') .. b.start_hm .. '-' .. b.end_hm .. ' ' .. b.title) or 'Next: nothing else today'
  for n = 1, math.min(3, #f.tasks) do lines[#lines + 1] = '- ' .. f.tasks[n].title end
  lines[#lines + 1] = string.format('%d of %d done (%d%%) - %s', f.done, f.total, math.floor(f.progress * 100 + 0.5), f.plant)
  show(table.concat(lines, '#CRLF#'))
end
