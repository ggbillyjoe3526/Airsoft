// Menu and UI redesign concept: one screen per ?screen=, laid out at 1920 x 1080 for screenshots.
import { I } from './icons.js';

const T = (n) => `thumbs/${n}.png`;
const BG = new Set(['map', 'overview', 'woodland', 'neon', 'woodland-ingame', 'arms', 'characters', 'robots', 'schemes', 'schemes-real']);
const M = (n) => (n.startsWith('ultra-') && BG.has(n.slice(6)) ? `maps/bg-${n.slice(6)}.jpg` : `maps/${n}.jpg`);
const A = (n) => `avatars/${n}.jpg`;
const q = new URLSearchParams(location.search);
const screen = q.get('screen') ?? 'title';
const app = document.getElementById('app');

const bg = (src, cls = '') => `<div class="bg ${cls}"><img src="${src}"></div><div class="grain"></div>`;
const NAV = [['play', 'Play', I.play], ['loadout', 'Loadout', I.rifle], ['armory', 'Armory', I.crate], ['range', 'Range', I.target], ['settings', 'Settings', I.sliders]];
const top = (on) => `<div class="top">
  <div class="mark"><i></i>Airsoft</div>
  <nav class="nav">${NAV.map(([id, l, ic]) => `<a class="${id === on ? 'on' : ''}">${ic}${l}</a>`).join('')}</nav>
  <div class="wallet"><span class="chip"><span class="dot"></span>2,480 FC</span><span class="chip"><span class="dot" style="background:var(--teal)"></span>3 Tokens</span><span class="ver">0.1 Dev 5</span></div>
</div>`;
const hints = (h, right = '') => `<div class="hints">${h.map(([k, l]) => `<span><kbd>${k}</kbd>${l}</span>`).join('')}<span class="r">${right}</span></div>`;
const sec = (n, title, extra = '') => `<div class="sec"><span class="n">${n}</span><span class="h2">${title}</span><span class="rule"></span>${extra}</div>`;
const seg = (opts, on, style = '') => `<div class="seg" style="${style}">${opts.map((o) => {
  const [l, sub, dev] = Array.isArray(o) ? o : [o];
  return `<span class="${l === on ? 'on' : ''} ${dev ? 'dev' : ''}">${l}${sub ? `<small>${sub}</small>` : ''}</span>`;
}).join('')}</div>`;
const cost = (n) => `<span class="cost">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
const abs = (x, y, w, h, inner, cls = '', style = '') => `<div class="${cls}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;${h ? `height:${h}px;` : ''}${style}">${inner}</div>`;

const screens = {};

// ---- Title ---------------------------------------------------------------------------------------------------------
screens.title = () => `${bg(M('ultra-map'))}
<div class="screen">
  <div class="wallet" style="position:absolute;right:48px;top:30px"><span class="chip"><span class="dot"></span>2,480 FC</span><span class="chip"><span class="dot" style="background:var(--teal)"></span>3 Tokens</span></div>
  ${abs(120, 150, 900, 0, `
    <div class="k" style="font-size:18px;color:var(--orange-2)">// 0.1 Dev 5 &nbsp;·&nbsp; Single player against bots</div>
    <div style="display:flex;align-items:center;gap:26px;margin-top:10px">
      <i style="width:120px;height:150px;background:var(--orange);clip-path:polygon(34% 0,100% 0,66% 100%,0 100%)"></i>
      <div style="font:800 italic 196px/0.86 'Barlow Condensed';letter-spacing:0.01em;text-transform:uppercase">Airsoft</div>
    </div>
    <div style="font:600 30px/1.2 'Barlow';margin-top:22px;color:#e4ebfb">Call your hit. Walk it off. Go again.</div>`)}
  ${abs(120, 520, 560, 0, `
    <div class="btn primary big" style="width:100%;justify-content:space-between">Play ${I.arrowR}</div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px">
      ${[['Tutorial', I.info, '<span class="tagpill">New? Start here</span>'], ['Practice range', I.target, ''], ['Loadout', I.rifle, ''], ['Armory', I.crate, '<span class="tagpill o">3 Tokens to spend</span>'], ['Settings', I.sliders, '']].map(([l, ic, t]) =>
      `<div class="btn" style="width:100%;height:58px;justify-content:flex-start;font-size:24px;background:rgba(16,26,53,.88)">${ic}${l}<span style="margin-left:auto">${t}</span></div>`).join('')}
    </div>`)}
  ${abs(1300, 640, 520, 0, `
    <div class="panel cut" style="padding:22px">
      <div class="k">Your next match</div>
      <div style="display:flex;gap:18px;margin-top:12px;align-items:center">
        <div class="pic" style="width:200px;height:112px"><img src="${M('ultra-map')}"></div>
        <div><div class="h3" style="font-size:28px">Depot · Day</div><div class="muted" style="margin-top:4px">Elimination · 3v3 · Normal</div><div class="muted">First to 5 rounds</div></div>
      </div>
      <div class="k" style="margin-top:18px">Your kit</div>
      <div style="display:flex;gap:12px;margin-top:10px">
        <div class="pic contain" style="width:230px;height:118px"><img src="${T('aeg-kit')}"><div class="cap"><b class="d">AEG Rifle</b></div></div>
        <div class="pic contain" style="width:230px;height:118px"><img src="${T('pistol')}"><div class="cap"><b class="d">Gas Pistol</b></div></div>
      </div>
    </div>`)}
  ${abs(1300, 560, 520, 0, `<div class="panel" style="padding:14px 18px;display:flex;gap:14px;align-items:center;border-left:4px solid var(--acid)"><span style="color:var(--acid);width:26px">${I.hand}</span><span>Tip: when a BB hits you, your hand goes up and you walk off. Bots do the same.</span></div>`)}
  ${hints([['Enter', 'Play'], ['T', 'Tutorial'], ['Esc', 'Settings']], 'Completely free: nothing is ever sold')}
</div>`;

// ---- Play (new game) -----------------------------------------------------------------------------------------------
const mapCard = (src, name, sub, on, tag, day) => `<div class="pic ${on ? 'on' : ''}" style="width:424px;height:250px">
  <img src="${src}">
  <div class="corner">${tag ? `<span class="tagpill dev">${tag}</span>` : ''}${day ? `<div class="seg" style="gap:4px"><span class="${day === 'day' ? 'on' : ''}" style="height:38px;width:80px;flex-direction:row;gap:6px;font-size:17px;background:rgba(7,13,31,.85)"><i style="width:18px;display:inline-block">${I.sun}</i>Day</span><span class="${day === 'night' ? 'on' : ''}" style="height:38px;width:90px;flex-direction:row;gap:6px;font-size:17px;background:rgba(7,13,31,.85)"><i style="width:16px;display:inline-block">${I.moon}</i>Night</span></div>` : ''}</div>
  ${on ? `<div class="tick">${I.check}</div>` : ''}
  <div class="cap" style="display:flex;align-items:flex-end;justify-content:space-between">
    <div><div class="h3" style="font-size:30px">${name}</div><div class="muted" style="font-size:16px">${sub}</div></div>
    ${day ? '' : '<span class="tagpill b">Night</span>'}
  </div></div>`;
const modeCard = (src, pos, icon, name, blurb, on, tag) => `<div class="panel ${on ? 'pic on' : ''}" style="width:424px;height:150px;display:flex;overflow:hidden;position:relative;${on ? '' : ''}">
  <div style="width:150px;height:100%;position:relative;flex:none;overflow:hidden"><img src="${src}" style="width:100%;height:100%;object-fit:cover;object-position:${pos}">
    <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,13,31,.1),rgba(12,20,42,.95))"></div>
    <div style="position:absolute;left:18px;top:18px;width:48px;height:48px;color:${on ? 'var(--orange-2)' : '#fff'}">${icon}</div></div>
  <div style="padding:18px 18px 0 6px"><div style="display:flex;gap:10px;align-items:center"><div class="h3" style="font-size:27px">${name}</div>${tag ? `<span class="tagpill dev">${tag}</span>` : ''}</div>
    <div class="muted" style="font-size:17px;margin-top:6px;line-height:1.35">${blurb}</div></div>
  ${on ? `<div class="tick" style="position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:50%;background:var(--orange);display:grid;place-items:center"><i style="width:18px;display:block">${I.check}</i></div>` : ''}
