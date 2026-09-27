import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports that the API is up', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });
});
