// Records one or more Playwright pages into a single H.264 file.
//
// Frames come from the Chrome DevTools screencast and are written to ffmpeg at a constant
// frame rate (the newest frame is repeated until the page paints again). `use(page)` switches
// the source, so a second browser (e.g. a teammate) can appear in the same video.

import { spawn } from "node:child_process";

export class Recorder {
  constructor(file, { fps = 25, width, height, crf = 16 } = {}) {
    this.fps = fps;
    this.frame = null;
    this.written = 0;
    this.session = null;
    this.ffmpeg = spawn(
      "ffmpeg",
      [
        "-loglevel", "error", "-y",
        "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "pipe:0",
        "-vf", `scale=${width}:${height}:flags=lanczos,format=yuv420p`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-r", String(fps),
        file,
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    this.done = new Promise((resolve, reject) => {
      this.ffmpeg.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
    });
  }

  /** Start (or switch) recording from this page. */
  async use(page) {
    if (this.session) {
      await this.session.send("Page.stopScreencast").catch(() => {});
      await this.session.detach().catch(() => {});
    }
    const session = await page.context().newCDPSession(page);
    this.session = session;
    session.on("Page.screencastFrame", ({ data, sessionId }) => {
      if (this.session === session) this.frame = Buffer.from(data, "base64");
      session.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    const vp = page.viewportSize();
    const scale = await page.evaluate(() => window.devicePixelRatio);
    await session.send("Page.startScreencast", {
      format: "jpeg",
      quality: 92,
      maxWidth: Math.round(vp.width * scale),
      maxHeight: Math.round(vp.height * scale),
      everyNthFrame: 1,
    });
    if (!this.timer) this.start();
  }

  start() {
    this.t0 = performance.now();
    this.timer = setInterval(() => this.tick(), 1000 / this.fps / 2);
  }

  tick() {
    if (!this.frame || this.paused) return;
    const due = Math.floor(((performance.now() - this.t0) / 1000) * this.fps);
    while (this.written < due) {
      this.ffmpeg.stdin.write(this.frame);
      this.written++;
    }
  }

  /** Stop the clock (time spent paused is cut from the video). */
  pause() {
    this.tick();
    this.paused = performance.now();
  }

  resume() {
    if (!this.paused) return;
    this.t0 += performance.now() - this.paused;
    this.paused = null;
  }

  get seconds() {
    return this.written / this.fps;
  }

  async stop() {
    this.tick();
    clearInterval(this.timer);
    await this.session?.send("Page.stopScreencast").catch(() => {});
    this.ffmpeg.stdin.end();
    await this.done;
  }
}
