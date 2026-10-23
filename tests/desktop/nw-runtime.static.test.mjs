import { describe, expect, it } from 'vitest';
import { isRetryableNwSpawnError, tasklistShowsNw } from '../../scripts/nw-runtime.mjs';

describe('NW.js Windows spawn helpers', () => {
  it('treats UNKNOWN/EPERM after taskkill as retryable', () => {
    expect(isRetryableNwSpawnError({ code: 'UNKNOWN' })).toBe(true);
    expect(isRetryableNwSpawnError({ code: 'EPERM' })).toBe(true);
    expect(isRetryableNwSpawnError({ code: 'ENOENT' })).toBe(false);
    expect(isRetryableNwSpawnError(new Error('fail'))).toBe(false);
  });

  it('detects nw.exe in tasklist /NH output', () => {
    expect(tasklistShowsNw('nw.exe                     1234 Console                    1     80,000 K')).toBe(true);
    expect(tasklistShowsNw('INFO: No tasks are running which match the specified criteria.')).toBe(false);
    expect(tasklistShowsNw('notepad.exe                99 Console                    1      1,000 K')).toBe(false);
  });
});
