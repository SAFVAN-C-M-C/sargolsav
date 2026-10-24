export interface AdminIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  admin: true;
}

export type AdminAccess =
  | { status: 'authorized'; identity: AdminIdentity }
  | { status: 'forbidden' | 'unauthenticated' | 'unavailable' };

