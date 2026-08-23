// The survey definition — every section and item. Originally ported verbatim
// from the legacy JS app; since schema v2 it is fully structured (no free
// text) and hand-edited under the append-only rule in types.ts: options only
// grow, ids never change meaning, and RETIRED_IDS (bottom of this file) are
// never reused.
import type { Section } from './types';

export const SECTIONS: readonly Section[] = [
  {
    id: "about",
    title: "About me",
    privacy: "open",
    blurb: "Everything is optional, and nothing here can identify you — your creature is your name.",
    items: [
      {
        id: "ab.pn",
        type: "multi",
        tier: "core",
        label: "Pronouns",
        options: [
          "she/her",
          "he/him",
          "they/them",
          "she/they",
          "he/they",
          "any",
          "ask me"
        ]
      },
      {
        id: "ab.age",
        type: "choice",
        ordinal: true,
        tier: "core",
        label: "Age range",
        options: [
          "18–24",
          "25–34",
          "35–44",
          "45–54",
          "55–64",
          "65+"
        ]
      },
      {
        id: "ab.gender",
        type: "multi",
        tier: "core",
        label: "Gender",
        options: [
          "Woman",
          "Man",
          "Non-binary",
          "Genderfluid",
          "Agender",
          "Trans woman",
          "Trans man",
          "Intersex",
          "Questioning",
          "Another way I’d describe myself"
        ]
      },
      {
        id: "ab.orient",
        type: "multi",
        tier: "core",
        label: "Orientation",
        options: [
          "Straight",
          "Gay",
          "Lesbian",
          "Bisexual",
          "Pansexual",
          "Asexual",
          "Demisexual",
          "Aromantic",
          "Queer",
          "Questioning",
          "Another way I’d describe myself"
        ]
      }
    ]
  },
  {
    id: "seeking",
    title: "Connections I’m open to",
    privacy: "open",
    blurb: "All kinds of connection are welcome here — friendship, partnership, and everything around and between.",
    items: [
      {
        id: "sk.friend",
        type: "interest",
        tier: "core",
        label: "Friendship"
      },
      {
        id: "sk.network",
        type: "interest",
        label: "Friend network / chosen family"
      },
      {
        id: "sk.activity",
        type: "interest",
        tier: "core",
        label: "Activity or hobby partners"
      },
      {
        id: "sk.casual",
        type: "interest",
        tier: "core",
        label: "Casual dating"
      },
      {
        id: "sk.longterm",
        type: "interest",
        tier: "core",
        label: "Long-term partnership"
      },
      {
        id: "sk.marriage",
        type: "interest",
        label: "Marriage"
      },
      {
        id: "sk.mono",
        type: "interest",
        tier: "core",
        label: "Monogamous relationship"
      },
      {
        id: "sk.poly",
        type: "interest",
        tier: "core",
        label: "Polyamory / ethical non-monogamy"
      },
      {
        id: "sk.open",
        type: "interest",
        label: "Open relationship"
      },
      {
        id: "sk.swing",
        type: "interest",
        label: "Swinging"
      },
      {
        id: "sk.ra",
        type: "interest",
        label: "Relationship anarchy"
      },
      {
        id: "sk.hookup",
        type: "interest",
        tier: "core",
        label: "Hookups / casual intimacy"
      },
      {
        id: "sk.qpr",
        type: "interest",
        label: "Asexual or queerplatonic partnership"
      },
      {
        id: "sk.nesting",
        type: "interest",
        label: "Cohabitation / nesting partner"
      },
      {
        id: "sk.coparent",
        type: "interest",
        label: "Co-parenting"
      },
      {
        id: "sk.penpal",
        type: "interest",
        label: "Long-distance / online connection"
      }
    ]
  },
  {
    id: "values",
    title: "What I value",
    privacy: "open",
    blurb: "Slide toward whichever side sounds more like you. The middle is a real answer too.",
    items: [
      {
        id: "va.together",
        type: "scale",
        tier: "core",
        left: "Independence",
        right: "Togetherness"
      },
      {
        id: "va.novelty",
        type: "scale",
        tier: "core",
        left: "Routine & stability",
        right: "Novelty & adventure"
      },
      {
        id: "va.heart",
        type: "scale",
        tier: "core",
        left: "Head decides",
        right: "Heart decides"
      },
      {
        id: "va.spend",
        type: "scale",
        left: "Saver",
        right: "Spender"
      },
      {
        id: "va.express",
        type: "scale",
        tier: "core",
        left: "Private & reserved",
        right: "Openly expressive"
      },
      {
        id: "va.spirit",
        type: "scale",
        left: "Not spiritual",
        right: "Deeply spiritual"
      },
      {
        id: "va.ambition",
        type: "scale",
        left: "Content as-is",
        right: "Driven & ambitious"
      },
      {
        id: "va.tradition",
        type: "scale",
        left: "Tradition",
        right: "Reinvention"
      },
      {
        id: "va.social",
        type: "scale",
        tier: "core",
        left: "Recharge alone",
        right: "Recharge with people"
      },
      {
        id: "va.plan",
        type: "scale",
        tier: "core",
        left: "Plan everything",
        right: "Wing it"
      }
    ]
  },
  {
    id: "lifestyle",
    title: "Everyday life",
    privacy: "open",
    blurb: "The day-to-day stuff that quietly makes or breaks compatibility.",
    items: [
      {
        id: "ls.alcohol",
        type: "choice",
        ordinal: true,
        tier: "core",
        label: "Alcohol",
        options: [
          "Never",
          "Rarely",
          "Socially",
          "Often"
        ]
      },
      {
        id: "ls.smoke",
        type: "choice",
        ordinal: true,
        tier: "core",
        label: "Smoking / vaping",
        options: [
          "No",
          "Occasionally",
          "Regularly"
        ]
      },
      {
        id: "ls.cannabis",
        type: "choice",
        ordinal: true,
        label: "Cannabis",
        options: [
          "Never",
          "Occasionally",
          "Regularly"
        ]
      },
      {
        id: "ls.diet",
        type: "choice",
        label: "Food",
        options: [
          "Omnivore",
          "Flexitarian",
          "Vegetarian",
          "Vegan",
          "It’s complicated"
        ]
      },
      {
        id: "ls.exercise",
        type: "choice",
        ordinal: true,
        label: "Movement & exercise",
        options: [
          "Rarely",
          "Sometimes",
          "Regularly",
          "Daily — it’s a big deal for me"
        ]
      },
      {
        id: "ls.kids",
        type: "choice",
        tier: "core",
        label: "Kids",
        options: [
          "Have kids, done",
          "Have kids, open to more",
          "Want kids someday",
          "Don’t want kids",
          "Unsure / open"
        ]
      },
      {
        id: "ls.pets",
        type: "multi",
        label: "Pets",
        options: [
          "Dog person",
          "Cat person",
          "Other critters",
          "No pets, allergic or prefer not",
          "Want pets someday"
        ]
      },
      {
        id: "ls.sleep",
        type: "choice",
        label: "Sleep schedule",
        options: [
          "Early bird",
          "Night owl",
          "Chaotic",
          "Flexible"
        ]
      },
      {
        id: "ls.tidy",
        type: "choice",
        ordinal: true,
        label: "Tidiness",
        options: [
          "Relaxed",
          "Lived-in",
          "Tidy",
          "Very tidy"
        ]
      },
      {
        id: "ls.setting",
        type: "choice",
        label: "Ideal setting",
        options: [
          "Urban",
          "Suburban",
          "Small town",
          "Rural",
          "Nomadic"
        ]
      },
      {
        id: "ls.travel",
        type: "choice",
        ordinal: true,
        label: "Travel appetite",
        options: [
          "Homebody",
          "A few trips a year",
          "Frequent traveler",
          "Live to travel"
        ]
      },
      {
        id: "ls.tuesday",
        type: "multi",
        label: "A great Tuesday evening includes…",
        options: [
          "Cooking something new",
          "Takeout & a series",
          "A workout or a run",
          "A long walk",
          "Board or video games",
          "Reading side by side",
          "A project or hobby bench",
          "Friends dropping by",
          "A bath & an early night",
          "Live music or an event",
          "Puttering in the garden",
          "Honestly, doomscrolling"
        ]
      },
      {
        id: "ls.weekend",
        type: "multi",
        label: "A perfect weekend needs…",
        options: [
          "Sleeping in",
          "A hike or fresh air",
          "A market or thrift crawl",
          "Making something by hand",
          "A party or a night out",
          "Total solitude",
          "A spontaneous road trip",
          "Time with chosen family",
          "Sports — playing or watching",
          "A museum, show, or bookstore",
          "Community or volunteer stuff",
          "Absolutely no plans"
        ]
      }
    ]
  },
  {
    id: "connection",
    title: "How I connect",
    privacy: "open",
    blurb: "How you communicate, fight, and show care.",
    items: [
      {
        id: "cn.give",
        type: "multi",
        tier: "core",
        label: "How I naturally show care",
        options: [
          "Words & affirmation",
          "Quality time",
          "Physical touch",
          "Acts of service",
          "Gifts & tokens"
        ]
      },
      {
        id: "cn.receive",
        type: "multi",
        tier: "core",
        label: "How care lands best for me",
        options: [
          "Words & affirmation",
          "Quality time",
          "Physical touch",
          "Acts of service",
          "Gifts & tokens"
        ]
      },
      {
        id: "cn.conflict",
        type: "choice",
        label: "When conflict comes up, I…",
        options: [
          "Want to talk it out right away",
          "Need space first, then talk",
          "Prefer structure — check-ins, ground rules",
          "Tend to let things settle on their own"
        ]
      },
      {
        id: "cn.tempo",
        type: "choice",
        ordinal: true,
        tier: "core",
        label: "Messaging tempo",
        options: [
          "When there’s something to say",
          "Every few days",
          "Daily check-ins",
          "A running conversation all day"
        ]
      },
      {
        id: "cn.alone",
        type: "choice",
        ordinal: true,
        label: "Alone time I need",
        options: [
          "A little",
          "A moderate amount",
          "A lot"
        ]
      },
      {
        id: "cn.social",
        type: "choice",
        label: "My social sweet spot",
        options: [
          "Big groups & parties",
          "Small gatherings",
          "One-on-one",
          "Mostly online"
        ]
      },
      {
        id: "cn.repair",
        type: "scale",
        left: "I need space before repair",
        right: "I want to repair right away"
      },
      {
        id: "cn.direct",
        type: "scale",
        left: "I hint and soften",
        right: "I say it plainly"
      },
      {
        id: "cn.close",
        type: "scale",
        left: "Closeness can feel crowding",
        right: "Closeness feels like home"
      }
    ]
  },
  {
    id: "structure",
    title: "Structure & agreements",
    privacy: "open",
    blurb: "Especially useful for non-monogamous folks — but everyone has a structure, even if it’s \"just us two.\"",
    items: [
      {
        id: "st.ideal",
        type: "multi",
        label: "Structures that could work for me",
        options: [
          "Monogamy",
          "Monogamish",
          "Hierarchical polyamory",
          "Non-hierarchical polyamory",
          "Relationship anarchy",
          "Open relationship",
          "Swinging / play partners",
          "Solo & dating",
          "Still figuring it out"
        ]
      },
      {
        id: "st.meta",
        type: "choice",
        label: "Around partners’ other people, I lean…",
        options: [
          "Kitchen table — we can all share a meal",
          "Garden party — friendly at gatherings",
          "Parallel — separate worlds is fine",
          "Varies by relationship",
          "Not applicable to me"
        ]
      },
      {
        id: "st.capacity",
        type: "choice",
        ordinal: true,
        label: "Time & capacity I can offer",
        options: [
          "A few hours here and there",
          "Regular weekly time",
          "Several days a week",
          "Full partnership capacity"
        ]
      },
      {
        id: "st.disclosure",
        type: "choice",
        label: "Disclosure between partners",
        options: [
          "Full transparency",
          "Headlines only",
          "Don’t ask, don’t tell",
          "Negotiated per relationship",
          "Not applicable to me"
        ]
      },
      {
        id: "st.safety",
        type: "choice",
        label: "Safer-intimacy practices",
        options: [
          "Strict barriers & regular testing",
          "Negotiated agreements per partner",
          "Fluid bonded with established partner(s) only",
          "Prefer to discuss in person",
          "Not applicable to me"
        ]
      },
      {
        id: "st.compersion",
        type: "scale",
        left: "Compersion is a stretch",
        right: "Compersion comes naturally"
      },
      {
        id: "st.jealousy",
        type: "scale",
        left: "Jealousy visits often",
        right: "Jealousy is rare for me"
      },
      {
        id: "st.autonomy",
        type: "scale",
        left: "Coordinate calendars closely",
        right: "Fully autonomous scheduling"
      }
    ]
  },
  {
    id: "plans",
    title: "Plans & horizons",
    privacy: "open",
    blurb: "Where life might head — useful for anything long-term, skippable for anything light.",
    items: [
      {
        id: "pl.move",
        type: "choice",
        ordinal: true,
        label: "Would I relocate for a relationship?",
        options: [
          "No — I’m rooted here",
          "Maybe, within my region",
          "Maybe, anywhere",
          "Gladly — home is people"
        ]
      },
      {
        id: "pl.money",
        type: "choice",
        ordinal: true,
        label: "Financial entanglement I’d welcome",
        options: [
          "Fully separate",
          "Shared expenses only",
          "Partly merged",
          "Fully merged"
        ]
      },
      {
        id: "pl.cohabit",
        type: "choice",
        ordinal: true,
        label: "Living together",
        options: [
          "Prefer separate homes",
          "Not for years",
          "Open to it in time",
          "Actively want it"
        ]
      }
    ]
  },
  {
    id: "desires",
    title: "Desires & play",
    privacy: "match",
    optIn: true,
    blurb: "Optional. These answers are never shown in the open — a desire is revealed only when both profiles marked it \"If you are\" or warmer. \"Not for me\" answers are never shared at all, not even in hashed form.",
    items: [
      {
        id: "dp.pda",
        type: "interest",
        label: "Public affection"
      },
      {
        id: "dp.cuddle",
        type: "interest",
        label: "Cuddling & non-sexual touch"
      },
      {
        id: "dp.massage",
        type: "interest",
        label: "Sensual massage"
      },
      {
        id: "dp.talk",
        type: "interest",
        label: "Flirty or dirty talk"
      },
      {
        id: "dp.sext",
        type: "interest",
        label: "Texting spice between meetups"
      },
      {
        id: "dp.dressup",
        type: "interest",
        label: "Lingerie & dressing up"
      },
      {
        id: "dp.roleplay",
        type: "interest",
        label: "Roleplay & fantasy scenarios"
      },
      {
        id: "dp.lightbond",
        type: "interest",
        label: "Light restraints & blindfolds"
      },
      {
        id: "dp.rope",
        type: "interest",
        label: "Rope"
      },
      {
        id: "dp.dom",
        type: "interest",
        label: "Taking the lead (dominant)"
      },
      {
        id: "dp.sub",
        type: "interest",
        label: "Following the lead (submissive)"
      },
      {
        id: "dp.switch",
        type: "interest",
        label: "Switching roles"
      },
      {
        id: "dp.impact",
        type: "interest",
        label: "Impact play (spanking & co.)"
      },
      {
        id: "dp.sensation",
        type: "interest",
        label: "Sensation play (wax, ice, feathers)"
      },
      {
        id: "dp.power",
        type: "interest",
        label: "Ongoing power-exchange dynamics"
      },
      {
        id: "dp.group",
        type: "interest",
        label: "Group play"
      },
      {
        id: "dp.party",
        type: "interest",
        label: "Play parties & club events"
      },
      {
        id: "dp.showoff",
        type: "interest",
        label: "Being watched / watching (private events)"
      },
      {
        id: "dp.watch",
        type: "interest",
        label: "Watching adult content together"
      },
      {
        id: "dp.toys",
        type: "interest",
        label: "Toys"
      },
      {
        id: "dp.tantra",
        type: "interest",
        label: "Tantra & mindful intimacy"
      },
      {
        id: "dp.primal",
        type: "interest",
        label: "Primal play (wrestling, biting)"
      },
      {
        id: "dp.praise",
        type: "interest",
        label: "Praise & adoration"
      },
      {
        id: "dp.aftercare",
        type: "interest",
        label: "Aftercare as a ritual"
      },
      {
        id: "dp.vanilla",
        type: "interest",
        label: "Mostly vanilla, occasional spice"
      }
    ]
  }
] as const;

/**
 * Ids (items and sections) that once existed and were removed in schema v2.
 * They are NEVER reused — the freeze spec enforces this — and the v1→v2
 * payload migration drops or remaps their answers:
 *   ab.name / ab.intro / nt.*  → dropped (free text is gone; the creature is
 *                                the name, weighting replaced must-haves)
 *   ab.pronouns (text)         → mapped to ab.pn (multi) where possible
 *   cn.affection               → copied to cn.give (identical options)
 */
export const RETIRED_ITEM_IDS: readonly string[] = [
  'ab.name',
  'ab.pronouns',
  'ab.intro',
  'cn.affection',
  'nt.musthave',
  'nt.dealbreak',
  'nt.joy',
];

export const RETIRED_SECTION_IDS: readonly string[] = ['notes'];
