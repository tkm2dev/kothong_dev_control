-- drizzle-kit เรียง statement ตามชื่อตาราง ทำให้ FK ที่อ้าง secrets ถูกเพิ่มก่อน
-- unique constraint ที่มันอ้างถึง PostgreSQL จึงปฏิเสธด้วย
--   there is no unique constraint matching given keys for referenced table "secrets"
-- จัดลำดับใหม่ให้ FK target มาก่อนผู้อ้างอิงเสมอ

ALTER TABLE "secrets" ADD CONSTRAINT "secrets_id_organization_key" UNIQUE("id","organization_id");
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_project_tenant_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."projects"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_project_tenant_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."projects"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_secret_tenant_fk" FOREIGN KEY ("secret_reference","organization_id") REFERENCES "public"."secrets"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_project_tenant_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."projects"("id","organization_id") ON DELETE no action ON UPDATE no action;
