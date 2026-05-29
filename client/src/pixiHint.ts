import { Application, Text } from "pixi.js";

export async function bootPixiHint(): Promise<void> {
  const pixiApp = new Application();
  await pixiApp.init({ width: 1, height: 1, backgroundAlpha: 0 });
  const txt = new Text({ text: "AATE", style: { fill: 0xffffff, fontSize: 1 } });
  pixiApp.stage.addChild(txt);
}
