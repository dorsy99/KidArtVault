export type UserRole = 'admin' | 'member' | 'viewer';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  totp_enabled: boolean;
  created_at?: string;
}

export interface AuthStatus {
  needs_setup: boolean;
  authenticated: boolean;
  user: User | null;
}

export interface Kid {
  id: number;
  name: string;
  birthdate: string | null;
  color: string;
  created_at: string;
  artwork_count: number;
}

export interface Artwork {
  id: string;
  kid_id: number;
  kid_name: string;
  kid_birthdate: string | null;
  kid_color: string;
  title: string;
  notes: string;
  location: string;
  tags: string[];
  artwork_date: string;
  is_favorite: boolean;
  width: number;
  height: number;
  file_size: number;
  created_at: string;
  updated_at: string;
}

export interface ShareLink {
  token: string;
  label: string;
  kid_id: number | null;
  kid_name: string | null;
  artwork_id: string | null;
  artwork_title: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface PublicShareData {
  share: {
    label: string;
    kid_name: string | null;
    expires_at: string | null;
  };
  artworks: Artwork[];
}

export const DEFAULT_LOCATIONS = [
  'Home',
  'School',
  'Kindergarten',
  'Daycare',
  'Grandparents',
  'Holiday',
];

export const DEFAULT_TAGS = [
  'A4',
  'Large Painting',
  'Animals',
  'Family',
  'Gift',
  'Birthday',
  'Nature',
  'School Project',
];

export const KID_COLORS = [
  '#f28482', // Pastel Coral
  '#7ec8a7', // Pastel Mint
  '#72b5e8', // Pastel Sky
  '#a984d4', // Pastel Lilac
  '#f6bd60', // Pastel Buttercup
  '#f4a261', // Pastel Peach
  '#84a59d', // Pastel Sage
  '#e5989b', // Pastel Rose
];
