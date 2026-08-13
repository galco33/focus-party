export const logoPositions = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

export type LogoPosition = (typeof logoPositions)[number];

type BrandingRow = {
  logo_data: ArrayBuffer;
  logo_filename: string;
  logo_position: LogoPosition;
  logo_size: number;
  updated_at: string;
};

export type Branding = {
  hasLogo: boolean;
  filename: string | null;
  position: LogoPosition;
  size: number;
  updatedAt: string | null;
};

export const defaultBranding: Branding = {
  hasLogo: false,
  filename: null,
  position: "bottom-right",
  size: 84,
  updatedAt: null,
};

export function isLogoPosition(value: string): value is LogoPosition {
  return logoPositions.includes(value as LogoPosition);
}

export async function getBrandingRow(database: D1Database, channelId: string) {
  return database.prepare(
    `SELECT logo_data, logo_filename, logo_position, logo_size, updated_at
     FROM overlay_branding WHERE channel_id = ?`,
  ).bind(channelId).first<BrandingRow>();
}

export async function getBranding(database: D1Database, channelId: string): Promise<Branding> {
  const row = await getBrandingRow(database, channelId);
  if (!row) return defaultBranding;
  return {
    hasLogo: true,
    filename: row.logo_filename,
    position: isLogoPosition(row.logo_position) ? row.logo_position : defaultBranding.position,
    size: Math.max(40, Math.min(180, row.logo_size)),
    updatedAt: row.updated_at,
  };
}

export async function saveBranding(
  database: D1Database,
  channelId: string,
  values: { data: ArrayBuffer; filename: string; position: LogoPosition; size: number },
) {
  const updatedAt = new Date().toISOString();
  await database.prepare(
    `INSERT INTO overlay_branding
     (channel_id, logo_data, logo_filename, logo_position, logo_size, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(channel_id) DO UPDATE SET
       logo_data = excluded.logo_data,
       logo_filename = excluded.logo_filename,
       logo_position = excluded.logo_position,
       logo_size = excluded.logo_size,
       updated_at = excluded.updated_at`,
  ).bind(channelId, values.data, values.filename, values.position, values.size, updatedAt).run();
  return getBranding(database, channelId);
}
