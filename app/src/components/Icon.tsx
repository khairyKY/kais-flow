import type { SVGProps } from 'react'
import { ICON_SVGS, type IconName } from './icons/kf'

// One { __html } per glyph, made once. React 19 compares this prop by identity and re-writes innerHTML
// whenever the object is new, so a re-render (a hover or focus label on the sidebar's rail) swapped the
// glyph's nodes between mousedown and mouseup, and a press on the icon never became a click.
const HTML: Record<string, { __html: string }> = Object.fromEntries(Object.entries(ICON_SVGS).map(([k, v]) => [k, { __html: v }]))

type IconProps = Omit<SVGProps<SVGSVGElement>, 'name'> & {
  name: IconName
  size?: number
  /** Names the glyph for screen readers. Without it the icon is decorative (aria-hidden). */
  label?: string
}

/** One kf-* glyph, inline, stroked in currentColor — `<Icon name="today" size={24} />`. */
export function Icon({ name, size = 24, label, style, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={{ flex: 'none', display: 'block', ...style }}
      {...rest}
      // Our own checked-in SVG files, never user content.
      dangerouslySetInnerHTML={HTML[name]}
    />
  )
}
