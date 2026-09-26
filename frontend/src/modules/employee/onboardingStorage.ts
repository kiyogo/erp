export type EmployeeOnboardingStorage = {
  done: string;
  step: string;
  data: string;
};

const KEY_PREFIX = 'kiyovn_profile_wizard_v4';

/**
 * Onboarding belongs to an authenticated account.
 * Scopes by user ID, user email, or fallback to ensure stability across re-logins.
 */
export function getEmployeeOnboardingStorage(userOrId?: string | { id?: string | number; email?: string } | null): EmployeeOnboardingStorage {
  let scope = 'unauthenticated';
  if (typeof userOrId === 'string' && userOrId.trim()) {
    scope = userOrId.trim();
  } else if (userOrId && typeof userOrId === 'object') {
    scope = String(userOrId.email || userOrId.id || 'unauthenticated').trim();
  }
  const cleanScope = encodeURIComponent(scope.toLowerCase());
  return {
    done: `${KEY_PREFIX}:${cleanScope}:done`,
    step: `${KEY_PREFIX}:${cleanScope}:step`,
    data: `${KEY_PREFIX}:${cleanScope}:data`,
  };
}

export function isEmployeeOnboardingComplete(
  storage: EmployeeOnboardingStorage,
  user?: { id?: string | number; email?: string } | null,
  profile?: any
): boolean {
  try {
    // 1. Direct storage key check
    if (localStorage.getItem(storage.done) === 'true') return true;

    // 2. Check by user email or id scopes
    if (user?.email) {
      const emailScope = encodeURIComponent(user.email.trim().toLowerCase());
      if (localStorage.getItem(`${KEY_PREFIX}:${emailScope}:done`) === 'true') {
        try { localStorage.setItem(storage.done, 'true'); } catch {}
        return true;
      }
    }
    if (user?.id) {
      const idScope = encodeURIComponent(String(user.id).trim().toLowerCase());
      if (localStorage.getItem(`${KEY_PREFIX}:${idScope}:done`) === 'true') {
        try { localStorage.setItem(storage.done, 'true'); } catch {}
        return true;
      }
    }

    // 3. Fallback generic stored user check
    const rawStoredUser = localStorage.getItem('minepanel_user');
    if (rawStoredUser) {
      try {
        const parsed = JSON.parse(rawStoredUser);
        if (parsed?.email) {
          const emailScope = encodeURIComponent(parsed.email.trim().toLowerCase());
          if (localStorage.getItem(`${KEY_PREFIX}:${emailScope}:done`) === 'true') {
            try { localStorage.setItem(storage.done, 'true'); } catch {}
            return true;
          }
        }
      } catch {}
    }

    // 4. Check if profile data from server already indicates completed onboarding
    if (profile && typeof profile === 'object') {
      const details = profile.details && typeof profile.details === 'object' ? profile.details : {};
      const hasServerData = Boolean(
        profile.phone ||
        profile.idNumber ||
        profile.bankAccount ||
        profile.avatar ||
        details.phone ||
        details.mobilePhone ||
        details.idNumber ||
        details.docNumber ||
        details.bankAccount ||
        details.resAddress ||
        details.address ||
        details.workEmail ||
        details.employeeCode ||
        (Array.isArray(details.bankAccounts) && details.bankAccounts.length > 0) ||
        (Array.isArray(profile.bankAccounts) && profile.bankAccounts.length > 0)
      );
      if (hasServerData) {
        try {
          localStorage.setItem(storage.done, 'true');
          if (user?.email) {
            localStorage.setItem(`${KEY_PREFIX}:${encodeURIComponent(user.email.trim().toLowerCase())}:done`, 'true');
          }
        } catch {}
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export function markEmployeeOnboardingComplete(
  storage: EmployeeOnboardingStorage,
  user?: { id?: string | number; email?: string } | null
) {
  try {
    localStorage.setItem(storage.done, 'true');
    if (user?.email) {
      const emailScope = encodeURIComponent(user.email.trim().toLowerCase());
      localStorage.setItem(`${KEY_PREFIX}:${emailScope}:done`, 'true');
    }
    if (user?.id) {
      const idScope = encodeURIComponent(String(user.id).trim().toLowerCase());
      localStorage.setItem(`${KEY_PREFIX}:${idScope}:done`, 'true');
    }
    localStorage.removeItem(storage.step);
    localStorage.removeItem(storage.data);
  } catch {}
}
