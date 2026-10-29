-- kaisflow.lua -- Kai's Flow's Widget feed for Rainmeter skins (Lua 5.1, Rainmeter's).
-- The real Glass skins load it the same way: put this file in @Resources and
--   local K = dofile(SKIN:GetVariable('@') .. 'kaisflow.lua')
-- The feed's shape is documented in docs/log/2026-10-29-*-widget-feed-handoff.md.
--
--   K.link(raw)            the Widget link from what was pasted (the whole link, or junk around it) or nil
--   K.parse(body)          the feed table, or nil + 'unauthorized' | 'read_only' | 'rate_limited' | 'not_open' | 'bad_json' | ...
--   K.rgb(hex)             '#B59CE3' -> '181,156,227' (a Rainmeter colour)
--   K.tickCommand(link, id) the curl.exe arguments that tick a task off (a link with "Allow ticking"),
--                          for the RunCommand plugin: Program=curl.exe, Parameter=<this>
-- JSON null reads as nil, so `feed.goal == nil` means no goal today.
local K = {}

-- ---------------------------------------------------------------- a small JSON reader
local decode

local function skip(s, i)
  local _, e = s:find('^[ \n\r\t]*', i)
  return e + 1
end

local ESC = { ['"'] = '"', ['\\'] = '\\', ['/'] = '/', b = '\b', f = '\f', n = '\n', r = '\r', t = '\t' }

-- A \uXXXX code point as UTF-8 (surrogate pairs joined).
local function utf8char(c)
  if c < 0x80 then return string.char(c) end
  if c < 0x800 then return string.char(0xC0 + math.floor(c / 0x40), 0x80 + c % 0x40) end
  if c < 0x10000 then return string.char(0xE0 + math.floor(c / 0x1000), 0x80 + math.floor(c / 0x40) % 0x40, 0x80 + c % 0x40) end
  return string.char(0xF0 + math.floor(c / 0x40000), 0x80 + math.floor(c / 0x1000) % 0x40, 0x80 + math.floor(c / 0x40) % 0x40, 0x80 + c % 0x40)
end

local function str(s, i) -- s:sub(i, i) == '"'
  local out, j = {}, i + 1
  while true do
    local c = s:sub(j, j)
    if c == '' then error('unterminated string') end
    if c == '"' then return table.concat(out), j + 1 end
    if c == '\\' then
      local n = s:sub(j + 1, j + 1)
      if n == 'u' then
        local cp = tonumber(s:sub(j + 2, j + 5), 16) or 63
        j = j + 6
        if cp >= 0xD800 and cp < 0xDC00 and s:sub(j, j + 1) == '\\u' then
          local lo = tonumber(s:sub(j + 2, j + 5), 16) or 0
          cp, j = 0x10000 + (cp - 0xD800) * 0x400 + (lo - 0xDC00), j + 6
        end
        out[#out + 1] = utf8char(cp)
      else
        out[#out + 1] = ESC[n] or n
        j = j + 2
      end
    else
      local k = s:find('["\\]', j) or (#s + 1)
      out[#out + 1] = s:sub(j, k - 1)
      j = k
    end
  end
end

decode = function(s, i)
  i = skip(s, i)
  local c = s:sub(i, i)
  if c == '{' then
    local t = {}
    i = skip(s, i + 1)
    if s:sub(i, i) == '}' then return t, i + 1 end
    while true do
      local k
      k, i = str(s, skip(s, i))
      i = skip(s, i)
      if s:sub(i, i) ~= ':' then error('expected :') end
      t[k], i = decode(s, i + 1)
      i = skip(s, i)
      c = s:sub(i, i)
      if c == '}' then return t, i + 1 end
      if c ~= ',' then error('expected , or }') end
      i = i + 1
    end
  elseif c == '[' then
    local t, n = {}, 0
    i = skip(s, i + 1)
    if s:sub(i, i) == ']' then return t, i + 1 end
    while true do
      n = n + 1
      t[n], i = decode(s, i)
      i = skip(s, i)
      c = s:sub(i, i)
      if c == ']' then return t, i + 1 end
      if c ~= ',' then error('expected , or ]') end
      i = i + 1
    end
  elseif c == '"' then
    return str(s, i)
  elseif s:sub(i, i + 3) == 'true' then
    return true, i + 4
  elseif s:sub(i, i + 4) == 'false' then
    return false, i + 5
  elseif s:sub(i, i + 3) == 'null' then
    return nil, i + 4
  end
  local num = s:match('^-?%d+%.?%d*[eE]?[-+]?%d*', i)
  if not num or num == '' then error('unexpected ' .. c) end
  return tonumber(num), i + #num
end

function K.decode(s)
  local ok, v = pcall(decode, s or '', 1)
  if ok then return v end
  return nil, v
end

-- ---------------------------------------------------------------- the feed

-- The link from whatever was pasted: the whole https://.../functions/v1/widget?t=kf_w_... link.
function K.link(raw)
  return (raw or ''):match('(https://[%w%.%-]+/functions/v1/widget%?t=kf_w_[%w_%-]+)')
end

function K.parse(body)
  local t, err = K.decode(body)
  if type(t) ~= 'table' then return nil, 'bad_json', err end
  if t.error then return nil, t.error end
  if t.v ~= 1 then return nil, 'bad_json', 'unknown version' end
  t.top3, t.tasks, t.next_blocks, t.day = t.top3 or {}, t.tasks or {}, t.next_blocks or {}, t.day or {}
  return t
end

function K.rgb(hex)
  local r, g, b = (hex or ''):match('^#(%x%x)(%x%x)(%x%x)$')
  if not r then return '255,255,255' end
  return tonumber(r, 16) .. ',' .. tonumber(g, 16) .. ',' .. tonumber(b, 16)
end

-- curl.exe ships with Windows 10 and 11. -f: an HTTP error (403 read_only, 409 not open) is a failure.
function K.tickCommand(link, id)
  return '-s -f -X POST "' .. link .. '&tick=' .. id .. '"'
end

return K
