import { describe, expect, it } from 'vitest';
import { Nitro } from '../src/game/Nitro';

describe('nitro tank', () => {
  it('gives two seconds of continuous boost and recharges over eight seconds', () => {
    const n = new Nitro();
    n.step(1,true,true); expect(n.active).toBe(true); expect(n.fuel).toBe(.5);
    n.step(1,true,true); expect(n.fuel).toBe(0);
    n.step(4,false,true); expect(n.fuel).toBe(.5); expect(n.active).toBe(false);
    n.step(4,false,true); expect(n.fuel).toBe(1);
  });
  it('does not pulse boost repeatedly when held after emptying', () => {
    const n = new Nitro(); n.step(2,true,true);
    for(let i=0;i<60;i++){n.step(1/60,true,true);expect(n.active).toBe(false);}
    n.step(.01,false,true); n.step(.01,true,true); expect(n.active).toBe(true);
  });
  it('freezes recharge and stops boost while controls are disabled', () => {
    const n = new Nitro(); n.step(1,true,true); n.step(10,true,false);
    expect(n.fuel).toBe(.5); expect(n.active).toBe(false);
  });
  it('caps stunt and KO rewards and restores a fresh tank on respawn', () => {
    const n = new Nitro(); n.step(1,true,true);n.reward(.25);expect(n.fuel).toBe(.75);
    n.reward(.4);expect(n.fuel).toBe(1);n.step(2,true,true);n.reset();
    expect(n.fuel).toBe(1); n.step(.1,true,true);expect(n.active).toBe(true);
  });
});
