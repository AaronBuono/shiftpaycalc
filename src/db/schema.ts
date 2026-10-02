import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { PayRules } from '@/lib/pay/rules';

// Every table has Row Level Security enabled with no policies. Supabase
// exposes the public schema through its Data API (PostgREST) using the public
// anon key; RLS with no policies makes that API return nothing. The app
// connects as the database owner, which bypasses RLS.

// ---- Better Auth tables ----

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}).enableRLS();

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
}).enableRLS();

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}).enableRLS();

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}).enableRLS();

// ---- App tables ----

/**
 * One row per user per effective date. A shift is paid with the row in effect
 * on its local start date, so past weeks keep their old rates when rates change.
 * Preferences that aren't about money (time zone, pay period, holidays) are
 * read from the latest row.
 */
export const settings = pgTable(
  'settings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    effectiveFrom: text('effective_from').notNull(), // YYYY-MM-DD
    rules: jsonb('rules').$type<PayRules>().notNull(),
    timeZone: text('time_zone').notNull().default('Australia/Melbourne'),
    state: text('state').notNull().default('VIC'),
    melbourneCup: boolean('melbourne_cup').notNull().default(true),
    periodType: text('period_type', { enum: ['weekly', 'fortnightly'] }).notNull().default('weekly'),
    periodStartDow: integer('period_start_dow').notNull().default(1),
    periodAnchorDate: text('period_anchor_date').notNull().default('2026-01-05'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('settings_user_effective').on(t.userId, t.effectiveFrom)],
).enableRLS();

export const shifts = pgTable(
  'shifts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** ICS UID for synced shifts; null for manual ones. */
    uid: text('uid'),
    source: text('source', { enum: ['synced', 'manual'] }).notNull(),
    startUtc: timestamp('start_utc', { withTimezone: true }).notNull(),
    endUtc: timestamp('end_utc', { withTimezone: true }).notNull(),
    title: text('title'),
    holidayOverride: text('holiday_override', { enum: ['auto', 'yes', 'no'] }).notNull().default('auto'),
    breakOverrideMinutes: integer('break_override_minutes'),
    /** The user changed this synced shift by hand; sync won't overwrite it. */
    editedByUser: boolean('edited_by_user').notNull().default(false),
    /** Times from the feed that differ from a hand-edited shift. */
    conflictStartUtc: timestamp('conflict_start_utc', { withTimezone: true }),
    conflictEndUtc: timestamp('conflict_end_utc', { withTimezone: true }),
    /** The user chose to keep their times over the feed's conflict times. */
    conflictDismissed: boolean('conflict_dismissed').notNull().default(false),
    /** A future synced shift that disappeared from the feed. */
    removedFromFeed: boolean('removed_from_feed').notNull().default(false),
    /** The user deleted a synced shift; kept so the next sync doesn't re-add it. */
    deletedByUser: boolean('deleted_by_user').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('shifts_user_uid').on(t.userId, t.uid),
    index('shifts_user_start').on(t.userId, t.startUtc),
  ],
).enableRLS();

export const calendarSources = pgTable('calendar_sources', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** AES-GCM encrypted webcal URL — it contains an access token. */
  encryptedUrl: text('encrypted_url').notNull(),
  lastSyncedAt: timestamp('last_synced_at'),
  lastStatus: text('last_status', { enum: ['ok', 'error'] }),
  lastError: text('last_error'),
  lastSummary: text('last_summary'),
}).enableRLS();

export const publicHolidays = pgTable(
  'public_holidays',
  {
    state: text('state').notNull(),
    date: text('date').notNull(),
    name: text('name').notNull(),
    regional: text('regional'),
  },
  (t) => [primaryKey({ columns: [t.state, t.date] })],
).enableRLS();

export const customHolidays = pgTable(
  'custom_holidays',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    name: text('name').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
).enableRLS();

export const invites = pgTable('invites', {
  token: text('token').primaryKey(),
  email: text('email').notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
}).enableRLS();
