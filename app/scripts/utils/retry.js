/* eslint-disable no-console */
/* eslint-disable no-plusplus */
function retry(fn, retries = 3, delay = 1000) {
  let success = false;
  let remainingAttempts = retries;
  let result;

  try {
    result = fn();
    success = true;
  } catch (e) {
    console.error({
      retry: {
        fn: fn.name,
        error: e,
        remainingAttempts: retries,
      },
    });

    if (remainingAttempts <= 0) {
      return e;
    }
  }

  return success ? result : setTimeout(retry.bind(this, fn, --remainingAttempts, delay), delay);
}

module.exports = retry;
