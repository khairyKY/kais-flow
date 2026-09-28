import type { SVGProps } from 'react'
import { ICON_SVGS, type IconName } from './icons/kf'

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
      dangerouslySetInnerHTML={{ __html: ICON_SVGS[name] }}
    />
  )
}
