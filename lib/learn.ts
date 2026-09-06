// The /learn articles: evergreen explainers for the queries this audience
// actually types ("how to short a stock in the stock market game", "why do
// stocks drop after they spike"). The head terms — "biggest gainers today" and
// the like — are owned outright by Yahoo Finance, Barchart and StockAnalysis and
// are not winnable; this is the part of the search surface that is.
//
// CONTENT AS DATA, ON PURPOSE. The index page, the sitemap and the article
// renderer all read this array, so adding an article reaches all three at once.
// Inline formatting is limited to [label](/path) links and **bold**, parsed
// into React nodes by components/learn/Prose.tsx — never HTML, so nothing here
// can inject markup.
//
// RULES FOR EDITING, all of which come from constraints already documented
// elsewhere in this repo:
//
//  1. The audience is high-school students and the topic is money — Google
//     treats that as YMYL and holds it to a higher bar. Say what is known, mark
//     what isn't, and never imply a guaranteed outcome.
//  2. DECA and "The Stock Market Game" are used NOMINATIVELY. Zenith is not
//     affiliated with DECA Inc. or the SIFMA Foundation (lib/legal.ts
//     NOT_AFFILIATED), and every article renders <Disclaimer> plus the
//     site-wide <AppFooter> lines.
//  3. NO claim about how Zenith's own theses have performed until the September
//     backtest exists, and then only the one aggregate figure (roadmap). The
//     base rates quoted here are a property of the historical market data, not
//     a track record, and must stay described that way.
//  4. Don't restate the engine's method. /engine is deliberately a statement of
//     what the output is and isn't, not how it is computed
//     (app/engine/page.tsx) — these pages inherit that rule.

export interface LearnSection {
  title: string;
  body: string[];
}

export interface LearnArticle {
  slug: string;
  /** <h1> and the index card. */
  title: string;
  /** <title>; kept short since the layout appends " — Zenith Screener". */
  metaTitle: string;
  description: string;
  eyebrow: string;
  /** One-line standfirst under the title. */
  standfirst: string;
  sections: LearnSection[];
}

export const LEARN_UPDATED = "September 6, 2026";

