import { assertResetAllowed } from './demo-data';

describe('assertResetAllowed (the demo:reset guard)', () => {
  it('allows the reset only with DEMO_RESET=yes', () => {
    expect(() => assertResetAllowed({ DEMO_RESET: 'yes' })).not.toThrow();
  });

  it('refuses without DEMO_RESET, or with any other value', () => {
    expect(() => assertResetAllowed({})).toThrow(/DEMO_RESET=yes/);
    expect(() => assertResetAllowed({ DEMO_RESET: 'YES' })).toThrow();
    expect(() => assertResetAllowed({ DEMO_RESET: 'true' })).toThrow();
    expect(() => assertResetAllowed({ DEMO_RESET: '' })).toThrow();
  });
});
