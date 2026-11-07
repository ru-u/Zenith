/**
 * How many rows of a session the board shows — the screener table and every
 * /history date render this many. Plain data, no imports, so client components
 * can share it with the server.
 *
 * It is also the definition of "made the board" for the Pro ticker lookup
 * (lib/tickerHistory.ts): a ticker counts on a session only if it lands inside
 * these rows after read-path cleaning, so every result the lookup returns is a
 * row the reader can click through to and find on that date's board.
 */
export const BOARD_ROWS = 50;
