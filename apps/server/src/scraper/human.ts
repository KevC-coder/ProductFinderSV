import type { Page } from 'playwright-core';

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const randInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));

/** Pausa aleatoria entre min y max milisegundos. */
export const pause = (minMs: number, maxMs: number) => sleep(randInt(minMs, maxMs));

/** Scroll en varios pasos cortos con la rueda del mouse, como lo haría una persona. */
export async function humanScroll(page: Page): Promise<void> {
  const steps = randInt(3, 6);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, randInt(250, 600));
    await pause(120, 400);
  }
}
