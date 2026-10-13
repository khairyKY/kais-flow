// Every page the site builds, in sitemap order.
import { home } from './home.mjs'
import { ar } from './ar.mjs'
import { featurePages } from './features.mjs'
import { paper } from './paper.mjs'
import { morePages } from './more.mjs'
import { guidePages } from './guides.mjs'
import { infoPages } from './info.mjs'
import { ARABIC } from '../data.mjs'

export const pages = [home, ...(ARABIC ? [ar] : []), ...featurePages, paper, ...morePages, ...guidePages, ...infoPages]