</div>`;
const row = (label, control, w = 630) => `<div style="width:${w}px"><div class="k" style="margin-bottom:8px;color:var(--muted)">${label}</div>${control}</div>`;
screens.play = () => `${bg(M('ultra-map'), 'blur even')}
<div class="screen">${top('play')}
  ${abs(48, 112, 1312, 0, `
    ${sec('01', 'Map')}
    <div style="display:flex;gap:20px">
      ${mapCard(M('ultra-map'), 'Depot', 'Container yard · close quarters', true, '', 'day')}
      ${mapCard(M('ultra-woodland'), 'Woodland', 'Forest field · long sightlines', false, 'Dev')}
      ${mapCard(M('ultra-neon'), 'Neon Heights', 'City streets · tight alleys', false, 'Dev')}
    </div>
    <div style="height:22px"></div>
    ${sec('02', 'Mode')}
    <div style="display:flex;gap:20px">
      ${modeCard(M('clean-ingame'), '60% 40%', I.elim, 'Elimination', 'Last team with someone in play wins the round.', true)}
      ${modeCard(M('ultra-overview'), '45% 50%', I.flag, 'Attack and Defend', 'Raise your flag on the other team’s pole, or keep yours down.', false)}
      ${modeCard(M('ultra-woodland-ingame'), '50% 50%', I.exit, 'Extraction', 'Get in, grab what you can and get out before the whistle.', false, 'Dev')}
    </div>
    <div style="height:22px"></div>
    ${sec('03', 'Match', '<span class="muted" style="font-size:16px">Pick a set of rules, or change any row for a Custom match</span>')}
    ${seg([['Skirmish', 'Quick and friendly'], ['Tournament', 'Strict site rules'], ['Pro CQB', 'Hard and fast', 1], ['Custom', 'Your own rules']], 'Skirmish')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 52px;margin-top:16px">
      ${row('Rounds to win', seg(['3', '5', '7', '10'], '5'))}
      ${row('Team size', seg(['1v1', '2v2', '3v3', ['4v4', '', 1], ['5v5', '', 1]], '3v3'))}
      ${row('Opponents', seg(['Easy', 'Normal', 'Hard', ['Pro', '', 1]], 'Normal'))}
      ${row('Teammates', seg(['Easy', 'Normal', 'Hard', ['Pro', '', 1]], 'Normal'))}
    </div>`)}
  ${abs(1392, 112, 480, 900, `<div class="panel cut" style="height:100%;padding:24px;display:flex;flex-direction:column">
    <div class="k">Your match</div>
    <div class="pic brackets" style="width:430px;height:242px;margin-top:12px"><img src="${M('ultra-map')}"></div>
    <div class="h2" style="margin-top:16px;font-size:34px">Depot · Day</div>
    <div style="margin-top:10px;display:grid;grid-template-columns:120px 1fr;gap:6px 10px;font-size:18px">
      <span class="k" style="font-size:15px;padding-top:3px">Mode</span><span>Elimination</span>
      <span class="k" style="font-size:15px;padding-top:3px">Rules</span><span>Skirmish · first to 5</span>
      <span class="k" style="font-size:15px;padding-top:3px">Teams</span><span>3v3 · Normal bots</span>
    </div>
    <div class="k" style="margin-top:20px">Loadout <span style="float:right;color:var(--orange-2)">Change</span></div>
    <div style="display:flex;gap:10px;margin-top:10px">
      <div class="pic contain r-rare" style="width:210px;height:124px"><img src="${T('aeg-kit')}"><div class="rar"></div><div class="cap" style="padding-bottom:10px"><b class="d" style="font-size:18px">AEG Rifle</b></div></div>
      <div class="pic contain r-uncommon" style="width:210px;height:124px"><img src="${T('pistol')}"><div class="rar"></div><div class="cap" style="padding-bottom:10px"><b class="d" style="font-size:18px">Gas Pistol</b></div></div>
    </div>
    <div class="panel" style="margin-top:18px;padding:14px 16px;display:flex;gap:12px;align-items:flex-start;border-left:4px solid var(--acid)"><i style="width:24px;flex:none;color:var(--acid)">${I.elim}</i><span style="font-size:17px">One hit and you’re out. Last team with someone in play wins the round.</span></div>
    <div style="margin-top:14px;display:flex;gap:10px;align-items:center;color:var(--muted);font-size:17px"><span class="dot" style="width:10px;height:10px;border-radius:50%;background:var(--yellow);display:inline-block"></span>Pays Field Credits: more for a win</div>
    <div style="margin-top:auto"><div class="btn primary big" style="width:100%;justify-content:space-between">Play ${I.arrowR}</div></div>
  </div>`)}
  ${hints([['Esc', 'Back'], ['Enter', 'Play'], ['Tab', 'Next section']], 'Dev items show only with Dev content on')}
