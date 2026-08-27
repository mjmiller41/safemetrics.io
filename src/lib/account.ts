/**
 * Client for the authenticated part of the worker API.
 *
 * Every call carries the Clerk session token; the worker derives the tenant from it
 * and refuses anything it does not own, so nothing here passes a user or tenant id.
 */

export interface Account {
  userId: string;
  tenantId: string;
  plan: 'hobby' | 'pro' | 'scale';
  monthlyEventLimit: number;
  domains: string[];
}

export type AddDomainResult =
  | { ok: true; domain: string }
  | { ok: false; message: string };

export async function fetchAccount(token: string): Promise<Account | null> {
  const response = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  return (await response.json()) as Account;
}

export async function addDomain(token: string, domain: string): Promise<AddDomainResult> {
  const response = await fetch('/api/domains', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ domain }),
  });

  const data = await response.json().catch(() => ({}));
  if (response.ok) return { ok: true, domain: (data as any).domain as string };

  if (response.status === 409) {
    return { ok: false, message: 'That domain is already registered to another workspace.' };
  }
  if (response.status === 400) {
    return { ok: false, message: 'That does not look like a domain name.' };
  }
  return { ok: false, message: (data as any).error ?? 'Could not add that domain.' };
}
