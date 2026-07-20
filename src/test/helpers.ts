import { waitFor } from '@testing-library/react';
import { getStoreState } from './store';

export async function waitForStore(
  predicate: () => boolean,
  timeout = 8_000,
): Promise<void> {
  await waitFor(predicate, { timeout });
}

export async function waitForConnected(timeout = 8_000): Promise<void> {
  await waitFor(() => getStoreState().isConnected, { timeout });
}

export async function waitForDisconnected(timeout = 8_000): Promise<void> {
  await waitFor(() => !getStoreState().isConnected, { timeout });
}