</div>`;

// ---- Loadout -------------------------------------------------------------------------------------------------------
const partChip = (src, name) => `<div style="display:flex;align-items:center;gap:8px;background:rgba(5,14,36,.75);border:1px solid var(--line);padding:4px 12px 4px 4px">
  <div class="pic contain" style="width:58px;height:38px;border:0"><img src="${T(src)}"></div><span style="font-size:16px">${name}</span></div>`;
const owned = (src, name, tier, tierCls, opts = {}) => `<div class="pic contain ${tierCls} ${opts.on ? 'on' : ''}" style="width:204px;height:176px;${opts.locked ? 'opacity:.5' : ''}">
  <img src="${T(src)}" style="height:128px;${opts.locked ? 'filter:grayscale(1) brightness(.45)' : ''}">${opts.locked ? `<i style="position:absolute;left:50%;top:44px;width:34px;margin-left:-17px;color:var(--muted)">${I.lock}</i>` : ''}
  ${opts.on ? `<div class="tick">${I.check}</div>` : ''}${opts.chase ? '<div class="corner"><span class="tagpill" style="color:var(--yellow);border-color:rgba(255,194,26,.5);background:rgba(255,194,26,.14)">Chase</span></div>' : ''}
  <div style="position:absolute;left:12px;bottom:12px;right:12px"><b class="d" style="font-size:19px;display:block">${name}</b><span class="rtxt">${tier}</span></div>
  <div class="rar"></div></div>`;
const statRow = (label, value, pct, delta = 0, better = true) => `<div style="margin-bottom:15px">
  <div style="display:flex;justify-content:space-between;font-size:17px"><span class="muted">${label}</span><span><b>${value}</b>${delta ? ` <span style="color:${better ? 'var(--good)' : 'var(--bad)'};font-weight:700;font-size:15px">${delta}</span>` : ''}</span></div>
  <div class="bar" style="margin-top:6px"><i style="width:${pct}%"></i>${delta ? `<b class="${better ? '' : 'down'}" style="left:${pct}%;width:${better ? 6 : 5}%"></b>` : ''}</div></div>`;
screens.loadout = () => `${bg(M('ultra-arms'), 'blur even')}
<div class="screen">${top('loadout')}
  ${abs(48, 112, 712, 0, `
    ${sec('01', 'Carried')}
    <div class="panel cut r-rare" style="height:340px;position:relative;overflow:hidden">
      <img class="feather" src="${T('aeg-kit')}" style="position:absolute;left:190px;top:46px;width:500px;height:250px;object-fit:cover">
      <div style="position:absolute;left:24px;top:22px"><div class="k">Primary</div><div class="h2" style="font-size:38px;margin-top:4px">AEG Rifle</div><div><span class="rtxt">Rare</span> <span class="muted" style="font-size:16px">&nbsp;· Cobalt · #000002</span></div></div>
      <div style="position:absolute;right:22px;bottom:22px;height:50px;font-size:22px" class="btn primary">Customise</div>
      <div style="position:absolute;left:24px;bottom:22px;display:flex;gap:8px">${partChip('att-redDot', 'Red Dot')}${partChip('att-vertical', 'Vertical grip')}${partChip('att-torch', 'Torch')}</div>
      <div class="rar" style="height:5px"></div>
    </div>
    <div class="panel cut r-uncommon" style="height:250px;position:relative;overflow:hidden;margin-top:16px">
      <img class="feather" src="${T('pistol')}" style="position:absolute;left:330px;top:10px;width:370px;height:231px;object-fit:cover">
      <div style="position:absolute;left:24px;top:22px"><div class="k">Secondary</div><div class="h2" style="font-size:38px;margin-top:4px">Gas Pistol</div><div><span class="rtxt">Uncommon</span> <span class="muted" style="font-size:16px">&nbsp;· Ghost · #000001</span></div></div>
      <div style="position:absolute;left:24px;bottom:22px;display:flex;gap:8px">${partChip('att-laser', 'Red laser')}</div>
      <div class="rar" style="height:5px"></div>
    </div>
    <div class="panel" style="height:118px;margin-top:16px;display:flex;align-items:center;gap:22px;padding:0 24px;position:relative;overflow:hidden">
      <div class="stripes" style="position:absolute;left:0;top:0;bottom:0;width:8px"></div>
      <div style="width:44px;color:var(--dim)">${I.lock}</div>
      <div><div class="k">Grenades</div><div class="muted" style="font-size:18px;margin-top:4px">Grenades, smoke and flash bombs come in a later version.</div></div>
    </div>`)}
  ${abs(792, 112, 680, 0, `
    ${sec('02', 'Your replicas', seg(['All', 'Rifles', 'Pistols'], 'All', 'width:300px'))}
    <div style="display:grid;grid-template-columns:repeat(3,204px);gap:16px">
      ${owned('aeg-kit', 'AEG Rifle', 'Rare', 'r-rare', { on: 1 })}
      ${owned('scheme-hazard', 'AEG Rifle', 'Uncommon', 'r-uncommon')}
      ${owned('scheme-onyx', 'AEG Rifle', 'Common', 'r-common')}
      ${owned('pistol', 'Gas Pistol', 'Uncommon', 'r-uncommon', { on: 1 })}
      ${owned('pscheme-hazard', 'Gas Pistol', 'Common', 'r-common')}
      ${owned('cyber', 'Cyber Pistol', 'Legendary', 'r-legendary', { chase: 1 })}
      ${owned('aeg', 'AEG Rifle', 'Epic · not owned', 'r-epic', { locked: 1 })}
      ${owned('pistol', 'Gas Pistol', 'Very Rare · not owned', 'r-vrare', { locked: 1 })}
      ${owned('aeg', 'AEG Rifle', 'Legendary · not owned', 'r-legendary', { locked: 1 })}
    </div>
    <div class="muted" style="margin-top:16px;font-size:17px">Each copy has a rarity tier. Unlock more in the Armory, free for playing.</div>`)}
  ${abs(1472, 112, 400, 900, `<div class="panel cut" style="height:100%;padding:24px">
    <div class="k">Selected</div><div class="h2" style="margin-top:6px;font-size:32px">AEG Rifle</div><div><span class="rtxt r-rare">Rare</span><span class="muted" style="font-size:16px"> · as carried</span></div>
    <div style="height:22px"></div>
    ${statRow('Muzzle speed', '330 fps', 62)}
    ${statRow('Rate of fire', 'up to 15 / s', 70)}
    ${statRow('On target to', '38 m', 58, '+3 m')}
    ${statRow('Spread', '1.1°', 64)}
    ${statRow('Recoil', 'Light', 76, '−10%')}
    ${statRow('Reload', '2.1 s', 55)}
    ${statRow('Aim raise', '0.24 s', 60, '+0.03 s', false)}
    ${statRow('Shots heard from', '42 m', 48)}
    <div class="muted" style="font-size:15px;margin-top:14px">Green and red show changes against the replica as it comes. Example numbers for the concept.</div>
  </div>`)}
  ${hints([['Esc', 'Back'], ['Enter', 'Equip'], ['C', 'Customise'], ['Right-click', 'Customise']])}
</div>`;

// ---- Customise (attachments and colour) ----------------------------------------------------------------------------
const SLOTS = [
  ['Colour', 'Cobalt', 'swatch:#2f6dff'], ['Optic', 'Red Dot', 'att-redDot'], ['Grip', 'Vertical grip', 'att-vertical'], ['Laser', 'None', ''],
  ['Barrel', 'Standard', 'att-longBarrel:dim'], ['Muzzle', 'None', ''], ['Magazine', 'Its own, 300 BBs', 'att-hiCap:dim'], ['Light', 'Weapon Torch', 'att-torch', 'Dev'],
  ['Power', '9.6 V battery', ''], ['BB weight', '0.25 g', ''], ['Hop-up', 'Medium', ''], ['Glowing BBs', 'Off', ''],
];
const slotList = (on) => SLOTS.map(([n, v, p, tag]) => {
  const [src, mod] = p.split(':');
  const picture = src === 'swatch' ? `<div style="width:78px;height:48px;background:linear-gradient(135deg,${mod} 0 55%,#15161c 55%);border:1px solid var(--line)"></div>`
    : src ? `<div class="pic contain" style="width:78px;height:48px;${mod ? 'opacity:.6' : ''}"><img src="${T(src)}"></div>`
      : `<div style="width:78px;height:48px;border:1px dashed var(--line-2);display:grid;place-items:center;color:var(--dim);font-size:22px">–</div>`;
  return `<div style="display:flex;align-items:center;gap:14px;height:64px;padding:0 14px 0 8px;margin-bottom:4px;background:${n === on ? 'rgba(255,107,26,.16)' : 'var(--panel)'};border:1px solid ${n === on ? 'var(--orange)' : 'var(--line)'};${n === on ? 'box-shadow:4px 0 0 var(--orange) inset' : ''}">
    ${picture}<div style="flex:1;min-width:0"><div class="h3" style="font-size:21px">${n}${tag ? ` <span class="tagpill dev" style="font-size:12px;vertical-align:3px">${tag}</span>` : ''}</div><div class="muted" style="font-size:16px;white-space:nowrap">${v}</div></div></div>`;
}).join('');
const callout = (x, y, dx, dy, k, v) => `<div style="position:absolute;left:${x}px;top:${y}px;width:0;height:0">
  <div style="position:absolute;left:-7px;top:-7px;width:14px;height:14px;border:2px solid var(--orange-2);border-radius:50%;background:rgba(255,154,60,.25)"></div>
  <svg style="position:absolute;left:${Math.min(0, dx)}px;top:${Math.min(0, dy)}px;overflow:visible" width="${Math.abs(dx)}" height="${Math.abs(dy)}"><line x1="${dx < 0 ? -dx : 0}" y1="${dy < 0 ? -dy : 0}" x2="${dx < 0 ? 0 : dx}" y2="${dy < 0 ? 0 : dy}" stroke="#ff9a3c" stroke-width="2"/></svg>
  <div style="position:absolute;left:${dx}px;top:${dy}px;transform:translate(${dx < 0 ? '-100%' : '0'},-50%);padding:6px 12px;background:rgba(7,13,31,.9);border:1px solid rgba(255,154,60,.6);white-space:nowrap"><div class="k" style="color:var(--orange-2);font-size:13px">${k}</div><div class="d" style="font-weight:700;font-size:20px">${v}</div></div></div>`;
const hero = (h) => `<div style="position:absolute;left:0;top:0;width:960px;height:${h}px">
  <div style="position:absolute;inset:0;background:radial-gradient(46% 46% at 50% 56%,rgba(63,140,255,.22),transparent 70%),repeating-linear-gradient(90deg,rgba(150,180,255,.06) 0 1px,transparent 1px 48px),repeating-linear-gradient(0deg,rgba(150,180,255,.06) 0 1px,transparent 1px 48px);-webkit-mask-image:radial-gradient(50% 50% at 50% 55%,#000 40%,transparent)"></div>
  <img src="${T('hero-aeg-kit')}" style="position:relative;width:960px;height:${h}px;object-fit:cover;object-position:50% 45%;-webkit-mask-image:radial-gradient(52% 60% at 50% 52%,#000 70%,transparent 100%)"></div>`;
const option = (src, name, lines, on, w = 280, h = 214) => `<div class="pic contain ${on ? 'on' : ''}" style="width:${w}px;height:${h}px">
  ${src ? `<img class="feather" src="${T(src)}" style="height:auto;margin-top:-14px">` : `<div style="height:${h - 90}px;display:grid;place-items:center;color:var(--dim);font:700 22px 'Barlow Condensed';letter-spacing:.1em">NONE</div>`}
  ${on ? `<div class="tick">${I.check}</div>` : ''}
  <div style="position:absolute;left:14px;right:14px;bottom:12px"><b class="d" style="font-size:21px">${name}</b>${lines.map(([t, g]) => `<div style="font-size:15px;color:${g === 1 ? 'var(--good)' : g === -1 ? 'var(--bad)' : 'var(--muted)'}">${t}</div>`).join('')}</div></div>`;
const customiseFrame = (slot, centre, right) => `${bg(M('ultra-arms'), 'blur even')}
<div class="screen">${top('loadout')}
  ${abs(48, 104, 1000, 0, `<div class="k" style="font-size:16px">Loadout &nbsp;›&nbsp; <span style="color:var(--text)">AEG Rifle</span> &nbsp;›&nbsp; <b>Customise</b></div>`)}
  ${abs(48, 136, 400, 0, slotList(slot))}
  ${abs(472, 132, 960, 880, centre)}
  ${abs(1472, 132, 400, 878, right)}
  ${hints([['Esc', 'Back to gear'], ['W/S', 'Part'], ['A/D', 'Option'], ['Enter', 'Fit']], 'Changes save as you go')}
