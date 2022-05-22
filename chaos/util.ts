import { MessageEmbed } from "discord.js";

// click for free catboy pics
// https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2F68.media.tumblr.com%2Ff7b9610c855d3382412c769648c17f43%2Ftumblr_oriokxsJIO1v6k268o1_500.png&f=1&nofb=1

export type FixedArray<N extends number, T> = T[] & { length: N };

/**
 * Creates a new {MessageEmbed} with a random color.
 */
export function embedTemplate(): MessageEmbed {
  return new MessageEmbed().setColor("RANDOM");
}

/**
 * Creates a generator of a range of numbers from 0 to {to}.
 *
 * @param to The maximum number to generate.
 * @returns A generator of numbers from 0 to {to}.
 */
export function* range(to: number): Generator<number> {
  for (let index = 0; to > index; index++) yield index;
}

/**
 * Creates a generator of two numbers from 0 to {coords}.
 *
 * @param coords The maximum numbers to generate.
 * @returns A generator of numbers from 0 to {coords}.
 */
export function* range2d(
  coords: [number, number]
): Generator<[number, number]> {
  const [x, y] = coords;

  for (let xIndex of range(x))
    for (let yIndex of range(y)) yield [xIndex, yIndex];
}

/**
 * Determines if a two dimensional array has four of any of {elements} in a row.
 *
 * @template T The type of elements in the array.
 * @template W The width of the two dimensional array.
 * @template H The height of the two dimensional array.
 * @param array The two dimensional array to check.
 * @param elements The elements to check for.
 * @returns True if the array has four of any of {elements} in a row.
 */
export function checkFourInARow<T, W extends number, H extends number>(
  array: FixedArray<W, FixedArray<H, T>>,
  elements: T[]
): boolean {
  const [w, h] = [array.length, (array[0] ?? []).length];

  function check(x: number, y: number): boolean {
    return elements.includes(array[x][y]);
  }

  // --x-
  // --x-
  // --x-
  // --x-

  // Downwards
  for (let [x, y] of range2d([w, h - 3]))
    if (check(x, y + 3) && check(x, y + 2) && check(x, y + 1) && check(x, y))
      return true;

  // ----
  // ----
  // xxxx
  // ----

  // Rightwards
  for (let [x, y] of range2d([w - 3, h]))
    if (check(x + 3, y) && check(x + 2, y) && check(x + 1, y) && check(x, y))
      return true;

  // Diagnonal
  for (let [x, y] of range2d([w - 3, h - 3])) {
    // ---x
    // --x-
    // -x--
    // x---

    if (
      check(x + 3, y + 3) &&
      check(x + 2, y + 2) &&
      check(x + 1, y + 1) &&
      check(x, y)
    )
      return true;

    // x---
    // -x--
    // --x-
    // ---x

    if (
      check(x + 3, y) &&
      check(x + 2, y + 1) &&
      check(x + 1, y + 2) &&
      check(x, y + 3)
    )
      return true;
  }

  return false;
}

/**
 * Creates a random number between {min} and {max}.
 *
 * @param min The minimum number to generate.
 * @param max The maximum number to generate.
 * @returns A random number between {min} and {max}.
 */
export function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sleeps for {ms} milliseconds.
 *
 * @param ms The number of milliseconds to sleep for.
 * @returns A promise that resolves after {ms} milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  // very useful
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a promise that resolves after a registered callback is called. This
 * is useful for flattening control flow when using onetime callbacks.
 *
 * # Example
 * ```js
 * # import HTTP from "http";
 * #
 * # async function main() {
 * const response = await singleCallback(
 *  callback => HTTP.get("https://example.com", callback));
 * if (response.statusCode >= 300 || response.statusCode < 200)
 *  throw new Error("HTTP error");
 * # }
 * #
 * # main();
 * ```
 */
export async function singleCallback<T>(
  builder: (callback: (result: T) => void) => T
): Promise<T> {
  return await new Promise(builder);
}

/**
 * Creates an asynchronous generator from registering a callback. The generator
 * dynamically balances callback fires and yields so that all callbacks are
 * eventually yielded. This is useful for implementing generators that need to
 * yield a value from within a callback, because this generator flattens the
 * control flow.
 *
 * # Example
 * ```js
 * # import WebSocket from "ws";
 * #
 * # async function main() {
 * #  const websocket = new WebSocket("wss://ws.postman-echo.com/raw");
 * const generator = multipleCallback(
 *  callback => websocket.onmessage = callback);
 * for await (const message of generator) {
 *  console.log(message);
 * }
 * # }
 * #
 * # main();
 * ```
 */
export async function* multipleCallback<T>(
  builder: (callback: (result: T) => void) => void
): AsyncGenerator<T> {
  type Push = { type: "push"; value: T };
  type Pull = { type: "pull"; value: (item: T) => void };
  type Request = Push | Pull;

  // This buffer either contains "push" requests or "pull" requests. Push
  // requests are made when the callback is called and the generator has not
  // been called upon yet. Pull requests are made when the generator is called
  // upon and the callback has not been called yet.
  const buffer: Request[] = [];

  // Callback logic.
  builder((item) => {
    // If there is a pull request, satisfy it.
    if (buffer[0] != undefined && buffer[0].type == "pull")
      (buffer.shift()! as Pull).value(item);
    // Otherwise, make a push request.
    else buffer.push({ type: "push", value: item });
  });

  // Generator logic.
  while (true) {
    yield await new Promise((resolve) => {
      // If there is a push request, satisfy it.
      if (buffer[0] != undefined && buffer[0].type == "push")
        resolve((buffer.shift()! as Push).value);
      // Otherwise, make a pull request.
      else buffer.push({ type: "pull", value: resolve });
    });
  }
}

/**
 * Creates a promise that never returns.
 */
export function never(): Promise<never> {
  return new Promise(() => {});
}
