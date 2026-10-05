import { Meta } from './meta';

it('should create an instance with INIT state and zero spent via build', () => {
  const meta = Meta.build();

  expect(meta).toBeInstanceOf(Meta);
  expect(meta.state).toBe('INIT');
  expect(meta.spent).toBe(0);
  expect(typeof meta.timestamp).toBe('number');
});

it('should check current state via is', () => {
  const meta = Meta.build();

  expect(meta.is('INIT')).toBe(true);
  expect(meta.is('DONE')).toBe(false);
});

it('should update state and spent via actualize and return the instance', () => {
  const meta = Meta.build();

  expect(meta.actualize('DONE')).toBe(meta);
  expect(meta.state).toBe('DONE');
  expect(meta.spent).toBeGreaterThanOrEqual(0);
});

it('should count spent from the start on repeated actualize', () => {
  jest.useFakeTimers({ now: 0 });

  try {
    const meta = Meta.build().actualize('INIT');

    jest.setSystemTime(500);
    meta.actualize('PENDING');

    jest.setSystemTime(2000);
    meta.actualize('DONE');

    jest.setSystemTime(2003);
    meta.actualize('DONE');

    expect(meta.spent).toBe(2003);
  } finally {
    jest.useRealTimers();
  }
});

it('should serialize to plain object via toPlain', () => {
  const meta = Meta.build().actualize('ERROR');

  expect(meta.toPlain()).toEqual({
    timestamp: meta.timestamp,
    spent: meta.spent,

    state: 'ERROR',
  });
});
