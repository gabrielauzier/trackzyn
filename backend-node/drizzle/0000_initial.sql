-- Hand-written to produce exactly what backend/alembic/versions/001_initial_schema.py creates:
-- same column order, same defaults, same constraint and index names. The schema-diff job
-- (scripts/schema-diff.sh) compares pg_dump of both and fails on any difference, which is why
-- this is not the SQL drizzle-kit generates (it names foreign keys differently).
CREATE TABLE "app_settings" (
	"key" varchar(255) NOT NULL,
	"value" varchar(2000) NOT NULL,
	PRIMARY KEY ("key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"preferences" json,
	"totp_secret" varchar(32),
	"is_2fa_enabled" boolean DEFAULT false NOT NULL,
	"oidc_issuer" varchar(255),
	"oidc_subject" varchar(255),
	"id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"hashed_password" varchar(1024) NOT NULL,
	"is_active" boolean NOT NULL,
	"is_superuser" boolean NOT NULL,
	"is_verified" boolean NOT NULL,
	PRIMARY KEY ("id"),
	CONSTRAINT "uq_users_oidc_identity" UNIQUE ("oidc_issuer", "oidc_subject")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ix_users_email" ON "users" ("email");
--> statement-breakpoint
CREATE INDEX "ix_users_oidc_issuer" ON "users" ("oidc_issuer");
--> statement-breakpoint
CREATE INDEX "ix_users_oidc_subject" ON "users" ("oidc_subject");
--> statement-breakpoint
CREATE TABLE "user_passkeys" (
	"id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" varchar(512) NOT NULL,
	"public_key" text NOT NULL,
	"sign_count" integer DEFAULT 0 NOT NULL,
	"name" varchar(100) NOT NULL,
	"transports" json,
	"aaguid" varchar(64),
	"device_type" varchar(50),
	"backed_up" boolean,
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
	PRIMARY KEY ("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ix_user_passkeys_credential_id" ON "user_passkeys" ("credential_id");
--> statement-breakpoint
CREATE INDEX "ix_user_passkeys_user_id" ON "user_passkeys" ("user_id");
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_by_user_id" uuid,
	"is_archived" boolean DEFAULT false NOT NULL,
	"managed_by_user_id" uuid,
	"locale" varchar(10),
	"timezone" varchar(64),
	"icon" varchar(50),
	"color" varchar(7),
	"created_at" timestamp with time zone NOT NULL,
	FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
	FOREIGN KEY ("managed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
	PRIMARY KEY ("id")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid,
	"filename" varchar(255) NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"content_type" varchar(127) NOT NULL,
	"size" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
	FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
	PRIMARY KEY ("id"),
	UNIQUE ("storage_key")
);
--> statement-breakpoint
CREATE INDEX "ix_files_workspace_id" ON "files" ("workspace_id");
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'owner' NOT NULL,
	"invited_by_user_id" uuid,
	"joined_at" timestamp with time zone NOT NULL,
	FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
	FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
	FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
	PRIMARY KEY ("id"),
	CONSTRAINT "uq_workspace_member" UNIQUE ("workspace_id", "user_id")
);
