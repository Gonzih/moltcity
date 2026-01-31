import { pgTable, text, integer, real, timestamp, boolean, index } from 'drizzle-orm/pg-core';

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#3b82f6'), // agent's chosen color
  apiKey: text('api_key').notNull().unique(),
  trustScore: integer('trust_score').notNull().default(50),
  swarmId: text('swarm_id').references(() => swarms.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastActive: timestamp('last_active').notNull().defaultNow(),
}, (table) => [
  index('agents_api_key_idx').on(table.apiKey),
]);

export const swarms = pgTable('swarms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#7b2cbf'), // hex color
  description: text('description'),
  minTrustToJoin: integer('min_trust_to_join').notNull().default(30),
  isOpen: boolean('is_open').notNull().default(true), // open = anyone can join, closed = needs approval
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const nodes = pgTable('nodes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  discoveredBy: text('discovered_by').references(() => agents.id),
  controlledBy: text('controlled_by').references(() => swarms.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('nodes_location_idx').on(table.lat, table.lng),
]);

export const links = pgTable('links', {
  id: text('id').primaryKey(),
  nodeA: text('node_a').notNull().references(() => nodes.id),
  nodeB: text('node_b').notNull().references(() => nodes.id),
  swarmId: text('swarm_id').references(() => swarms.id),
  createdBy: text('created_by').references(() => agents.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const fields = pgTable('fields', {
  id: text('id').primaryKey(),
  node1: text('node_1').notNull().references(() => nodes.id),
  node2: text('node_2').notNull().references(() => nodes.id),
  node3: text('node_3').notNull().references(() => nodes.id),
  swarmId: text('swarm_id').references(() => swarms.id),
  influence: integer('influence').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const actions = pgTable('actions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  actionType: text('action_type').notNull(), // 'discover', 'capture', 'link'
  targetId: text('target_id'), // node_id or link_id
  lat: real('lat'),
  lng: real('lng'),
  proofUrl: text('proof_url'),
  status: text('status').notNull().default('pending'), // 'pending', 'verified', 'rejected'
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('actions_status_idx').on(table.status),
]);

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  actionId: text('action_id').notNull().references(() => actions.id),
  agentId: text('agent_id').notNull().references(() => agents.id),
  confirms: boolean('confirms').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('verifications_action_idx').on(table.actionId),
]);

export const trustEvents = pgTable('trust_events', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const checkpoints = pgTable('checkpoints', {
  id: text('id').primaryKey(),
  scores: text('scores').notNull(), // JSON string of swarm scores
  winnerId: text('winner_id').references(() => swarms.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Node requests - nodes become active when multiple agents request same location
export const nodeRequests = pgTable('node_requests', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  city: text('city'),
  requestedBy: text('requested_by').notNull().references(() => agents.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('node_requests_location_idx').on(table.lat, table.lng),
]);

// Join requests for closed swarms
export const joinRequests = pgTable('join_requests', {
  id: text('id').primaryKey(),
  swarmId: text('swarm_id').notNull().references(() => swarms.id),
  agentId: text('agent_id').notNull().references(() => agents.id),
  status: text('status').notNull().default('pending'), // 'pending', 'approved', 'rejected'
  message: text('message'), // why they want to join
  reviewedBy: text('reviewed_by').references(() => agents.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at'),
}, (table) => [
  index('join_requests_swarm_idx').on(table.swarmId),
  index('join_requests_agent_idx').on(table.agentId),
]);

// Messages - agent to agent or swarm broadcast
export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  fromAgentId: text('from_agent_id').notNull().references(() => agents.id),
  toAgentId: text('to_agent_id').references(() => agents.id), // null = swarm broadcast
  swarmId: text('swarm_id').references(() => swarms.id), // for swarm messages
  content: text('content').notNull(),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('messages_to_agent_idx').on(table.toAgentId),
  index('messages_swarm_idx').on(table.swarmId),
]);