</div>`;
screens.customise = () => customiseFrame('Grip', `
  <div style="position:relative;height:560px">${hero(560)}
    ${callout(405, 160, 70, -78, 'Optic', 'Red Dot')}
    ${callout(619, 300, 110, 96, 'Grip', 'Vertical grip')}
    ${callout(668, 212, 150, -96, 'Light', 'Weapon Torch')}
    <div style="position:absolute;left:0;top:6px"><div class="h1">AEG Rifle</div><div><span class="rtxt r-rare">Rare</span><span class="muted"> · Cobalt · 3 parts fitted</span></div></div>
  </div>
  ${sec('Part', 'Grip · 3 options', '<span class="muted" style="font-size:16px">A grip steadies you, but the replica comes up slower</span>')}
  <div style="display:flex;gap:18px">
    ${option('', 'No grip', [['As it comes', 0]], false)}
    ${option('att-vertical', 'Vertical grip', [['Recoil −10%', 1], ['Aim raise +0.03 s', -1]], true)}
    ${option('att-angled', 'Angled grip', [['Aim raise −0.02 s', 1], ['Recoil −4%', 1]], false)}
  </div>`, `<div class="panel cut" style="height:100%;padding:24px">
    <div class="h2" style="font-size:28px">Performance</div>
    <div class="muted" style="font-size:15px;margin:6px 0 20px">Changes are against the replica as it comes. Feet per second as a site’s chrono reads it, on 0.20 g BBs.</div>
    ${statRow('Energy', '1.02 J · site limit 1.14 J', 72)}
    ${statRow('Muzzle speed', '330 fps', 62)}
    ${statRow('Rate of fire', 'up to 15 / s', 70)}
    ${statRow('On target to', '38 m', 58, '+3 m')}
    ${statRow('Spread', '1.1°', 64)}
    ${statRow('Recoil', 'Light', 76, '−10%')}
    ${statRow('Aim raise', '0.24 s', 60, '+0.03 s', false)}
    ${statRow('Shots heard from', '42 m', 48)}
    <div class="muted" style="font-size:15px;margin-top:12px">Example numbers for the concept.</div>
  </div>`);

const scheme = (id, name, on, w = 222, h = 148) => `<div class="pic contain ${on ? 'on' : ''}" style="width:${w}px;height:${h}px">
  <img class="feather" src="${T(id)}" style="height:${h}px;object-fit:contain;transform:scale(1.08) translateY(-9%)">${on ? `<div class="tick">${I.check}</div>` : ''}
  <div style="position:absolute;left:12px;bottom:9px"><b class="d" style="font-size:19px">${name}</b></div></div>`;
screens.colour = () => customiseFrame('Colour', `
  <div style="position:relative;height:470px">${hero(470)}
    <div style="position:absolute;left:0;top:6px"><div class="h1">AEG Rifle</div><div><span class="rtxt r-rare">Rare</span><span class="muted"> · Cobalt</span></div></div>
  </div>
  ${sec('Part', 'Colour · 8 schemes', '<span class="muted" style="font-size:16px">Two-tone: the colour on the body, black on the receiver</span>')}
  <div style="display:grid;grid-template-columns:repeat(4,222px);gap:14px 24px">
    ${scheme('scheme-cobalt', 'Cobalt', true)}${scheme('scheme-signal', 'Signal')}${scheme('scheme-acid', 'Acid')}${scheme('scheme-teal', 'Teal')}
    ${scheme('scheme-hazard', 'Hazard')}${scheme('scheme-coral', 'Coral')}${scheme('scheme-onyx', 'Onyx')}${scheme('scheme-ghost', 'Ghost')}
  </div>`, `<div class="panel cut" style="height:100%;padding:24px">
    <div class="k">Applies to</div>
    ${seg(['AEG Rifle', 'Gas Pistol'], 'AEG Rifle', 'margin-top:10px')}
    <div class="muted" style="font-size:16px;margin-top:10px">Each replica keeps its own colour. Your Gas Pistol is Ghost.</div>
    <div class="pic contain" style="height:120px;margin-top:10px"><img src="${T('pistol')}"></div>
    <div style="height:1px;background:var(--line);margin:22px 0"></div>
    <div style="display:flex;justify-content:space-between;align-items:center"><div class="h3">Realistic colours</div><div class="toggle"></div></div>
    <div class="muted" style="font-size:16px;margin-top:8px">Off. Turn it on in Settings › Look and every replica shows in one real colour instead. Cobalt shows as Black.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
      ${[['real-black', 'Black'], ['real-grey', 'Wolf grey'], ['real-ranger', 'Ranger green'], ['real-tan', 'Tan']].map(([s, n]) => scheme(s, n, false, 170, 104)).join('')}
    </div>
    <div class="muted" style="font-size:15px;margin-top:16px">Skins come in a later version.</div>
  </div>`);

// ---- Settings ------------------------------------------------------------------------------------------------------
const GROUPS = [['Graphics', I.graphics, 'Quality, effects, frame rate'], ['Display', I.display, 'Screen, brightness, field of view'], ['Audio', I.audio, 'Volume, voices, sound cues'],
  ['Controls', I.controls, 'Mouse, keys, aim and sprint'], ['Gameplay', I.gameplay, 'Crosshair, HUD, hit feed'], ['Accessibility', I.access, 'Colours, motion, captions'], ['Look', I.look, 'Robots, realistic colours']];
const settingsNav = (on) => `
  <div style="display:flex;align-items:center;gap:12px;height:56px;padding:0 16px;background:var(--panel-2);border:1px solid var(--line-2)"><i style="width:22px;color:var(--muted)">${I.search}</i><span class="muted" style="font-size:19px">Search settings</span><kbd style="margin-left:auto;font:700 14px 'Barlow Condensed';border:1px solid var(--line-2);padding:3px 7px;color:var(--muted)">/</kbd></div>
  <div style="margin-top:18px;display:flex;flex-direction:column;gap:6px">
    ${GROUPS.map(([n, ic, sub]) => `<div style="display:flex;gap:14px;align-items:center;height:70px;padding:0 16px;background:${n === on ? 'rgba(255,107,26,.16)' : 'var(--panel)'};border:1px solid ${n === on ? 'var(--orange)' : 'var(--line)'};${n === on ? 'box-shadow:4px 0 0 var(--orange) inset' : ''}">
      <i style="width:28px;color:${n === on ? 'var(--orange-2)' : 'var(--muted)'}">${ic}</i><div><div class="h3" style="font-size:22px">${n}</div><div class="muted" style="font-size:15px">${sub}</div></div></div>`).join('')}
    <div style="height:10px"></div>
    <div style="display:flex;gap:14px;align-items:center;height:56px;padding:0 16px;border:1px solid var(--line)"><i style="width:24px;color:var(--muted)">${I.save}</i><div class="h3" style="font-size:20px">Save file</div></div>
    <div style="display:flex;gap:14px;align-items:center;height:48px;padding:0 16px;color:var(--dim)"><div class="toggle" style="transform:scale(.7);margin-left:-10px"></div><span style="font-size:16px">Show Dev settings</span></div>
  </div>`;
const setRow = (label, note, control, c, focus) => `<div style="display:flex;align-items:center;gap:24px;min-height:72px;padding:10px 18px;border-bottom:1px solid var(--line);${focus ? 'background:rgba(63,140,255,.12);box-shadow:4px 0 0 var(--blue) inset' : ''}">
  <div style="flex:1"><div style="font-weight:700;font-size:20px">${label}</div><div class="muted" style="font-size:16px">${note}</div></div>
  <div style="width:480px">${control}</div><div style="width:64px;text-align:right">${c ? cost(c) : ''}</div></div>`;
const slider = (pct, label) => `<div style="display:flex;align-items:center;gap:14px"><div class="bar" style="flex:1;height:8px"><i style="width:${pct}%;background:var(--orange)"></i><span style="position:absolute;left:calc(${pct}% - 10px);top:-6px;width:20px;height:20px;background:#fff;border-radius:50%"></span></div><b style="width:64px;text-align:right">${label}</b></div>`;
const presetCard = (n, sub, on, looks, speed) => `<div class="panel ${on ? 'pic on' : ''}" style="flex:1;height:118px;padding:14px 16px;${on ? 'background:rgba(255,107,26,.14)' : ''}">
  <div class="h3" style="font-size:25px">${n}</div><div class="muted" style="font-size:15px">${sub}</div>
  <div style="display:flex;gap:14px;margin-top:10px;font-size:13px" class="k"><span>Looks ${cost(looks)}</span></div></div>`;
const settingsFrame = (group, main, side) => `${bg(M('ultra-map'), 'blur even')}
<div class="screen">${top('settings')}
  ${abs(48, 112, 360, 0, settingsNav(group))}
  ${abs(440, 112, 976, 900, main)}
  ${abs(1448, 112, 424, 900, side)}
  ${hints([['Esc', 'Back'], ['/', 'Search'], ['R', 'Reset this group']], 'Saved as you change them')}