export const ARTICLES: LearnArticle[] = [
  {
    slug: "how-to-short-a-stock-in-the-stock-market-game",
    title: "How to short a stock in the Stock Market Game",
    metaTitle: "How to short a stock in the Stock Market Game",
    description:
      "Shorting in an end-of-day simulated trading competition: what a short order actually does, when it fills, how the profit and loss work, and what makes it riskier than buying.",
    eyebrow: "Shorting",
    standfirst:
      "What a short position is, how it settles in an end-of-day game, and why the downside works differently from a normal buy.",
    sections: [
      {
        title: "What shorting actually is",
        body: [
          "Buying a stock is a bet that the price goes up. Shorting is the same bet in reverse: you profit if the price goes **down**.",
          "Mechanically, a short sale borrows shares you don't own, sells them at today's price, and commits you to buying them back later to return them. If the price fell in between, you buy back cheaper than you sold and keep the difference. If it rose, you buy back more expensively and the difference is your loss.",
          "In a simulated competition this is compressed into one step. You place a short order, the platform records the price you shorted at, and your position gains value as the stock falls below that price and loses value as it rises above it. You close it with a buy-to-cover order.",
        ],
      },
      {
        title: "When the order actually fills",
        body: [
          "This is the part that catches people out, and it changes what a good idea even looks like.",
          "The Stock Market Game is an **end-of-day** game. An order you place at any point during market hours fills at that day's 4:00 PM ET closing price — not at the price on screen when you clicked. Place it after the close and it fills at the *next* trading day's close.",
          "Two things follow. First, intraday moves you can see are not moves you can trade; only the closing price matters to your fill. Second, orders sit pending and cancelable right up until the close, so there is no earlier cutoff to race — but there is also no way to react to something that happens at 3:59.",
          "It also means research that arrives after the close is a day late. That's the reason [Zenith publishes its daily thesis at about 3:30 PM ET](/engine) rather than after the bell.",
        ],
      },
      {
        title: "Why the risk is not symmetrical",
        body: [
          "A stock you buy can fall to zero. That is a total loss, and it is bounded — you cannot lose more than you put in.",
          "A stock you short can rise without any ceiling. If you short at $4 and it goes to $12, you have lost twice what you would have lost buying it and watching it go to zero. This is the single most important structural fact about short positions, and it is why a short that goes wrong can go wrong quickly.",
          "The specific way this happens is a **short squeeze**: a stock rises, shorts are forced to buy back to close their positions, that buying pushes the price higher, which forces more shorts to cover. Heavily shorted small stocks are where this shows up, and they are also, awkwardly, exactly the stocks that show up on top-gainer lists.",
          "Nothing about a simulation changes the arithmetic. It changes only the consequence of getting it wrong.",
        ],
      },
      {
        title: "What makes a short candidate worth looking at",
        body: [
          "A stock going up is not a reason to short it. Plenty of stocks that rise 30% in a day rise again the next day, because something genuinely changed — an earnings beat, an acquisition, a drug approval.",
          "The setups worth examining are the ones where the size of the move is out of proportion to whatever caused it, or where nothing identifiable caused it at all. A small company with no filing, no news and a 60% move on enormous volume is a different proposition from a profitable company that beat its earnings estimate.",
          "Separating those two is the whole problem, and it is what [Zenith's screener](/screener) and its daily thesis exist to help with. It is not a solved problem, and the [engine page](/engine) is candid about where it gets things wrong.",
        ],
      },
    ],
  },

  {
    slug: "why-stocks-fall-after-a-spike",
    title: "Why stocks often fall after a big one-day spike",
    metaTitle: "Why stocks fall after a big one-day spike",
    description:
      "Mean reversion after large one-day gains: what the historical base rates actually show, why smaller stocks fade more often than large ones, and why a base rate is not a prediction.",
    eyebrow: "Mean reversion",
    standfirst:
      "The pattern behind Zenith's whole premise — what the historical record shows, and the large asterisk that goes with it.",
    sections: [
      {
        title: "The pattern",
        body: [
          "Stocks that post very large one-day gains have historically been more likely to close lower the following session than to close higher. The tendency is real, it is measurable, and it is the premise Zenith is built on.",
          "It is also **much weaker than people assume**, and describing it as a rule rather than a tendency is how students lose simulated portfolios.",
        ],
      },
      {
        title: "Why it happens",
        body: [
          "A few mechanisms overlap, and they don't all apply to every stock.",
          "**The move outruns the news.** A piece of genuine information is worth some amount to a company's value. When a stock moves far more than that amount in one session, a portion of the move is momentum rather than valuation, and momentum has nothing holding it up.",
          "**Short-term buyers take profits.** Much of the volume in a one-day spike comes from traders with a horizon of hours, not years. They sell into the following session.",
          "**Small floats exaggerate everything.** A company with very few tradeable shares can be moved a long way by a modest amount of buying — and moved back just as easily when that buying stops. This is why the effect is strongest in the smallest companies.",
          "**Some spikes have nothing underneath at all.** Promotional campaigns and coordinated buying produce charts that look identical to real news on the day, and behave nothing like it afterwards.",
        ],
      },
      {
        title: "What the numbers look like",
        body: [
          "Zenith groups historical top-gainers by company size and by how unusual the day's volume was, then measures what each group did the next session. Those groupings are what produce the base rate quoted in a thesis and on each [ticker page](/stock).",
          "The honest summary of that data: the fade is more likely than not, the edge is measured in single-digit percentage points of probability rather than certainty, and it is meaningfully stronger for very small companies on abnormal volume than for large established ones.",
          "A rate near 60% means roughly two in five of these setups go the other way. In a competition scored on a handful of trades, two in five is not a rare event — it is something you should expect to happen to you.",
        ],
      },
      {
        title: "Why a base rate is not a prediction",
        body: [
          "A base rate describes a **population**. It says what a large group of similar past situations did on average. It says nothing about which specific stock in front of you belongs to the majority and which to the minority.",
          "This is the distinction that matters most and is missed most often. \"Stocks like this closed lower 60% of the time\" is a fact about history. \"This stock will close lower\" is a claim about the future that no base rate supports.",
          "Companies also genuinely change. An earnings beat, a takeover offer or a drug approval can revalue a business permanently, and a stock that spiked for one of those reasons is not the same animal as one that spiked on nothing. Distinguishing the two is what the [thesis](/engine) attempts, and it does not always get it right.",
        ],
      },
    ],
  },

  {
    slug: "deca-stock-market-game-strategy",
    title: "A strategy primer for the DECA Stock Market Game",
    metaTitle: "DECA Stock Market Game strategy primer",
    description:
      "How the scoring structure of a short simulated trading competition shapes strategy — position sizing, the role of variance, and why the winning approach differs from real investing.",
    eyebrow: "Strategy",
    standfirst:
      "How a short, ranked competition changes what a good decision looks like — and an honest account of how much of the result is luck.",
    sections: [
      {
        title: "The competition is not an investing exercise",
        body: [
          "Real investing is scored on your own absolute outcome over years. A simulated competition is scored on your **rank against other teams over a few weeks or months**. Those two objectives reward different behaviour, and pretending otherwise is the most common strategic mistake.",
          "Coming second by a small margin scores the same as coming last in a competition that only pays the top places. That structure rewards taking more variance than would ever be sensible with real money — and it is worth being explicit that this is a feature of the scoring, not a lesson about markets.",
        ],
      },
      {
        title: "What the end-of-day fill does to your options",
        body: [
          "Because every order fills at the closing price, whole categories of strategy are simply unavailable. You cannot day-trade, you cannot scalp, you cannot set a stop that triggers intraday. The only decision available to you is which positions to hold from one close to the next.",
          "That narrows the game usefully. It means your research question is always the same: **between today's close and some future close, is this more likely to go up or down?** Everything else is noise you cannot act on.",
          "It also means timing your research matters. Anything you learn after 4:00 PM ET applies to tomorrow's close at the earliest.",
        ],
      },
      {
        title: "Position sizing decides your outcome more than stock picking",
        body: [
          "Most teams spend nearly all their effort choosing what to trade and almost none deciding how much. This is backwards.",
          "A portfolio concentrated in one or two positions has a wide range of outcomes: it can finish very high or very low, and which one it does is substantially chance. A portfolio spread across many positions converges toward the average, which in a ranked competition often means finishing in the middle.",
          "Neither is right in the abstract — it depends on whether your scoring rewards winning or rewards not losing. What is wrong is choosing your concentration by accident.",
          "The asymmetry from the [shorting explainer](/learn/how-to-short-a-stock-in-the-stock-market-game) applies here with force: a short that goes badly wrong does more damage than a long that goes badly wrong, so short positions deserve smaller sizes than your instinct suggests.",
        ],
      },
      {
        title: "How much of this is luck",
        body: [
          "Over a small number of trades in a short window, a great deal.",
          "If a setup works 60% of the time and you take ten of them, the most likely single outcome is six wins — but four wins and eight wins are both entirely ordinary results of the same process. You cannot tell a good decision from a lucky one by looking at the result, and over a competition-length sample you often can't tell at all.",
          "The practical consequence: judge your process, not your rank. A team that reasoned carefully and finished mid-table did better work than a team that guessed and won, and only one of those teams learned anything transferable.",
          "This is also why no honest tool will tell you it has an edge you can count on. What [Zenith's engine](/engine) publishes is what comparable past situations did, with the sample size attached, so you can see for yourself how thin the margin is.",
        ],
      },
      {
        title: "Check your own rules",
        body: [
          "Competition rules vary by chapter, by event and by year — which securities are eligible, whether short selling is permitted, margin limits, minimum share prices and transaction costs are all things that differ between versions of the game.",
          "Do not take any of that from a third-party page, this one included. Read the rules you were actually given, and ask your advisor if something is ambiguous.",
        ],
      },
    ],
  },

  {
    slug: "short-selling-glossary",
    title: "A short-selling glossary for the Stock Market Game",
    metaTitle: "Short-selling glossary",
    description:
      "Plain-English definitions of the terms that show up on a top-gainers screener: short interest, short squeeze, relative volume, float, market cap bands, gap up, and more.",
    eyebrow: "Glossary",
    standfirst:
      "The vocabulary you need to read a screener, defined without assuming you already know it.",
    sections: [
      {
        title: "Positions",
        body: [
          "**Long.** You own the stock. You profit if it goes up.",
          "**Short.** You have borrowed and sold stock you don't own. You profit if it goes down, and you must eventually buy it back.",
          "**Cover / buy to cover.** Buying stock back to close a short position.",
          "**Short interest.** How much of a company's tradeable stock is currently sold short, usually given as a percentage. High short interest means many people are already betting against it — which is both a signal that others share your view and a warning that a rise will force a lot of forced buying.",
          "**Short squeeze.** A rise that forces short sellers to buy back, whose buying pushes the price higher, which forces more shorts to buy. The reason a short position can lose a great deal very quickly.",
        ],
      },
      {
        title: "Size and supply",
        body: [
          "**Market cap.** Share price multiplied by the number of shares. The market's price for the whole company. Roughly: **nano-cap** under $50 million, **micro-cap** $50–300 million, **small-cap** $300 million–$2 billion, **mid-cap** above that.",
          "**Float.** The number of shares actually available to trade, which is smaller than the total once you exclude shares locked up by insiders. A small float is why a modest amount of buying can move a stock enormously — and why the move can unwind just as fast.",
          "**Liquidity.** How easily you can trade without moving the price yourself. Thin liquidity makes every other number less reliable.",
        ],
      },
      {
        title: "Movement",
        body: [
          "**Relative volume (RVOL).** Today's trading volume compared with what the stock normally trades. An RVOL of 20 means twenty times the usual activity. This is often more informative than the size of the price move: a big move on normal volume is a different event from a big move on extraordinary volume.",
          "**Gap up.** Opening meaningfully above the previous close, so the price jumped while the market was shut — usually overnight news.",
          "**Mean reversion.** The tendency of an unusually large move to be partly given back afterwards. The premise behind [shorting the day's biggest gainers](/learn/why-stocks-fall-after-a-spike).",
          "**Base rate.** How often something happened across a large sample of similar past situations. A fact about history, not a forecast about the stock in front of you.",
        ],
      },
      {
        title: "Events",
        body: [
          "**Catalyst.** The identifiable thing that caused a move — an earnings report, a contract, an approval, a merger. A spike with a catalyst behaves differently from one without.",
          "**Earnings surprise.** The gap between reported earnings and what analysts expected. A company can report and still disappoint; \"they reported\" and \"they beat\" are different claims.",
          "**Reverse split.** Combining shares to raise the price — a 1-for-10 split turns ten $1 shares into one $10 share. Nothing about the company changed, but naive data feeds can render it as an enormous one-day gain.",
          "**Halt.** Trading is suspended, usually for volatility or pending news. A halted stock can report identical prices day after day, which is why a screener has to filter them out rather than treat them as fresh movers.",
        ],
      },
    ],
  },

  {
    slug: "how-trades-fill-in-the-stock-market-game",
    title: "How orders fill in the Stock Market Game",
    metaTitle: "How orders fill in the Stock Market Game",
    description:
      "The end-of-day execution model: when an order placed during market hours actually fills, what happens to orders placed after the close, and why it changes how research should be timed.",
    eyebrow: "Mechanics",
    standfirst:
      "An orientation to end-of-day execution — and a clear note about which details you must check against your own rules.",
    sections: [
      {
        title: "End-of-day execution",
        body: [
          "The Stock Market Game settles orders at closing prices rather than live ones. An order entered while the market is open fills at that session's 4:00 PM ET close. An order entered after the close fills at the next trading day's close.",
          "Until the close arrives, orders sit pending and can be cancelled. There is no earlier deadline to beat.",
        ],
      },
      {
        title: "What this changes",
        body: [
          "**The price you see is not the price you get.** A stock up 40% at 11:00 AM may be up 12% at the close, and 12% is your number. Reacting to an intraday chart is reacting to information you cannot trade on.",
          "**Only the regular session matters.** Pre-market and after-hours moves affect where the next close lands, but you never transact in them.",
          "**Research has a deadline.** Anything that reaches you after 4:00 PM ET applies to tomorrow's close at the earliest. This is the entire reason [Zenith's daily thesis lands around 3:30 PM ET](/engine) — late enough to reflect the session, early enough to still act on.",
          "**Slippage and spreads mostly disappear.** Everyone gets the same closing price, so execution skill is removed from the game and the decision is purely directional.",
        ],
      },
      {
        title: "What you must check yourself",
        body: [
          "This page describes the end-of-day model in general terms. It does not describe **your** competition's specific rules, and those vary by chapter, event and year.",
          "Whether short selling is allowed at all, which securities are eligible, minimum share prices, commission and margin treatment, and how the ranking is calculated are all things that differ between versions of the game and change between years.",
          "Get them from the official rules you were issued and from your advisor. Zenith is not affiliated with DECA Inc. or the SIFMA Foundation and is not a source of truth about their rules.",
        ],
      },
    ],
  },

  {
    slug: "sifma-and-deca-stock-market-game",
    title: "The SIFMA Foundation, DECA, and the Stock Market Game",
    metaTitle: "SIFMA Foundation vs DECA: the Stock Market Game",
    description:
      "Who runs the Stock Market Game, how DECA's competitive event relates to it, and why the two names are used almost interchangeably by students.",
    eyebrow: "Orientation",
    standfirst:
      "Two organisations, one simulation, and a naming overlap that confuses nearly everyone who searches for it.",
    sections: [
      {
        title: "Two names, one simulation",
        body: [
          "**The Stock Market Game™** is an educational programme of the **SIFMA Foundation**. It gives students a simulated portfolio and lets them trade real securities at real prices without real money.",
          "**DECA** is a separate organisation — a career and technical student organisation for students interested in marketing, finance, hospitality and management. DECA runs a competitive event built on the Stock Market Game simulation.",
          "So a DECA competitor is usually playing the SIFMA Foundation's simulation inside DECA's competitive structure. That is why the two names get used interchangeably, and why searching for one turns up the other.",
        ],
      },
      {
        title: "Which one's rules apply to you",
        body: [
          "Both, in different respects — the simulation's mechanics come from the platform, and the competitive structure comes from the event you entered.",
          "The practical answer is that the rules document you were given is the one that governs you, and your advisor is the person who can resolve any conflict between the two. Specifics differ by chapter, by event and by year.",
        ],
      },
      {
        title: "Where Zenith fits",
        body: [
          "It doesn't, formally. **Zenith is not affiliated with, endorsed by, or connected to DECA Inc. or the SIFMA Foundation.** It is an independent research tool that happens to be built for the way this particular simulation works — end-of-day fills, a focus on the regular session, and a daily thesis timed to land before the close.",
          "Using it is like reading a finance site before placing a trade. You still place your own trades in the official platform, and whether outside research tools are permitted is a question for your own event's rules.",
        ],
      },
    ],
  },
];

export function articleBySlug(slug: string): LearnArticle | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
