/**
 * 各页面新手引导的内容与顺序。
 *
 * 每个「场景」(TourScene) 对应一个页面/步骤，进入该页面时如果还没看过就自动播放。
 * 只写数据，不含任何 DOM 逻辑 —— 渲染与定位都在 Tour.tsx 里。
 */

import type { TourSceneId } from "../../types/domain";

export type Placement = "top" | "bottom" | "left" | "right" | "center";

export interface TourStep {
  /** 高亮目标的 CSS 选择器。留空则居中显示，不挖洞。 */
  target?: string;
  /** 气泡相对目标的方向，默认自动选择。 */
  placement?: Placement;
  /** 高亮框的额外内边距，默认 8px。 */
  pad?: number;
  /**
   * 允许用户真的点到被高亮的控件（默认整层拦住点击，只能靠按钮推进）。
   * 语言切换那一步必须开着，否则看不懂中文的人被卡在第一步。
   */
  interactive?: boolean;
  zh: { title: string; body: string };
  en: { title: string; body: string };
}

export interface TourScene {
  id: TourSceneId;
  /** 最后一步按钮的文案；不填用默认的「完成」。 */
  finishLabel?: { zh: string; en: string };
  steps: TourStep[];
}

const scenes: Record<TourSceneId, TourScene> = {
  /* ── 1. 星空大厅 ───────────────────────────────────────────── */
  starLobby: {
    id: "starLobby",
    finishLabel: { zh: "开始逛逛 ✦", en: "Start exploring ✦" },
    steps: [
      {
        placement: "center",
        zh: {
          title: "欢迎来到 StoryVerse ✦",
          body: "这里是星空大厅 —— 每一颗星，都是某个真实的人写下的一段经历。\n\n花一分钟，我带你认识一下这片星空。随时可以按 Esc 跳过。",
        },
        en: {
          title: "Welcome to StoryVerse ✦",
          body: "This is the Star Lobby — every star out there is a real experience, written by a real person.\n\nGive me a minute and I'll show you around. Press Esc to skip anytime.",
        },
      },
      {
        target: ".bottom-legend",
        placement: "top",
        zh: {
          title: "怎么读这片星空",
          body: "星点不是随便撒的：\n\n· 大小 —— 故事写得越长，星越大\n· 颜色 —— 对应不同的类型\n· 距离 —— 表示故事发生城市与你最近一篇公开故事的地理远近\n\n点任意一颗，就能读到那个故事。",
        },
        en: {
          title: "How to read the sky",
          body: "The stars aren't scattered at random:\n\n· Size — longer stories shine bigger\n· Colour — different story types\n· Distance — geographic distance from the city in your latest published story\n\nClick any star to read it.",
        },
      },
      {
        target: "[data-tour='top-controls']",
        placement: "bottom",
        zh: {
          title: "旁边还有两个",
          body: "左边那颗月亮切白天 / 夜晚主题，右边的放大镜用来搜索特定的故事。",
        },
        en: {
          title: "Two more up here",
          body: "The moon on the left flips between day and night themes; the magnifier on the right searches for specific stories.",
        },
      },
      {
        target: "[data-tour='nav-explore']",
        placement: "top",
        zh: { title: "探索故事", body: "默认视角。整片星空都在这里，适合漫无目的地逛一逛。" },
        en: {
          title: "Explore",
          body: "The default view. The whole sky, best for wandering with no particular destination.",
        },
      },
      {
        target: "[data-tour='nav-owned']",
        placement: "top",
        zh: { title: "我的故事", body: "只留下你自己写的那些星。刚刚点亮的故事，也会出现在这里。" },
        en: {
          title: "My stories",
          body: "Only the stars you wrote. The story you just lit up will be waiting here too.",
        },
      },
      {
        target: "[data-tour='nav-resonance']",
        placement: "top",
        interactive: true,
        // 文案要短：点开后「调整属性」浮窗停在屏幕正中，卡片一高就会压住它，
        // 用户反而看不到自己点出来的东西。压到两行以内正好落在浮窗下方。
        zh: {
          title: "共鸣偏好 —— 点开看看",
          body: "按城市、人生背景、主题，决定你想看到相近还是不同的故事。",
        },
        en: {
          title: "Preferences — open it",
          body: "By city, life background and theme: stories close to yours, or different from it.",
        },
      },
      {
        target: "[data-tour='nav-liked']",
        placement: "top",
        zh: { title: "喜欢记录", body: "读到戳中你的故事，点个喜欢，它就会留在这里。" },
        en: { title: "Liked", body: "When a story lands, hit like — it'll be waiting here for you." },
      },
      {
        target: "[data-tour='account-dock']",
        placement: "right",
        zh: {
          title: "消息与账户",
          body: "故事完成内容确认、需要修改或被下架时，结果都会出现在这里的收件箱。\n\n引导到这里就结束啦 —— 星空是你的了 🎉",
        },
        en: {
          title: "Messages & account",
          body: "When content review is complete, changes are requested, or a story is taken down, the notice lands here.\n\nThat's the end of the tour — the sky is yours 🎉",
        },
      },
    ],
  },

  /* ── 2. 向导第一步：选择引导 ────────────────────────────────── */
  guide: {
    id: "guide",
    finishLabel: { zh: "我挑一个", en: "Let me pick one" },
    steps: [
      /*
       * 语言放在整条引导的最开头，而且两种语言的文案写在同一张卡上 ——
       * 读不懂中文的人，正是最需要看懂这一步的人。interactive 让用户真的按得到按钮。
       */
      {
        target: ".app-lang-button",
        placement: "bottom",
        interactive: true,
        zh: {
          title: "先选语言 · Choose your language",
          body: "点右上角这个按钮，可以在 中文 和 English 之间切换。整个引导会跟着一起换。\n\nTap the button up here to switch between 中文 and English. This tour follows your choice.\n\n选好了就继续 · Continue when you're set.",
        },
        en: {
          title: "Choose your language · 先选语言",
          body: "Tap the button up here to switch between English and 中文. The whole tour follows your choice.\n\n点右上角这个按钮，可以在 English 和 中文 之间切换，整个引导会跟着一起换。\n\nContinue when you're set · 选好了就继续。",
        },
      },
      {
        target: ".guide-panels",
        placement: "bottom",
        interactive: true,
        zh: {
          title: "第一步：先找个入口",
          body: "空白页最难写。所以我们不从空白开始 —— 先挑一个「切口」，让记忆有地方落脚。\n\n这里有关于选择、联结、艰难经历、意外转折、自我理解与释怀的入口；如果都不合适，也可以自己写一个。\n\n现在可以直接点开看看，随便翻。",
        },
        en: {
          title: "Step one: find a way in",
          body: "Blank pages are the hardest. So we don't start blank — pick a doorway and give the memory somewhere to land.\n\nThere are openings about choice, connection, difficult experiences, unexpected turns, self-understanding and closure. If none fit, write your own.\n\nGo ahead and click around.",
        },
      },
      {
        target: ".stack-actions",
        placement: "top",
        zh: {
          title: "选好就继续",
          body: "这些入口都看过了。挑一张你真正想写的 —— 点卡片就能换，下面这条会告诉你当前选的是哪个。",
        },
        en: {
          title: "Then continue",
          body: "That's every entry point. Pick the one you actually want to write — click any card to switch; this bar always shows your selection.",
        },
      },
    ],
  },

  /* ── 3. 向导第二步：写故事 ─────────────────────────────────── */
  collection: {
    id: "collection",
    finishLabel: { zh: "开始写 ✎", en: "Start writing ✎" },
    steps: [
      {
        placement: "center",
        zh: {
          title: "来吧，我们写一个故事 ✎",
          body: "不用一开始就顾虑格式，也没有人会打分。\n\n想到哪写到哪，提交前整理到 100–1500 字就好。",
        },
        en: {
          title: "Alright — let's write one ✎",
          body: "Do not worry about format while you begin. Nobody is grading this.\n\nWrite freely, then shape it to 100–1,500 characters before submitting.",
        },
      },
    ],
  },

  /* ── 4. 向导第四步：确认发布 ───────────────────────────────── */
  confirm: {
    id: "confirm",
    finishLabel: { zh: "明白了", en: "Got it" },
    steps: [
      {
        placement: "center",
        zh: {
          title: "最终解释权在你 ✋",
          body: "AI 刚才做的是整理，不是改写。下面每一样，你都可以推翻。",
        },
        en: {
          title: "The final say is yours ✋",
          body: "What the AI just did was organise, not rewrite. Every single thing below can be overruled by you.",
        },
      },
      {
        target: ".compact-edit-grid",
        placement: "bottom",
        zh: {
          title: "信息可以改，正文也可以改",
          body: "标题、地点、年龄、性别、人生阶段都可以在这里确认或修改。\n\n正文也一样：点下面的「修改正文」就能回到编辑状态，补一段、删一句都行。",
        },
        en: {
          title: "Fix the details — and the story",
          body: 'Title, place, age, gender, and life stage can all be confirmed or edited here.\n\nThe story itself is editable too: select "Edit body" to add a paragraph or cut a line.',
        },
      },
      {
        target: ".tag-editor-head",
        placement: "left",
        zh: {
          title: "标签：情感 · 类型 · 主题",
          body: "AI 给的是建议，你可以按自己的理解修改。情感最多 2 个、类型 1 个，主题必须保留 2 个且不能重复。\n\n这些标签会参与故事分类和推荐。",
        },
        en: {
          title: "Tags: emotion · type · theme",
          body: "AI suggestions are editable. Keep up to 2 emotions, 1 type, and exactly 2 different themes.\n\nThese tags help classify and recommend stories.",
        },
      },
      {
        target: ".image-style-picker",
        placement: "left",
        zh: {
          title: "先挑一种画风",
          body: "3D粘土、独立杂志、复古拼贴 —— 生成前选择其中一种。\n\n鼠标悬停就能看示意图；每个故事只保留一张最终图片。",
        },
        en: {
          title: "Pick a look first",
          body: "Choose 3D clay, indie zine, or retro collage before generating.\n\nHover to preview each style. Every story keeps one final image.",
        },
      },
      {
        target: ".comic-preview",
        placement: "left",
        zh: {
          title: "把故事画成一张图",
          body: "图片是可选项。AI 会结合标题、地点、人物信息、主题和正文，选择一个真实瞬间，再按你选的风格画成一张可以下载的图。\n\n生成需要一点时间，开始前请确认画风。",
        },
        en: {
          title: "Turn it into a picture",
          body: "Images are optional. AI uses the title, place, character details, themes, and story to select one real moment and illustrate it in your chosen style.\n\nGeneration takes a moment, so confirm the style first.",
        },
      },
      {
        target: ".publish-note",
        placement: "top",
        zh: {
          title: "确认后就点亮",
          body: "故事会以你的昵称公开，登录账号不会展示。确认之后，它就会成为星空里真正的一颗星。",
        },
        en: {
          title: "Then light it up",
          body: "The story is shared under your nickname; your login username is not shown. Once confirmed, it becomes a real star in the sky.",
        },
      },
    ],
  },

  /* ── 5. 共鸣设置 ───────────────────────────────────────────── */
  resonance: {
    id: "resonance",
    finishLabel: { zh: "带我去看看 ✦", en: "Take me there ✦" },
    steps: [
      {
        placement: "center",
        zh: {
          title: "你的星星亮了 ✦",
          body: "故事已经发布。最后一件事：告诉我们，接下来你想听见什么样的回声。",
        },
        en: {
          title: "Your star is lit ✦",
          body: "The story is published. One last thing: tell us what kind of echoes you want to hear next.",
        },
      },
      {
        target: ".dimension-grid",
        placement: "top",
        zh: {
          title: "三个维度，各选一边",
          body: "· 城市 —— 相近的生活语境，还是另一座城的经验\n· 人生背景 —— 综合年龄、人生阶段和性别\n· 主题 —— 熟悉的议题继续深入，还是换扇门\n\n没有对错，只是你现在想要什么。",
        },
        en: {
          title: "Three dimensions, pick a side",
          body: "· City — a familiar context, or life in another city\n· Life background — a combination of age, life stage, and gender\n· Theme — go deeper where it's familiar, or open a new door\n\nNo wrong answers. Just what you want right now.",
        },
      },
      {
        target: ".resonance-action",
        placement: "top",
        zh: {
          title: "就到这里啦 🎉",
          body: "引导结束。这些设置随时能在星空大厅的「共鸣偏好」里改。\n\n它们会影响推荐顺序；星点到中心的距离始终只表示真实地理远近。",
        },
        en: {
          title: "And that's the tour 🎉",
          body: "You're all set. You can change these options later under “Preferences” in the Star Lobby.\n\nThey affect recommendation order; distance from the centre always represents geography.",
        },
      },
    ],
  },
};

export function getScene(id: TourSceneId): TourScene {
  return scenes[id];
}

export const tourCopy = {
  // 「跳过」只跳过当前这一页，后面的页面照常有引导
  zh: { skip: "跳过本页", next: "下一步", back: "上一步", done: "完成", of: "/" },
  en: { skip: "Skip this page", next: "Next", back: "Back", done: "Done", of: "/" },
};
