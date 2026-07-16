import { useState, useEffect } from 'react'
import { captureWithAI } from './api'
import { useToastStore } from '../../lib/toastStore'
import { VoiceCaptureSheet } from './VoiceCaptureSheet'
import './capture.css'

export function QuickCapturePage() {
  // Option 1a & 1b Typing State
  const [typedText, setTypedText] = useState('ask the print shop about riso for the postcards')
  const [micSheetOpen, setMicSheetOpen] = useState(false)

  // Option 1c Share Sheet Pill State
  const [shareSaved, setShareSaved] = useState(false)
  const [sharingTitle, setSharingTitle] = useState('Risograph printing, explained')
  const [sharingUrl, setSharingUrl] = useState('stackmagazines.com')

  // Timer for share confirmation pill
  useEffect(() => {
    if (shareSaved) {
      const t = setTimeout(() => setShareSaved(false), 3000)
      return () => clearTimeout(t)
    }
  }, [shareSaved])

  async function handleSendTyped() {
    const trimmed = typedText.trim()
    if (!trimmed) return
    try {
      await captureWithAI(trimmed, 'text')
      useToastStore.getState().push({ message: `Captured: "${trimmed}"` })
      setTypedText('')
    } catch {
      useToastStore.getState().push({ message: 'Capture failed' })
    }
  }

  async function handleShareTarget() {
    const trimmedTitle = sharingTitle.trim()
    const trimmedUrl = sharingUrl.trim()
    const textToCapture = `${trimmedTitle}\n${trimmedUrl}`
    try {
      await captureWithAI(textToCapture, 'text')
      setShareSaved(true)
    } catch {
      useToastStore.getState().push({ message: 'Share capture failed' })
    }
  }

  // Keyboard typing helpers
  const handleKeyClick = (char: string) => {
    setTypedText((prev) => prev + char)
  }

  const handleBackspace = () => {
    setTypedText((prev) => prev.slice(0, -1))
  }

  return (
    <div style={{ padding: '24px 0 36px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 24px' }}>
        <span
          style={{
            font: '600 10px var(--font-mono)',
            padding: '4px 8px',
            background: '#2a2420',
            color: '#F4F1EA',
            borderRadius: '4px',
            textDecoration: 'none',
            letterSpacing: '0.08em',
          }}
        >
          W8
        </span>
        <span style={{ font: '600 14px var(--font-ui)', color: '#2a2420' }}>
          Mobile quick-capture — catch thoughts without opening the app.
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '40px',
          alignItems: 'flex-start',
          justifyContent: 'center',
        }}
      >
        {/* ===================== 1A — LOCK SCREEN WIDGET ===================== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              font: '400 12px var(--font-mono)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#6b6455',
            }}
          >
            <span
              style={{
                font: '600 10.5px var(--font-mono)',
                padding: '3px 8px',
                background: 'rgba(42,36,32,0.1)',
                color: '#2a2420',
                borderRadius: '5px',
                letterSpacing: '0.06em',
              }}
            >
              1a
            </span>
            Lock screen — widget at rest
          </div>

          <div className="kf-phone-bezel">
            <div className="kf-phone-island"></div>
            <div
              className="kf-phone-screen"
              style={{ background: 'linear-gradient(180deg,#3a3450 0%,#241f36 55%,#161221 100%)' }}
            >
              <div style={{ flex: 'none', padding: '80px 28px 0', textAlign: 'center' }}>
                <div style={{ fontSize: '15px', color: 'rgba(240,235,221,0.75)', fontWeight: 500 }}>
                  Friday, July 10
                </div>
                <div
                  style={{
                    fontSize: '78px',
                    fontWeight: 600,
                    color: '#f0ebdd',
                    lineHeight: 1,
                    letterSpacing: '-0.02em',
                    marginTop: '4px',
                  }}
                >
                  21:42
                </div>
              </div>

              <div style={{ flex: 'none', padding: '34px 28px 0' }}>
                {/* lock-screen widget */}
                <div
                  style={{
                    background: 'rgba(20,16,28,0.45)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(240,235,221,0.14)',
                    borderRadius: '22px',
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '8px',
                        background: 'rgba(122,148,110,0.3)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 'none',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24">
                        <path
                          d="M12 21c0-6 0-9 3.5-13"
                          fill="none"
                          stroke="#A8C09A"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                        <path d="M15.5 8c3-.4 4.6-2.2 5-5.2-3 .4-4.8 1.6-5.4 4.4" fill="#A8C09A" />
                        <path d="M12 14c-2.2-2.4-5-2.7-7.6-1.3 1.6 2.7 3.9 3.7 6.7 3" fill="#A8C09A" />
                      </svg>
                    </span>

                    <div
                      style={{
                        flex: 1,
                        background: 'rgba(240,235,221,0.1)',
                        border: '1px solid rgba(240,235,221,0.14)',
                        borderRadius: '999px',
                        padding: '9px 14px',
                        fontSize: '13.5px',
                        color: 'rgba(240,235,221,0.55)',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      Catch a thought…
                    </div>

                    <span
                      onClick={() => setMicSheetOpen(true)}
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '50%',
                        background: 'rgba(181,101,74,0.85)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <svg width="14" height="15" viewBox="0 0 24 24" fill="none">
                        <rect x="9" y="2.5" width="6" height="11.5" rx="3" fill="#F4F1EA"></rect>
                        <path
                          d="M5.5 11a6.5 6.5 0 0 0 13 0"
                          stroke="#F4F1EA"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        ></path>
                        <path
                          d="M12 17.5V21M8.5 21h7"
                          stroke="#F4F1EA"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        ></path>
                      </svg>
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ flex: 1 }}></div>

              <div style={{ flex: 'none', display: 'flex', justifyContent: 'space-between', padding: '0 44px 44px' }}>
                <span
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'rgba(240,235,221,0.12)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(240,235,221,0.8)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
                  </svg>
                </span>
                <span
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'rgba(240,235,221,0.12)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(240,235,221,0.8)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <circle cx="12" cy="12" r="3.4" />
                    <path d="M2 12h3M19 12h3M12 2v3M12 19v3" />
                  </svg>
                </span>
              </div>

              {/* Inline Voice Capture sheet overlay just for this phone chassis */}
              <VoiceCaptureSheet open={micSheetOpen} onClose={() => setMicSheetOpen(false)} />
            </div>
          </div>
        </div>

        {/* ===================== 1B — ACTIVATED STATE ===================== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              font: '400 12px var(--font-mono)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#6b6455',
            }}
          >
            <span
              style={{
                font: '600 10.5px var(--font-mono)',
                padding: '3px 8px',
                background: 'rgba(42,36,32,0.1)',
                color: '#2a2420',
                borderRadius: '5px',
                letterSpacing: '0.06em',
              }}
            >
              1b
            </span>
            Activated — input state
          </div>

          <div className="kf-phone-bezel">
            <div className="kf-phone-island"></div>
            <div
              className="kf-phone-screen"
              style={{ background: 'linear-gradient(180deg,#332c48 0%,#1d1830 100%)' }}
            >
              <div style={{ flex: 'none', padding: '70px 28px 0', textAlign: 'center' }}>
                <div style={{ fontSize: '34px', fontWeight: 600, color: 'rgba(240,235,221,0.85)', letterSpacing: '-0.01em' }}>
                  21:42
                </div>
              </div>

              <div style={{ flex: 'none', padding: '26px 24px 0' }}>
                <div
                  style={{
                    background: 'rgba(20,16,28,0.55)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(240,235,221,0.16)',
                    borderRadius: '22px',
                    padding: '16px 18px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '7px',
                        background: 'rgba(122,148,110,0.3)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 'none',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24">
                        <path
                          d="M12 21c0-6 0-9 3.5-13"
                          fill="none"
                          stroke="#A8C09A"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                        <path d="M15.5 8c3-.4 4.6-2.2 5-5.2-3 .4-4.8 1.6-5.4 4.4" fill="#A8C09A" />
                        <path d="M12 14c-2.2-2.4-5-2.7-7.6-1.3 1.6 2.7 3.9 3.7 6.7 3" fill="#A8C09A" />
                      </svg>
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '8.5px',
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        color: 'rgba(240,235,221,0.45)',
                      }}
                    >
                      Kai's Flow
                    </span>
                  </div>

                  <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column' }}>
                    <textarea
                      value={typedText}
                      onChange={(e) => setTypedText(e.target.value)}
                      placeholder="Type your thought..."
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        resize: 'none',
                        color: '#f0ebdd',
                        fontSize: '16px',
                        fontFamily: 'var(--font-ui)',
                        lineHeight: 1.5,
                        height: '68px',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                    <button
                      onClick={handleSendTyped}
                      disabled={!typedText.trim()}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '7px',
                        background: typedText.trim() ? 'rgba(181,101,74,0.9)' : 'rgba(181,101,74,0.4)',
                        border: 'none',
                        borderRadius: '999px',
                        padding: '8px 16px',
                        fontSize: '13px',
                        color: '#F4F1EA',
                        cursor: typedText.trim() ? 'pointer' : 'default',
                        fontFamily: 'inherit',
                      }}
                    >
                      → Inbox
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ flex: 1 }}></div>

              {/* OS Keyboard Simulation */}
              <div
                style={{
                  flex: 'none',
                  background: 'rgba(28,24,40,0.92)',
                  padding: '8px 4px 30px',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', padding: '3px 6px' }}>
                  {['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'].map((key) => (
                    <span
                      key={key}
                      onClick={() => handleKeyClick(key)}
                      style={{
                        flex: 1,
                        maxWidth: '34px',
                        height: '40px',
                        background: 'rgba(240,235,221,0.16)',
                        borderRadius: '5px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        color: '#f0ebdd',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      {key}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', padding: '3px 20px' }}>
                  {['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'].map((key) => (
                    <span
                      key={key}
                      onClick={() => handleKeyClick(key)}
                      style={{
                        flex: 1,
                        maxWidth: '34px',
                        height: '40px',
                        background: 'rgba(240,235,221,0.16)',
                        borderRadius: '5px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        color: '#f0ebdd',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      {key}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', padding: '3px 6px' }}>
                  <span
                    style={{
                      width: '44px',
                      height: '40px',
                      background: 'rgba(240,235,221,0.1)',
                      borderRadius: '5px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      color: '#f0ebdd',
                      userSelect: 'none',
                    }}
                  >
                    ⇧
                  </span>
                  {['z', 'x', 'c', 'v', 'b', 'n', 'm'].map((key) => (
                    <span
                      key={key}
                      onClick={() => handleKeyClick(key)}
                      style={{
                        flex: 1,
                        maxWidth: '34px',
                        height: '40px',
                        background: 'rgba(240,235,221,0.16)',
                        borderRadius: '5px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        color: '#f0ebdd',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      {key}
                    </span>
                  ))}
                  <span
                    onClick={handleBackspace}
                    style={{
                      width: '44px',
                      height: '40px',
                      background: 'rgba(240,235,221,0.1)',
                      borderRadius: '5px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      color: '#f0ebdd',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    ⌫
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', padding: '3px 6px' }}>
                  <span
                    onClick={() => handleKeyClick(' ')}
                    style={{
                      width: '200px',
                      height: '40px',
                      background: 'rgba(240,235,221,0.16)',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  ></span>
                  <span
                    onClick={handleSendTyped}
                    style={{
                      width: '70px',
                      height: '40px',
                      background: 'rgba(181,101,74,0.85)',
                      borderRadius: '5px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12.5px',
                      color: '#F4F1EA',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    send
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===================== 1C — SHARE SHEET ===================== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              font: '400 12px var(--font-mono)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#6b6455',
            }}
          >
            <span
              style={{
                font: '600 10.5px var(--font-mono)',
                padding: '3px 8px',
                background: 'rgba(42,36,32,0.1)',
                color: '#2a2420',
                borderRadius: '5px',
                letterSpacing: '0.06em',
              }}
            >
              1c
            </span>
            Share sheet simulation
          </div>

          <div className="kf-phone-bezel">
            <div className="kf-phone-island"></div>
            <div className="kf-phone-screen" style={{ background: '#3d3934' }}>
              {/* Web page behind the share sheet, dimmed */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'var(--paper-parchment)',
                  opacity: 0.5,
                }}
              >
                <div style={{ padding: '80px 26px 0' }}>
                  <div style={{ height: '14px', width: '70%', background: 'rgba(42,36,32,0.2)', borderRadius: '3px' }}></div>
                  <div
                    style={{
                      height: '10px',
                      width: '92%',
                      background: 'rgba(42,36,32,0.12)',
                      borderRadius: '3px',
                      marginTop: '14px',
                    }}
                  ></div>
                  <div
                    style={{
                      height: '10px',
                      width: '86%',
                      background: 'rgba(42,36,32,0.12)',
                      borderRadius: '3px',
                      marginTop: '8px',
                    }}
                  ></div>
                  <div
                    style={{
                      height: '120px',
                      width: '100%',
                      background: 'rgba(42,36,32,0.1)',
                      borderRadius: '8px',
                      marginTop: '16px',
                    }}
                  ></div>
                  <div
                    style={{
                      height: '10px',
                      width: '88%',
                      background: 'rgba(42,36,32,0.12)',
                      borderRadius: '3px',
                      marginTop: '16px',
                    }}
                  ></div>
                </div>
              </div>
              <span style={{ position: 'absolute', inset: 0, background: 'rgba(20,16,20,0.45)' }}></span>

              {/* sprout confirmation pill */}
              {shareSaved && (
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '120px',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '9px',
                    background: '#2a2420',
                    borderRadius: '999px',
                    padding: '10px 18px',
                    boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
                    zIndex: 20,
                    whiteSpace: 'nowrap',
                    animation: 'captureScrimFadeIn 180ms ease-out forwards',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24">
                    <path
                      d="M12 21c0-6 0-9 3.5-13"
                      fill="none"
                      stroke="#A8C09A"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    ></path>
                    <path d="M15.5 8c3-.4 4.6-2.2 5-5.2-3 .4-4.8 1.6-5.4 4.4" fill="#A8C09A"></path>
                    <path d="M12 14c-2.2-2.4-5-2.7-7.6-1.3 1.6 2.7 3.9 3.7 6.7 3" fill="#A8C09A"></path>
                  </svg>
                  <span style={{ fontSize: '13px', color: '#F4F1EA' }}>Saved to your inbox</span>
                </div>
              )}

              {/* share sheet panel */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(44,40,36,0.97)',
                  borderRadius: '24px 24px 0 0',
                  padding: '14px 20px 34px',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <div
                  style={{
                    width: '38px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'rgba(240,235,221,0.25)',
                    margin: '0 auto 14px',
                  }}
                ></div>
                
                {/* sharing content details */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    paddingBottom: '14px',
                    borderBottom: '1px solid rgba(240,235,221,0.1)',
                  }}
                >
                  <span
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '9px',
                      background: 'rgba(240,235,221,0.12)',
                      flex: 'none',
                    }}
                  ></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      value={sharingTitle}
                      onChange={(e) => setSharingTitle(e.target.value)}
                      style={{
                        fontSize: '13px',
                        color: '#f0ebdd',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    />
                    <input
                      value={sharingUrl}
                      onChange={(e) => setSharingUrl(e.target.value)}
                      style={{
                        fontSize: '11px',
                        color: 'rgba(240,235,221,0.45)',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        width: '100%',
                        marginTop: '2px',
                      }}
                    />
                  </div>
                </div>

                {/* share targets */}
                <div style={{ display: 'flex', gap: '18px', padding: '16px 4px 4px' }}>
                  <div style={{ textAlign: 'center', width: '64px', opacity: 0.6 }}>
                    <span
                      style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '13px',
                        background: 'rgba(240,235,221,0.14)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="rgba(240,235,221,0.8)"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      >
                        <path d="M8 12a4 4 0 0 1 4-4h5M14 5l3 3-3 3" />
                        <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
                      </svg>
                    </span>
                    <div style={{ fontSize: '10px', color: 'rgba(240,235,221,0.6)', marginTop: '6px' }}>
                      Messages
                    </div>
                  </div>

                  <div onClick={handleShareTarget} style={{ textAlign: 'center', width: '64px', cursor: 'pointer' }}>
                    <span
                      style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '13px',
                        background: 'linear-gradient(180deg,#EFE8D6,#E4DCC6)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 0 2px rgba(181,101,74,0.7)',
                      }}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24">
                        <path
                          d="M12 21c0-6 0-9 3.5-13"
                          fill="none"
                          stroke="#5a6b4e"
                          strokeWidth="1.9"
                          strokeLinecap="round"
                        ></path>
                        <path d="M15.5 8c3-.4 4.6-2.2 5-5.2-3 .4-4.8 1.6-5.4 4.4" fill="#7A946E"></path>
                        <path d="M12 14c-2.2-2.4-5-2.7-7.6-1.3 1.6 2.7 3.9 3.7 6.7 3" fill="#7A946E"></path>
                      </svg>
                    </span>
                    <div style={{ fontSize: '10px', color: '#f0ebdd', marginTop: '6px', fontWeight: 600 }}>
                      Kai's Flow
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', width: '64px', opacity: 0.6 }}>
                    <span
                      style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '13px',
                        background: 'rgba(240,235,221,0.14)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="rgba(240,235,221,0.8)"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      >
                        <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
                        <path d="M3.5 9h17" />
                      </svg>
                    </span>
                    <div style={{ fontSize: '10px', color: 'rgba(240,235,221,0.6)', marginTop: '6px' }}>Mail</div>
                  </div>

                  <div style={{ textAlign: 'center', width: '64px', opacity: 0.6 }}>
                    <span
                      style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '13px',
                        background: 'rgba(240,235,221,0.14)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="rgba(240,235,221,0.8)"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      >
                        <circle cx="12" cy="12" r="8.5" />
                        <path d="M12 8v8M8 12h8" />
                      </svg>
                    </span>
                    <div style={{ fontSize: '10px', color: 'rgba(240,235,221,0.6)', marginTop: '6px' }}>More</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p style={{ marginTop: '26px', font: '13px/1.6 var(--font-ui)', color: '#6b6455', textAlign: 'center' }}>
        The sprout glyph on the pill is the only garden element out here — lock screen and share sheet stay OS-native in feel. Everything captured this way lands in the Inbox via the same endpoint.
      </p>
    </div>
  )
}
