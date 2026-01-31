CREATE TABLE "actions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"action_type" text NOT NULL,
	"target_id" text,
	"lat" real,
	"lng" real,
	"proof_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#3b82f6' NOT NULL,
	"api_key" text NOT NULL,
	"trust_score" integer DEFAULT 50 NOT NULL,
	"swarm_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_active" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agents_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
CREATE TABLE "checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"scores" text NOT NULL,
	"winner_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fields" (
	"id" text PRIMARY KEY NOT NULL,
	"node_1" text NOT NULL,
	"node_2" text NOT NULL,
	"node_3" text NOT NULL,
	"swarm_id" text,
	"influence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "join_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"swarm_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"message" text,
	"reviewed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "links" (
	"id" text PRIMARY KEY NOT NULL,
	"node_a" text NOT NULL,
	"node_b" text NOT NULL,
	"swarm_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"from_agent_id" text NOT NULL,
	"to_agent_id" text,
	"swarm_id" text,
	"content" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"city" text,
	"requested_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"discovered_by" text,
	"controlled_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swarms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#7b2cbf' NOT NULL,
	"description" text,
	"min_trust_to_join" integer DEFAULT 30 NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust_events" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"action_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"confirms" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_swarm_id_swarms_id_fk" FOREIGN KEY ("swarm_id") REFERENCES "public"."swarms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_winner_id_swarms_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."swarms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_node_1_nodes_id_fk" FOREIGN KEY ("node_1") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_node_2_nodes_id_fk" FOREIGN KEY ("node_2") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_node_3_nodes_id_fk" FOREIGN KEY ("node_3") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_swarm_id_swarms_id_fk" FOREIGN KEY ("swarm_id") REFERENCES "public"."swarms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_swarm_id_swarms_id_fk" FOREIGN KEY ("swarm_id") REFERENCES "public"."swarms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_requests" ADD CONSTRAINT "join_requests_reviewed_by_agents_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_node_a_nodes_id_fk" FOREIGN KEY ("node_a") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_node_b_nodes_id_fk" FOREIGN KEY ("node_b") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_swarm_id_swarms_id_fk" FOREIGN KEY ("swarm_id") REFERENCES "public"."swarms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_created_by_agents_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_from_agent_id_agents_id_fk" FOREIGN KEY ("from_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_to_agent_id_agents_id_fk" FOREIGN KEY ("to_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_swarm_id_swarms_id_fk" FOREIGN KEY ("swarm_id") REFERENCES "public"."swarms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_requests" ADD CONSTRAINT "node_requests_requested_by_agents_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_discovered_by_agents_id_fk" FOREIGN KEY ("discovered_by") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_controlled_by_swarms_id_fk" FOREIGN KEY ("controlled_by") REFERENCES "public"."swarms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_events" ADD CONSTRAINT "trust_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actions_status_idx" ON "actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agents_api_key_idx" ON "agents" USING btree ("api_key");--> statement-breakpoint
CREATE INDEX "join_requests_swarm_idx" ON "join_requests" USING btree ("swarm_id");--> statement-breakpoint
CREATE INDEX "join_requests_agent_idx" ON "join_requests" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "messages_to_agent_idx" ON "messages" USING btree ("to_agent_id");--> statement-breakpoint
CREATE INDEX "messages_swarm_idx" ON "messages" USING btree ("swarm_id");--> statement-breakpoint
CREATE INDEX "node_requests_location_idx" ON "node_requests" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "nodes_location_idx" ON "nodes" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "verifications_action_idx" ON "verifications" USING btree ("action_id");