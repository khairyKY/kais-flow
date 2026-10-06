// The Arabic home (RTL). Copy from Kai's Arabic design (13b-12), with two lines corrected to match
// the app as it is today (Google Calendar isn't connected yet; People keeps notes, not promises).
// The app screens stay in English and left-to-right until the app itself is translated.
import { img, screen, btn, head2, icon, soon } from '../lib.mjs'
import { APP_URL } from '../data.mjs'

const FEATURES = [
  ['mic', 't-terra', 'التقاط بلمستين', 'قلها أو اكتبها، فتصل ومعها الموعد.'],
  ['calendar', 't-lav', 'تقويمك، بفترات زمنية', 'اسحب المهام إلى اليوم، بخطوات من ١٥ دقيقة. مزامنة تقويم Google قادمة.'],
  ['routine', 't-sage', 'عادات وسلاسل', 'عادات يومية صغيرة، وسلسلة تسامحك على يوم فائت.'],
  ['star', 't-terra', 'أهم ثلاث', 'ثلاثة أشياء تجعل اليوم جيدًا، وأحدها هو الهدف.'],
  ['journal', 't-butter', 'اليوميات والمعشبة', 'دوّن يومك. المشاريع المنتهية تُكبس كالزهور.'],
  ['people', 't-blossom', 'الأشخاص', 'أعياد الميلاد، وآخر مرة تحدثتما، وملاحظات عن كل شخص.'],
  ['download', 't-hyd', 'انقل قوائمك', 'استورد من Todoist وTickTick وNotion وObsidian وAkiflow.'],
  ['notebook', 't-butter', 'صفحة الدفتر والالتقاط الورقي', 'انسخ يومك إلى دفترك، ثم صوّره ليعود مهامّ.', true],
]
const DAY = [
  ['plan', '١', 'الصباح · نحو ٣ دقائق', 'خطّط ليومي', 'اختر أهم ثلاث مهام، وامنحها وقتًا في التقويم، ودع الباقي ينتظر.', 'sage', 'شاشة خطّط ليومي على الهاتف'],
  ['today', '٢', 'طوال اليوم', 'اليوم', 'صفحة واحدة: ما تفعله الآن، وما يليه، وما يمكن أن ينتظر.', 'gold', 'شاشة اليوم على الهاتف'],
  ['shutdown', '٣', 'المساء', 'إنهاء اليوم', 'علّم ما أنجزته، وانقل ما لم تُنجزه، وأغلق الحديقة لليلة.', 'blossom', 'شاشة إنهاء اليوم على الهاتف'],
]

export const ar = {
  path: '/ar/',
  lang: 'ar',
  alternates: true,
  title: 'Kai’s Flow — أيامك، مُخطَّطة في مكان واحد هادئ',
  description: 'مخطِّط مجاني يشبه سجلًّا ميدانيًا: المهام والفترات الزمنية والعادات ويومياتك على صفحة واحدة. الويب وأندرويد وويندوز. بلا إعلانات ولا تتبّع.',
  og: 'ar',
  body: `<section class="wrap hero">
  ${img('wisteria-p100', 'عنقود من زهر الوستارية', { w: 150, cls: 'hero-wisteria', eager: true })}
  <div class="hero-copy">
    <span class="eyebrow faint">سجلّ ميداني للأيام</span>
    <h1>أيامك، مُخطَّطة في مكان واحد هادئ.</h1>
    <p class="sub">المهام، والفترات الزمنية، والعادات، ويومياتك على صفحة ورق واحدة. خطّط صباحًا، واعتنِ بيومك، وأغلقه ليلًا.</p>
    <div class="btns">${btn('افتح التطبيق', APP_URL, { size: 'lg' })}${btn('تنزيل', '/download/', { kind: 'secondary', size: 'lg', attrs: 'hreflang="en"' })}</div>
    <p class="hero-note">مجاني · الويب، أندرويد، ويندوز</p>
  </div>
  <div class="hero-mock">
    ${screen('calendar-week', 'تقويم الأسبوع على الحاسوب، بفترات زمنية ملوّنة')}
    ${screen('today', 'شاشة اليوم على الهاتف: ما تفعله الآن، وأهم ثلاث، وما يليها', { cls: 'phone' })}
  </div>
</section>
<section class="sec" id="how-it-works"><div class="wrap">
  ${head2({ eyebrow: 'كيف يعمل', title: 'يومٌ من أوّله إلى آخره', lead: 'بُني Kai’s Flow حول ثلاث لحظات صغيرة، وكل ما عداها يبقى بعيدًا عن طريقك.' })}
  <div class="day3">${DAY.map(([s, n, when, title, line, tone, label]) => `<div><div style="position:relative"><span class="tape ${tone}" style="--r:-3deg" aria-hidden="true"></span><div class="frame">${screen(s, label)}</div></div>
    <div class="day3-t"><span class="num" aria-hidden="true">${n}</span><div><span class="eyebrow faint">${when}</span><h3>${title}</h3></div></div><p>${line}</p></div>`).join('')}</div>
</div></section>
<section class="sec" id="features"><div class="wrap">
  ${head2({ eyebrow: 'ما في الداخل', title: 'كل ما يحتاجه اليوم، ولا شيء غيره' })}
  <div class="fgrid">${FEATURES.map(([ic, tone, t, l, isSoon]) => `<div class="fcell"><span class="dot ${tone}">${icon(ic)}</span><div class="fcell-t"><h3>${t}</h3>${isSoon ? soon('قريبًا') : ''}</div><p>${l}</p></div>`).join('')}</div>
</div></section>
<section class="sec tint"><div class="wrap free">
  ${img('cherry-bloom', 'زهرة كرز', { w: 130 })}
  <h2><span lang="en" dir="ltr">Kai’s Flow</span> مجاني.</h2>
  <p>بلا تجربة، ولا باقات، ولا بطاقة. مشروع صغير صنعه شخص واحد احتاجه، وسيبقى مجانيًا.</p>
  <p style="font-size:15px"><a href="/" hreflang="en" lang="en">Read the rest in English →</a></p>
</div></section>`,
}
