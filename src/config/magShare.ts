/**
 * Asking a teammate for a magazine, and tossing one (MG1, the owner's Dev 6 item 43): the rules the simulation keeps
 * (sim/magShare.ts: who can toss to whom, the flight, what changes hands), how the bots ask and answer
 * (ai/magShare.ts) and the HUD's words (ui/magPrompt.ts). What the bots say is callouts.md (Need a mag, Mag coming,
 * Thanks for the mag). The same at every difficulty: only how well a bot fights changes with its level.
 */
export const MAG_SHARE = {
  /** Your ask reaches a teammate within this (m), and a bot asks only a teammate this near. */
  askRange: 30,
  /** A magazine is tossed this far at most (m, eye to chest), to a teammate in sight. */
  tossRange: 6,
  /** A bot bringing one walks on until this close (m): it tosses as soon as it is in range and sees you. */
  walkUpTo: 3,
  /** A bot bringing one sprints while further than this (m), fights or not. */
  hurryDistance: 8,
  /** A toss's flight: this long, plus this much a metre (s). */
  flightBase: 0.3,
  flightPerMetre: 0.05,
  /** The catch: this far under the catcher's eyes (m), about the chest; the toss leaves this far under the thrower's. */
  catchDrop: 0.4,
  throwDrop: 0.3,
  /** Low on BBs: the pouch for the replica in hand holds fewer BBs than this many full magazines of it. */
  lowMags: 1,
  /**
   * A bot gives from the replica it fights with only if this many full magazines' worth stays in its pouch afterwards,
   * so it never makes itself low; and asks only a player who has that much to spare. The sidearm it carries but doesn't
   * fight with yet (docs/KNOWN_ISSUES.md) it gives freely.
   */
  keepMags: 1,
  /** An ask stands this long (s) unless the magazine lands first; then it lapses. */
  askTime: 15,
  /** You can ask again this long (s) after your last ask ended (answered, landed or lapsed). */
  playerAskGap: 4,
  /** A bot asks at most this often (s): after an ask ends, or after finding nobody to ask. */
  botAskGap: 20,
  /**
   * Dev settings › Bots run low on BBs: this long (s) into each round, once the teams have spread out, so the giver's
   * walk over shows (at the whistle teammates stand within a toss of each other).
   */
  devLowAfter: 8,
  /** Most magazines in the air at once (GameState.magTosses, made once). */
  maxTosses: 6,
  /**
   * How the tossed magazine flies (render/effects/magTosses.ts): its arc's peak over the straight line, this much a metre of
   * toss up to arcHeight (m), so a hand-off up close is a flick and one at full reach a lob; and its spin (turns a second).
   */
  arcPerMetre: 0.1,
  arcHeight: 0.6,
  spin: 2.5,
  /**
   * The tossed magazine's shape, made in code (no model file): a rifle's and a pistol's box (m: width, height, depth)
   * in dark polymer, by the class of the replica it came from.
   */
  look: {
    rifle: [0.028, 0.19, 0.07],
    pistol: [0.022, 0.12, 0.035],
    colour: 0x2b2d31,
    roughness: 0.7,
  },
  /** The HUD's lines (ui/magPrompt.ts), with `{name}` the teammate's, `{key}` the Mag key's and `{bbs}` how many BBs came. */
  words: {
    toss: '{key} · Toss {name} a mag',
    tossWheel: 'Toss {name} a mag on the order wheel',
    needs: '{name} needs a mag · {m} m',
    bringing: '{name} is bringing you a mag',
    ask: 'Low on BBs · {key} to ask for a mag',
    askWheel: 'Low on BBs · ask for a mag on the order wheel',
    caught: '+1 mag from {name} · {bbs} BBs',
    /** The same with the ammo counter off (Settings › HUD, AC1): you can't tell how full a magazine is from its feel. */
    caughtUncounted: '+1 mag from {name}',
    tossed: 'Mag to {name}',
    nobody: 'Nobody near has a mag to spare',
    notLow: 'You still have a full spare mag',
    noSpare: "No mag of yours fits {name}'s replica",
    wait: 'Ask again in a moment',
    already: '{name} is already bringing you one',
    closer: 'Get closer to {name} to toss a mag',
    notNow: 'Mags wait for the next round',
    lost: 'The mag was lost',
  },
  /** A notice (caught, nobody, not low …) shows this long (s). */
  noticeTime: 2.5,
  /** Low on BBs with a teammate near who has one to spare: the hint to ask shows this long (s), once each time you run low. */
  askHintTime: 5,
} as const;

/** What the order wheel's Mag item reads (M23's wheel, MG1): asking for one, or tossing one to a teammate who asked. */
export const MAG_WHEEL_LABELS = { ask: 'Need a Mag', toss: 'Toss a Mag' } as const;

/** Settings › HUD › Mag hand-off (MG1): its line under the crosshair and the mag tag on your teammates, shown or hidden. */
export type MagPromptsMode = 'on' | 'off';

export const MAG_PROMPT_CHOICES: readonly { id: MagPromptsMode; label: string; blurb: string }[] = [
  { id: 'off', label: 'Off', blurb: 'No hand-off line or tags. The Mag key still asks and tosses, and your teammates still call it.' },
  { id: 'on', label: 'On', blurb: 'Under the crosshair: who needs a mag, whose is on its way, and when to toss or ask. A tag over the teammate.' },
];

export const DEFAULT_MAG_PROMPTS: MagPromptsMode = 'on';