</div>`;
screens.settings = () => settingsFrame('Graphics', `
  <div style="display:flex;align-items:baseline;gap:18px"><div class="h1" style="font-size:54px">Graphics</div><span class="muted">How the game looks and how fast it runs. Pick a preset, then change anything.</span></div>
  <div style="display:flex;gap:10px;margin-top:16px">
    ${presetCard('Low', 'Built-in graphics', false, 1)}${presetCard('Medium', 'Most laptops', false, 2)}${presetCard('High', 'Gaming PCs', false, 3)}${presetCard('Ultra', 'Top-end PCs, 4K', true, 4)}${presetCard('Custom', 'Your own mix', false, 0)}
  </div>
  <div style="position:relative;height:150px;margin-top:12px;overflow:hidden;border:1px solid var(--line)">
    <img src="${M('low-ingame')}" style="position:absolute;left:0;top:0;width:50%;height:100%;object-fit:cover;object-position:52% 52%">
    <img src="${M('ultra-ingame')}" style="position:absolute;right:0;top:0;width:50%;height:100%;object-fit:cover;object-position:52% 52%">
    <div style="position:absolute;left:50%;top:0;bottom:0;width:3px;background:#fff;transform:translateX(-50%)"></div>
    <span class="tagpill" style="position:absolute;left:12px;top:12px;background:rgba(7,13,31,.85)">Low</span><span class="tagpill o" style="position:absolute;right:12px;top:12px;background:rgba(7,13,31,.85)">Ultra</span>
  </div>
  <div class="panel" style="margin-top:12px">
    ${setRow('Frame rate cap', 'Match your screen. Unlimited runs as fast as the PC can.', seg(['30', '60', '120', '144', '240', 'Unlimited'], '240', 'gap:4px'), 0)}
    ${setRow('Render scale', 'Below 100% draws fewer pixels and runs faster.', slider(100, '100%'), 4)}
    ${setRow('Anti-aliasing', 'Smooths jagged edges. TAA is the smoothest.', seg(['Off', 'FXAA', 'TAA'], 'TAA'), 2)}
    ${setRow('Shadows', 'Sharper shadows from the sun and lamps.', seg(['Low', 'Medium', 'High', 'Ultra'], 'Ultra'), 3)}
    ${setRow('Ambient occlusion', 'Soft shade where things meet: corners, crates, feet.', seg(['Off', 'Low', 'High'], 'High'), 3, true)}
    ${setRow('Volumetric light', 'Sunbeams and lamp glow in dusty air.', seg(['Off', 'Low', 'High'], 'High'), 3)}
    ${setRow('Reflections', 'Shine on wet floors and glass.', seg(['Off', 'Puddles and glass'], 'Puddles and glass'), 2)}
  </div>
  <div class="muted" style="font-size:16px;margin-top:10px">7 more below: bloom, bounce light, particles, lens effects, textures, draw distance, motion blur</div>`, `<div class="panel cut" style="height:100%;padding:26px">
    <div class="k">About this setting</div>
    <div class="h2" style="margin-top:8px">Ambient occlusion</div>
    <p style="margin-top:12px;font-size:18px;color:#dfe6f8">Darkens the gaps where surfaces meet, so crates sit on the floor instead of floating, and corners read at a glance.</p>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:10px 16px;margin-top:20px;font-size:17px;align-items:center">
      <span class="k" style="font-size:14px">Cost</span><span>${cost(3)} <span class="muted">&nbsp;Medium</span></span>
      <span class="k" style="font-size:14px">Off on</span><span>Low</span>
      <span class="k" style="font-size:14px">Turn down</span><span>Second, after shadows</span>
    </div>
    <div style="height:1px;background:var(--line);margin:26px 0"></div>
    <div class="k">Your computer</div>
    <div style="display:flex;gap:14px;align-items:center;margin-top:12px"><i style="width:34px;color:var(--good)">${I.display}</i><div><b>Fast graphics card found</b><div class="muted" style="font-size:16px">Suggested preset: Ultra</div></div></div>
    <div class="panel" style="margin-top:22px;padding:16px;background:rgba(200,255,46,.06);border-color:rgba(200,255,46,.3)"><b style="color:var(--acid)">Stutters?</b> <span class="muted" style="font-size:16px">Lower Render scale first: it helps the most.</span></div>
  </div>`);

const lookCard = (title, note, on, a, b, la, lb, posA = '50% 50%', posB = '50% 50%') => `<div class="panel cut" style="padding:22px;margin-bottom:18px">
  <div style="display:flex;justify-content:space-between;align-items:center"><div class="h2" style="font-size:28px">${title}</div><div style="display:flex;gap:12px;align-items:center"><b style="color:${on ? 'var(--orange-2)' : 'var(--muted)'}">${on ? 'On' : 'Off'}</b><div class="toggle ${on ? 'on' : ''}"></div></div></div>
  <div class="muted" style="font-size:17px;margin-top:6px">${note}</div>
  <div style="display:flex;gap:16px;margin-top:16px">
    <div class="pic ${on ? '' : 'on'}" style="flex:1;height:250px"><img src="${a}" style="object-position:${posA}"><div class="cap"><b class="d" style="font-size:20px">${la}</b></div></div>
    <div class="pic ${on ? 'on' : ''}" style="flex:1;height:250px">${Array.isArray(b) ? `<img src="${b[0]}" style="position:absolute;left:0;top:0;width:50%;object-position:3% 40%"><img src="${b[1]}" style="position:absolute;right:0;top:0;width:50%;object-position:97% 40%">` : `<img src="${b}" style="object-position:${posB}">`}<div class="cap"><b class="d" style="font-size:20px">${lb}</b></div></div>
  </div></div>`;
screens.look = () => settingsFrame('Look', `
  <div style="display:flex;align-items:baseline;gap:18px;margin-bottom:16px"><div class="h1" style="font-size:54px">Look</div><span class="muted">How players and replicas look. Your own replica colours are in Loadout › Customise.</span></div>
  ${lookCard('Robots', 'Each match mixes humans and robots on both teams. Off: everyone is human.', true, M('ultra-characters'), [M('ultra-characters'), M('ultra-robots')], 'Off: humans only', 'On: humans and robots', '50% 40%', '50% 40%')}
  ${lookCard('Realistic colours', 'Every replica in one real colour: black, wolf grey, ranger green or tan, never mixed. Off: the bold two-tone schemes.', false, M('ultra-schemes'), M('ultra-schemes-real'), 'Off: bold schemes', 'On: realistic colours', '50% 45%', '50% 45%')}`, `<div class="panel cut" style="height:100%;padding:26px">
    <div class="k">Who you’ll meet</div>
    <p class="muted" style="font-size:17px;margin-top:8px">Every face is covered, as at a real site: helmets, balaclavas, visors and robot heads.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">
      ${[['helmet', 'High-cut helmet'], ['balaclava', 'Balaclava'], ['visor', 'Full-face visor'], ['bump', 'Bump helmet'], ['robot', 'Robot']].map(([s, n]) => `<div class="pic" style="height:150px;${s === 'robot' ? 'grid-column:span 2' : ''}"><img src="${A(s === 'robot' ? 'robot-wide' : s)}" style="object-position:50% 40%"><div class="cap" style="padding:20px 10px 8px"><b class="d" style="font-size:17px">${n}</b></div></div>`).join('')}
    </div>
  </div>`);

// ---- In-game HUD ---------------------------------------------------------------------------------------------------
const pips = (n, alive, c) => `<span style="display:inline-flex;gap:5px">${Array.from({ length: n }, (_, i) => `<i style="width:12px;height:22px;background:${c};opacity:${i < alive ? 1 : 0.25};transform:skewX(-14deg)"></i>`).join('')}</span>`;
const minimap = `<svg viewBox="0 0 260 260" width="260" height="260">
  <defs><clipPath id="mm"><rect x="0" y="0" width="260" height="260" rx="10"/></clipPath></defs>
  <g clip-path="url(#mm)"><rect width="260" height="260" fill="rgba(7,13,31,.72)"/>
  <rect x="18" y="40" width="224" height="180" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="3"/>
  ${[[40, 60, 50, 18], [120, 70, 18, 50], [170, 56, 52, 16], [60, 120, 34, 34], [150, 130, 60, 18], [100, 170, 18, 36], [40, 186, 50, 16], [190, 170, 30, 34], [118, 110, 26, 26]].map(([x, y, w, h], i) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${['#ff6b1a', '#1fd6c4', '#3f8cff', '#aab4c8', '#ff6b1a', '#aab4c8', '#c8ff2e', '#1fd6c4', '#aab4c8'][i]}" opacity=".55"/>`).join('')}
  <path d="M80 210 l12 -26 l12 26 l-12 -7z" fill="#79b0ff" stroke="#fff" stroke-width="2"/>
  <circle cx="58" cy="168" r="6" fill="#79b0ff" stroke="#fff" stroke-width="1.5"/><circle cx="130" cy="200" r="6" fill="#79b0ff" opacity=".4"/>
  <circle cx="176" cy="96" r="9" fill="none" stroke="#ff9a3c" stroke-width="2.5" stroke-dasharray="4 3"/><text x="190" y="88" fill="#ff9a3c" font-family="Barlow Condensed" font-weight="700" font-size="14">HEARD</text>
  </g><rect x="1" y="1" width="258" height="258" rx="10" fill="none" stroke="rgba(150,180,255,.3)" stroke-width="2"/></svg>`;
screens.hud = () => `${bg(M('clean-ingame'))}<style>.bg::after{display:none}</style>
<div class="screen">
  ${abs(32, 32, 260, 260, minimap)}
  ${abs(32, 300, 260, 0, '<div class="k" style="color:#dfe6f8;font-size:14px;text-shadow:0 1px 2px #000">Depot · Round 6</div>')}
  <div style="position:absolute;left:50%;top:24px;transform:translateX(-50%);display:flex;align-items:stretch;filter:drop-shadow(0 4px 10px rgba(0,0,0,.45))">
    <div style="display:flex;align-items:center;gap:14px;padding:0 20px;height:66px;background:rgba(7,13,31,.82);clip-path:polygon(16px 0,100% 0,100% 100%,0 100%)"><span class="d" style="font-weight:800;font-size:22px;color:var(--blue-2)">Blue</span>${pips(3, 3, 'var(--blue-2)')}</div>
    <div style="width:76px;display:grid;place-items:center;background:var(--blue);font:800 46px/1 'Barlow Condensed'">3</div>
    <div style="width:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(7,13,31,.92)"><div style="font:800 38px/1 'Barlow Condensed'">1:42</div><div class="k" style="font-size:12px;color:var(--muted)">First to 5</div></div>
    <div style="width:76px;display:grid;place-items:center;background:var(--orange);font:800 46px/1 'Barlow Condensed'">2</div>
    <div style="display:flex;align-items:center;gap:14px;padding:0 20px;height:66px;background:rgba(7,13,31,.82);clip-path:polygon(0 0,100% 0,calc(100% - 16px) 100%,0 100%)">${pips(3, 1, 'var(--orange-2)')}<span class="d" style="font-weight:800;font-size:22px;color:var(--orange-2)">Orange</span></div>
  </div>
  <div style="position:absolute;left:50%;top:112px;transform:translateX(-50%);padding:8px 22px;background:rgba(255,107,26,.92);font:800 22px/1 'Barlow Condensed';letter-spacing:.1em;text-transform:uppercase;clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%)">Orange 2 called hit · 1 left</div>
  ${abs(1488, 32, 400, 0, [['Orange 2', 'You', 'o', 'b', 1], ['Blue 3', 'Orange 1', 'b', 'o'], ['Orange 3', 'Blue 2', 'o', 'b']].map(([who, by, cw, cb, mine]) => `<div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-bottom:6px;padding:8px 14px;background:rgba(7,13,31,${mine ? '.88' : '.7'});${mine ? 'box-shadow:-4px 0 0 var(--acid) inset' : ''};font-size:18px">
    <b style="color:${cb === 'b' ? 'var(--blue-2)' : 'var(--orange-2)'}">${by}</b><i style="width:20px;color:#fff">${I.bb}</i><b style="color:${cw === 'b' ? 'var(--blue-2)' : 'var(--orange-2)'}">${who}</b><span class="tagpill" style="font-size:12px">Hit</span></div>`).join(''))}
  <div style="position:absolute;left:960px;top:540px;width:0;height:0">${[[0, -20, 2, 12], [0, 8, 2, 12], [-20, 0, 12, 2], [8, 0, 12, 2]].map(([x, y, w, h]) => `<i style="position:absolute;left:${x - (w === 2 ? 1 : 0)}px;top:${y - (h === 2 ? 1 : 0)}px;width:${w}px;height:${h}px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.6)"></i>`).join('')}</div>
  ${abs(32, 900, 640, 0, `<div style="display:flex;gap:10px">${[['helmet', 'You', 'In play', 1], ['balaclava', 'Blue 2', 'Holding', 1], ['robot', 'Blue 3', 'Hit', 0]].map(([a, n, s, ok]) => `<div style="display:flex;align-items:center;gap:10px;padding:6px 14px 6px 6px;background:rgba(7,13,31,.78);${ok ? '' : 'opacity:.6'}">
    <img src="${A(a)}" style="width:52px;height:52px;object-fit:cover;${ok ? 'box-shadow:0 0 0 2px var(--blue-2)' : 'filter:grayscale(1)'}"><div><b class="d" style="font-size:19px">${n}</b><div style="font-size:15px;color:${ok ? 'var(--muted)' : 'var(--orange-2)'}">${s}</div></div></div>`).join('')}</div>
    <div style="margin-top:10px;display:flex;gap:16px;font:600 15px 'Barlow Condensed';letter-spacing:.1em;text-transform:uppercase;color:#dfe6f8;text-shadow:0 1px 2px #000"><span><kbd style="border:1px solid rgba(255,255,255,.4);padding:2px 6px;background:rgba(7,13,31,.7)">F1</kbd> Follow</span><span><kbd style="border:1px solid rgba(255,255,255,.4);padding:2px 6px;background:rgba(7,13,31,.7)">F2</kbd> Hold</span><span><kbd style="border:1px solid rgba(255,255,255,.4);padding:2px 6px;background:rgba(7,13,31,.7)">F3</kbd> Push</span></div>`)}
  ${abs(1468, 880, 420, 0, `<div style="background:rgba(7,13,31,.82);padding:14px 18px;clip-path:polygon(18px 0,100% 0,100% 100%,0 100%,0 18px)">
    <div style="display:flex;align-items:center;gap:12px"><img src="${T('aeg-kit')}" style="width:150px;height:94px;object-fit:contain;margin:-14px 0 -10px -10px"><div><b class="d" style="font-size:22px">AEG Rifle</b><div style="display:flex;gap:4px;margin-top:4px"><span style="padding:3px 8px;font:700 14px 'Barlow Condensed';letter-spacing:.1em;background:rgba(255,255,255,.1);color:var(--muted)">SEMI</span><span style="padding:3px 8px;font:700 14px 'Barlow Condensed';letter-spacing:.1em;background:var(--orange)">AUTO</span></div></div>
    <div style="margin-left:auto;text-align:right"><div style="font:800 64px/0.9 'Barlow Condensed'">53</div><div class="k" style="font-size:14px;color:var(--muted)">/ 300 · 2 spare</div></div></div>
    <div style="display:flex;gap:4px;margin-top:10px">${Array.from({ length: 3 }, (_, i) => `<i style="flex:1;height:6px;background:${i === 0 ? 'var(--acid)' : 'rgba(255,255,255,.55)'}"></i>`).join('')}</div>
  </div>`)}
</div>`;

// ---- Match summary -------------------------------------------------------------------------------------------------
const player = (av, n, hits, out, acc, rounds, me, team) => `<div style="display:grid;grid-template-columns:56px 1fr 90px 90px 110px 100px;align-items:center;gap:12px;padding:8px 14px;${me ? 'background:rgba(200,255,46,.08);box-shadow:4px 0 0 var(--acid) inset' : ''};border-bottom:1px solid var(--line)">
  <img src="${A(av)}" style="width:52px;height:52px;object-fit:cover;box-shadow:0 0 0 2px ${team === 'b' ? 'var(--blue)' : 'var(--orange)'}"><b style="font-size:20px">${n}</b>
  <b style="font-size:22px;text-align:center">${hits}</b><span style="text-align:center">${out}</span><span style="text-align:center">${acc}</span><span style="text-align:center">${rounds}</span></div>`;
const tableHead = (label, c, score) => `<div style="display:flex;align-items:center;gap:14px;padding:12px 14px;background:${c};"><span class="h3" style="font-size:24px">${label}</span><span style="margin-left:auto;font:800 30px/1 'Barlow Condensed'">${score}</span></div>
  <div class="k" style="display:grid;grid-template-columns:56px 1fr 90px 90px 110px 100px;gap:12px;padding:8px 14px;font-size:13px"><span></span><span>Player</span><span style="text-align:center">Hits</span><span style="text-align:center">Hit by</span><span style="text-align:center">Accuracy</span><span style="text-align:center">Survived</span></div>`;
screens.results = () => `${bg(M('ultra-overview'), 'blur')}
<div class="screen">
  ${abs(80, 70, 1200, 0, `<div class="k" style="font-size:17px">Match over &nbsp;·&nbsp; Depot &nbsp;·&nbsp; Elimination &nbsp;·&nbsp; Skirmish</div>
    <div style="display:flex;align-items:flex-end;gap:30px;margin-top:6px"><div style="font:800 italic 150px/0.85 'Barlow Condensed';text-transform:uppercase;color:var(--blue-2)">Victory</div>
    <div style="font:800 64px/1 'Barlow Condensed';padding-bottom:10px"><span style="color:var(--blue-2)">5</span> <span class="muted">–</span> <span style="color:var(--orange-2)">3</span></div></div>`)}
  ${abs(80, 290, 360, 0, `<div class="panel cut r-legendary" style="height:620px;position:relative;overflow:hidden">
    <img src="${A('mvp')}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:60% 30%">
    <div style="position:absolute;inset:0;background:linear-gradient(0deg,rgba(7,13,31,.98) 18%,rgba(7,13,31,0) 55%)"></div>
    <div style="position:absolute;left:22px;top:20px;color:var(--yellow);border-color:rgba(255,194,26,.6);background:rgba(7,13,31,.85)" class="tagpill">Match MVP</div>
    <div style="position:absolute;left:22px;right:22px;bottom:22px"><div class="h1" style="font-size:52px">You</div><div class="muted">7 hits · hit 3 times · 34% on target</div><div style="margin-top:8px;color:var(--yellow);display:flex;gap:8px;align-items:center"><i style="width:20px">${I.star}</i><b>Best player of the match</b></div></div>
    <div class="rar" style="height:5px"></div></div>`)}
  ${abs(470, 290, 850, 0, `<div class="panel">${tableHead('Blue', 'linear-gradient(90deg,rgba(63,140,255,.5),rgba(63,140,255,.1))', 5)}
    ${player('helmet', 'You', 7, 3, '34%', '5 / 8', 1, 'b')}${player('balaclava', 'Blue 2', 5, 4, '29%', '4 / 8', 0, 'b')}${player('robot', 'Blue 3', 3, 6, '22%', '2 / 8', 0, 'b')}</div>
    <div class="panel" style="margin-top:16px">${tableHead('Orange', 'linear-gradient(90deg,rgba(255,107,26,.5),rgba(255,107,26,.1))', 3)}
    ${player('visor', 'Orange 1', 6, 5, '31%', '3 / 8', 0, 'o')}${player('bump', 'Orange 2', 4, 6, '25%', '2 / 8', 0, 'o')}${player('robot', 'Orange 3', 3, 5, '20%', '3 / 8', 0, 'o')}</div>`)}
  ${abs(1352, 70, 488, 0, `<div class="panel cut" style="padding:24px">
    <div class="k">Field Credits earned</div>
    <div style="display:flex;align-items:center;gap:12px;margin-top:8px"><span class="dot" style="width:22px;height:22px;border-radius:50%;background:var(--yellow);display:inline-block"></span><span style="font:800 64px/1 'Barlow Condensed'">+185</span><span class="muted" style="font-size:20px;margin-top:16px">FC</span></div>
    <div style="display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:16px;font-size:18px">
      <span class="muted">Win</span><b>120</b><span class="muted">7 hits</span><b>35</b><span class="muted">Rounds you were in</span><b>30</b><span class="muted">Normal bots</span><b>× 1.0</b></div>
    <div style="height:1px;background:var(--line);margin:18px 0"></div>
    <div class="k">Records</div>
    ${[['New best', '7 hits in one match', 1], ['Longest hit', '41 m with the AEG Rifle', 0], ['Wins on Depot', '12', 0]].map(([k, v, n]) => `<div style="display:flex;gap:12px;align-items:center;margin-top:12px"><i style="width:22px;color:${n ? 'var(--yellow)' : 'var(--dim)'}">${n ? I.star : I.trophy}</i><div><b>${k}</b> <span class="muted">${v}</span></div></div>`).join('')}
  </div>
  <div style="display:flex;flex-direction:column;gap:12px;margin-top:20px">
    <div class="btn primary big" style="width:100%;justify-content:space-between">Play again ${I.arrowR}</div>
    <div style="display:flex;gap:12px"><div class="btn" style="flex:1">Loadout</div><div class="btn" style="flex:1">Main menu</div></div>
  </div>`)}
  ${hints([['Enter', 'Play again'], ['L', 'Loadout'], ['Esc', 'Main menu']], 'Example numbers for the concept')}
</div>`;

// ---- Armory --------------------------------------------------------------------------------------------------------
const TIERS = [['Common', 46, 'r-common'], ['Uncommon', 26, 'r-uncommon'], ['Rare', 15, 'r-rare'], ['Very Rare', 8, 'r-vrare'], ['Epic', 4, 'r-epic'], ['Legendary', 1, 'r-legendary']];
const reveal = (src, name, tier, cls, note) => `<div class="pic contain ${cls}" style="width:220px;height:330px;box-shadow:0 0 34px -6px var(--rc), 0 0 0 2px var(--rc) inset">
  <div style="position:absolute;inset:0;background:radial-gradient(70% 50% at 50% 40%,color-mix(in srgb,var(--rc) 30%,transparent),transparent)"></div>
  <img class="feather" src="${T(src)}" style="position:relative;height:auto;margin-top:56px">
  <div class="corner"><span class="tagpill" style="color:var(--rc);border-color:var(--rc);background:rgba(7,13,31,.8)">${note}</span></div>
  <div style="position:absolute;left:14px;right:14px;bottom:16px"><span class="rtxt">${tier}</span><b class="d" style="display:block;font-size:22px;margin-top:2px">${name}</b></div><div class="rar" style="height:5px"></div></div>`;
const coll = (src, name, owned) => `<div class="pic contain" style="height:122px">
  <img class="feather" src="${T(src)}" style="height:auto;margin-top:-6px;${owned.some(Boolean) ? '' : 'filter:grayscale(1) brightness(.45)'}">
  <div style="position:absolute;left:10px;right:10px;bottom:8px"><b class="d" style="font-size:16px;display:block">${name}</b>
  <div style="display:flex;gap:3px;margin-top:4px">${TIERS.map(([, , c], i) => `<i class="${c}" style="flex:1;height:5px;background:${owned[i] ? 'var(--rc)' : 'rgba(255,255,255,.12)'}"></i>`).join('')}</div></div></div>`;
screens.armory = () => `${bg(M('ultra-map'), 'blur even')}
<div class="screen">${top('armory')}
  ${abs(48, 112, 520, 900, `<div class="panel cut" style="height:100%;padding:26px;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;gap:12px"><div class="h1" style="font-size:54px">Armory</div><span class="tagpill">Free</span></div>
    <div class="muted" style="font-size:17px;margin-top:8px">Completely free: Field Credits come from playing matches, and nothing here is ever sold.</div>
    <div style="display:flex;gap:12px;margin-top:22px">
      <div class="panel" style="flex:1;padding:16px"><div class="k">Field Credits</div><div style="font:800 40px/1 'Barlow Condensed';margin-top:4px">2,480</div></div>
      <div class="panel" style="flex:1;padding:16px"><div class="k">Tokens</div><div style="font:800 40px/1 'Barlow Condensed';margin-top:4px">3</div></div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;margin-top:12px"><span class="muted" style="flex:1;font-size:17px">160 FC buys one Token.</span><div class="btn" style="height:46px;font-size:20px">Exchange</div></div>
    <div style="height:1px;background:var(--line);margin:22px 0"></div>
    <div class="h2" style="font-size:28px">Shots</div>
    <div class="muted" style="font-size:17px;margin-top:4px">Each Shot dispenses 3 random assets. Ten Shots always hold a Rare or rarer.</div>
    <div class="btn primary" style="margin-top:16px;height:72px;justify-content:space-between;font-size:30px">1 Shot <span style="font-size:20px">1 Token</span></div>
    <div class="btn" style="margin-top:10px;height:72px;justify-content:space-between;font-size:30px">10 Shots <span style="font-size:20px;color:var(--muted)">3 Tokens + 1,120 FC</span></div>
    <div class="k" style="margin-top:22px">Guaranteed</div>
    <div style="margin-top:8px;font-size:17px"><b style="color:var(--r-epic)">Epic</b> or rarer within 14 more Shots<br><b style="color:var(--r-legendary)">Legendary</b> or rarer within 63 more Shots</div>
  </div>`)}
  ${abs(600, 112, 720, 0, `${sec('', 'Last Shot')}
    <div style="display:flex;gap:20px;justify-content:center;margin-top:6px">
      ${reveal('att-scope2x', '2× Scope', 'Rare', 'r-rare', 'New')}${reveal('cyber', 'Cyber Pistol', 'Legendary', 'r-legendary', 'Chase')}${reveal('att-silencer', 'Silencer', 'Common', 'r-common', 'Spare')}
    </div>
    <div style="margin-top:30px">${sec('', 'Rarity odds', '<span class="muted" style="font-size:15px">each item drawn, before guarantees</span>')}</div>
    <div style="display:flex;height:40px">${TIERS.map(([n, p, c]) => `<div class="${c}" style="flex:${p};background:var(--rc);opacity:.9;min-width:6px"></div>`).join('')}</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px 20px;margin-top:14px;font-size:17px">${TIERS.map(([n, p, c]) => `<div class="${c}" style="display:flex;align-items:center;gap:10px"><i style="width:14px;height:14px;background:var(--rc)"></i><span>${n}</span><b style="margin-left:auto">${p}%</b></div>`).join('')}</div>
    <div class="muted" style="font-size:16px;margin-top:16px">Chase item: the Cyber Pistol, Legendary only. Each item drawn has its own small chance of being it.</div>
    <div style="display:flex;gap:12px;margin-top:26px">${[[I.trophy, 'Play matches', 'Earn Field Credits, more for a win'], [I.crate, 'Swap for Tokens', '160 FC buys one Token'], [I.dice, 'Take a Shot', '3 random assets each time']].map(([ic, t, d], i) => `<div class="panel" style="flex:1;padding:14px 16px"><div style="display:flex;gap:10px;align-items:center"><span class="d" style="font-weight:800;font-size:22px;color:var(--orange-2)">${i + 1}</span><i style="width:24px;color:var(--muted)">${ic}</i></div><b class="d" style="font-size:20px;display:block;margin-top:6px">${t}</b><span class="muted" style="font-size:15px">${d}</span></div>`).join('')}</div>`)}
  ${abs(1352, 112, 520, 900, `<div class="panel cut" style="height:100%;padding:22px">
    <div style="display:flex;align-items:baseline;justify-content:space-between"><div class="h2" style="font-size:28px">Your collection</div><b class="muted">34 / 126 items</b></div>
    <div class="bar" style="margin-top:10px"><i style="width:27%;background:var(--acid)"></i></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px">
      ${coll('aeg', 'AEG Rifle', [1, 1, 1, 0, 0, 0])}${coll('pistol', 'Gas Pistol', [1, 1, 0, 0, 0, 0])}${coll('cyber', 'Cyber Pistol', [0, 0, 0, 0, 0, 1])}
      ${coll('att-redDot', 'Red Dot', [1, 1, 0, 0, 0, 0])}${coll('att-scope2x', '2× Scope', [1, 0, 1, 0, 0, 0])}${coll('att-silencer', 'Silencer', [1, 0, 0, 0, 0, 0])}
      ${coll('att-vertical', 'Vertical grip', [1, 1, 0, 1, 0, 0])}${coll('att-angled', 'Angled grip', [1, 0, 0, 0, 0, 0])}${coll('att-laser', 'Red Laser', [1, 0, 0, 0, 0, 0])}
      ${coll('att-hiCap', 'Hi-Cap mag', [1, 1, 0, 0, 0, 0])}${coll('att-longBarrel', 'Long barrel', [0, 0, 0, 0, 0, 0])}${coll('att-torch', 'Weapon Torch', [1, 0, 0, 0, 0, 0])}
    </div>
    <div class="btn" style="width:100%;margin-top:18px;height:52px;font-size:21px">Scrap all spares</div>
  </div>`)}
  ${hints([['Space', '1 Shot'], ['Esc', 'Back']], 'Example numbers for the concept')}
</div>`;

app.innerHTML = (screens[screen] ?? screens.title)();
document.fonts.ready.then(() => Promise.all(Array.from(document.images).map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))).then(() => { window.__done = true; });
