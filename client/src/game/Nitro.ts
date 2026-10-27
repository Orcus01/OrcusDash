/** A two-second tank, eight-second refill, and release-to-rearm after empty. */
export class Nitro {
  fuel = 1;
  active = false;
  private exhausted = false;

  reset() { this.fuel = 1; this.active = false; this.exhausted = false; }
  reward(amount: number) { this.fuel = Math.min(1, this.fuel + amount); }

  step(dt: number, held: boolean, canDrive: boolean) {
    if (!held) this.exhausted = false;
    this.active = canDrive && held && !this.exhausted && this.fuel > 0;
    if (this.active) {
      this.fuel = Math.max(0, this.fuel - dt / 2);
      if (this.fuel === 0) this.exhausted = true;
    } else if (canDrive) this.fuel = Math.min(1, this.fuel + dt / 8);
  }
}
